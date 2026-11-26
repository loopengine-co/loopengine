// The workspace's record of what its workflows did and what they ran
// under: one SQLite file, `<LOOPENGINE_SCHEDULER_DIR or .scheduler>/loopengine.db`,
// beside the scheduler's own files. It holds
//
// - runs: every workflow run (core/workflow-runs.ts's SqliteRunStore),
//   kept for LOOPENGINE_RETENTION_DAYS (400 by default) rather than the
//   latest 500 per agent the console lists;
// - events: what people did in or about a run (an approval decided, with
//   the tool's input before and after a change and any reason; a question
//   answered; feedback on the result), appended and never changed;
// - checkpoints and pending: turns paused on an approval or a question
//   (core/durable-approvals.ts's SqliteCheckpointStore), removed once
//   decided;
// - session_entries: every conversation's messages, in order, each with
//   when it was written (core/session-store.ts's SqliteSessionStore);
// - usage: tokens and time of every model call (core/usage.ts);
// - trace_spans and trace_prompts: each turn's trace (core/trace.ts): the
//   prompt it ran with, each model call's new input and its output, and
//   each tool call's input, output and time; system prompts kept once,
//   by hash;
// - threads and job_threads: which chat message each request or job is
//   (core/messaging/threads.ts);
// - versions: each workflow as a whole (its name, inputs, model,
//   instructions and result format; not its triggers or where its messages
//   go) and the workspace's shared policies, numbered. A new version is
//   noted whenever the text differs from the latest, however it changed:
//   saved in the console, restored, or edited in the file. Workflows were
//   once versioned by their brief alone (kind "brief"); those versions are
//   the workflow's first ones, numbers unchanged.
//
// It uses node:sqlite, built into Node 22.5 and later. Where that's
// missing, auditDb() is undefined: runs stay in JSON files and nothing is
// versioned.
import { createHash } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import { inputSchemaOf } from './input-schema.js'

export type VersionKind = 'workflow' | 'policies'

export interface Version {
  number: number
  at: string
  by?: string
  reason?: string
  content: string
}

export type AuditEventKind = 'decision' | 'answer' | 'feedback' | 'change'

export interface AuditEvent {
  id: number
  at: string
  agent: string
  workflow_id?: string
  run_id?: string
  kind: AuditEventKind
  by?: string
  data: Record<string, unknown>
  /** Its place in the hash chain: the event before's hash, and its own
   * (eventHash). */
  prev?: string
  hash?: string
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS runs (
  run_id TEXT PRIMARY KEY,
  agent TEXT NOT NULL,
  workflow_id TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  session_id TEXT NOT NULL,
  data TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS runs_agent ON runs (agent, workflow_id, started_at);
CREATE INDEX IF NOT EXISTS runs_session ON runs (session_id);
CREATE INDEX IF NOT EXISTS runs_finished ON runs (finished_at);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  agent TEXT NOT NULL,
  workflow_id TEXT,
  run_id TEXT,
  kind TEXT NOT NULL,
  by TEXT,
  data TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS events_run ON events (run_id);
CREATE INDEX IF NOT EXISTS events_workflow ON events (agent, workflow_id, at);
CREATE TABLE IF NOT EXISTS checkpoints (
  id TEXT PRIMARY KEY,
  agent TEXT NOT NULL,
  session_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  data TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS pending (
  pending_id TEXT PRIMARY KEY,
  checkpoint_id TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS pending_checkpoint ON pending (checkpoint_id);
CREATE TABLE IF NOT EXISTS threads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent TEXT NOT NULL,
  app TEXT NOT NULL,
  conversation TEXT NOT NULL,
  ts TEXT NOT NULL,
  pending_id TEXT NOT NULL,
  data TEXT NOT NULL,
  at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS threads_pending ON threads (agent, pending_id);
CREATE INDEX IF NOT EXISTS threads_message ON threads (agent, app, conversation, ts);
CREATE TABLE IF NOT EXISTS job_threads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent TEXT NOT NULL,
  app TEXT NOT NULL,
  conversation TEXT NOT NULL,
  ts TEXT NOT NULL,
  session_id TEXT NOT NULL,
  at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS job_threads_message ON job_threads (agent, app, conversation, ts);
CREATE INDEX IF NOT EXISTS job_threads_session ON job_threads (agent, session_id);
CREATE TABLE IF NOT EXISTS session_entries (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  id TEXT NOT NULL,
  parent_id TEXT,
  at TEXT NOT NULL,
  data TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS session_entries_session ON session_entries (session_id, seq);
CREATE TABLE IF NOT EXISTS usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  agent TEXT NOT NULL,
  tenant TEXT NOT NULL,
  session_id TEXT,
  provider TEXT,
  model TEXT,
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  duration_ms INTEGER
);
CREATE INDEX IF NOT EXISTS usage_session ON usage (session_id, id);
CREATE INDEX IF NOT EXISTS usage_agent ON usage (agent, at);
CREATE TABLE IF NOT EXISTS trace_spans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  at TEXT NOT NULL,
  kind TEXT NOT NULL,
  name TEXT,
  duration_ms INTEGER,
  input TEXT,
  output TEXT,
  error TEXT,
  meta TEXT
);
CREATE INDEX IF NOT EXISTS trace_spans_session ON trace_spans (session_id, id);
CREATE INDEX IF NOT EXISTS trace_spans_at ON trace_spans (at);
CREATE TABLE IF NOT EXISTS trace_prompts (
  hash TEXT PRIMARY KEY,
  text TEXT NOT NULL,
  at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS versions (
  agent TEXT NOT NULL,
  workflow_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  number INTEGER NOT NULL,
  hash TEXT NOT NULL,
  content TEXT NOT NULL,
  at TEXT NOT NULL,
  by TEXT,
  reason TEXT,
  PRIMARY KEY (agent, workflow_id, kind, number)
);
`

type Sqlite = typeof import('node:sqlite')

// node:sqlite, or undefined on a Node without it. Node 22 marks it
// experimental and says so once on load; that warning is dropped here.
function loadSqlite(): Sqlite | undefined {
  const emit = process.emitWarning
  process.emitWarning = ((warning: string | Error, ...rest: unknown[]) => {
    if (/SQLite/i.test(typeof warning === 'string' ? warning : warning.message)) return
    return (emit as (...args: unknown[]) => void).call(process, warning, ...rest)
  }) as typeof process.emitWarning
  try {
    return createRequire(import.meta.url)('node:sqlite') as Sqlite
  } catch {
    return undefined
  } finally {
    process.emitWarning = emit
  }
}

/** Opens (creating if need be) the database in `dir`. */
export function openAuditDb(dir: string): DatabaseSync | undefined {
  const sqlite = loadSqlite()
  if (!sqlite) return undefined
  mkdirSync(dir, { recursive: true })
  const db = new sqlite.DatabaseSync(path.join(dir, 'loopengine.db'))
  db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;')
  db.exec(SCHEMA)
  // Brief versions became workflow versions (same numbers, so runs that
  // name one still find it).
  db.exec("UPDATE versions SET kind = 'workflow' WHERE kind = 'brief'")
  chainEvents(db)
  return db
}

// ---------- the hash chain ----------
//
// Each event carries a hash of its own content and of the event before's
// hash, so changing or removing any event breaks every link after it
// (verifyEventChain finds where). It shows tampering, not prevents it;
// and someone who rewrites every hash after an edit isn't caught unless
// the latest hash was kept somewhere else (latestEventHash, and each
// export carries the hashes).

const GENESIS = ''

/** An event's hash: SHA-256 of the hash before it and its content. */
export function eventHash(prev: string, e: { id: number; at: string; agent: string; workflow_id?: string | null; run_id?: string | null; kind: string; by?: string | null; data: string }): string {
  const content = JSON.stringify([e.id, e.at, e.agent, e.workflow_id ?? null, e.run_id ?? null, e.kind, e.by ?? null, e.data])
  return createHash('sha256').update(prev).update('\n').update(content).digest('hex')
}

type EventRow = { id: number; at: string; agent: string; workflow_id: string | null; run_id: string | null; kind: string; by: string | null; data: string; prev: string | null; hash: string | null }

// Adds the chain's columns to a database from before them, and chains any
// event without a hash (those recorded before), in order.
function chainEvents(db: DatabaseSync): void {
  const columns = (db.prepare('PRAGMA table_info(events)').all() as { name: string }[]).map((c) => c.name)
  if (!columns.includes('hash')) {
    db.exec('ALTER TABLE events ADD COLUMN prev TEXT; ALTER TABLE events ADD COLUMN hash TEXT;')
  }
  const first = db.prepare('SELECT MIN(id) AS id FROM events WHERE hash IS NULL').get() as { id: number | null }
  if (first.id == null) return
  const before = db.prepare('SELECT hash FROM events WHERE id < ? ORDER BY id DESC LIMIT 1').get(first.id) as { hash: string | null } | undefined
  let prev = before?.hash ?? GENESIS
  const rows = db.prepare('SELECT * FROM events WHERE id >= ? ORDER BY id').all(first.id) as EventRow[]
  const set = db.prepare('UPDATE events SET prev = ?, hash = ? WHERE id = ?')
  db.exec('BEGIN')
  try {
    for (const row of rows) {
      const hash = eventHash(prev, row)
      set.run(prev, hash, row.id)
      prev = hash
    }
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
  writeMeta('events_chained', `${new Date().toISOString()} ${rows.length}`, db)
}

export interface ChainCheck {
  ok: boolean
  /** Events checked. */
  events: number
  /** The latest event, and its hash. */
  last?: { id: number; at: string; hash: string }
  /** The first place the chain is broken, and how. */
  broken?: { id: number; at?: string; problem: 'changed' | 'missing-before' }
}

/** Checks every event's hash, in order. */
export function verifyEventChain(database = auditDb()): ChainCheck {
  if (!database) return { ok: true, events: 0 }
  let prev = GENESIS
  let count = 0
  let last: ChainCheck['last']
  let after = 0
  for (;;) {
    const rows = database.prepare('SELECT * FROM events WHERE id > ? ORDER BY id LIMIT 5000').all(after) as EventRow[]
    if (!rows.length) break
    for (const row of rows) {
      if ((row.prev ?? GENESIS) !== prev) return { ok: false, events: count, broken: { id: row.id, at: row.at, problem: 'missing-before' }, ...(last ? { last } : {}) }
      const hash = eventHash(prev, row)
      if (hash !== row.hash) return { ok: false, events: count, broken: { id: row.id, at: row.at, problem: 'changed' }, ...(last ? { last } : {}) }
      prev = hash
      count++
      last = { id: row.id, at: row.at, hash }
    }
    after = rows.at(-1)!.id
  }
  return { ok: true, events: count, ...(last ? { last } : {}) }
}

/** The latest event's id and hash: written down anywhere outside the
 * workspace, it lets a later check show the log wasn't rewritten. */
export function latestEventHash(database = auditDb()): { id: number; at: string; hash: string } | undefined {
  const row = database?.prepare('SELECT id, at, hash FROM events WHERE hash IS NOT NULL ORDER BY id DESC LIMIT 1').get() as { id: number; at: string; hash: string } | undefined
  return row ? { id: Number(row.id), at: row.at, hash: row.hash } : undefined
}

let db: DatabaseSync | null | undefined

export function schedulerDir(): string {
  return process.env.LOOPENGINE_SCHEDULER_DIR || path.join(process.cwd(), '.scheduler')
}

/** The process-wide database; undefined where node:sqlite isn't there,
 * or LOOPENGINE_RUN_STORE=files asks for the JSON files. */
export function auditDb(): DatabaseSync | undefined {
  if (db === undefined) db = process.env.LOOPENGINE_RUN_STORE === 'files' ? null : (openAuditDb(schedulerDir()) ?? null)
  return db ?? undefined
}

/** A small value kept in the database's meta table (what's been
 * imported, when an alert was last sent). */
export function readMeta(key: string, database = auditDb()): string | undefined {
  const row = database?.prepare('SELECT value FROM meta WHERE key = ?').get(key) as { value: string } | undefined
  return row?.value
}

export function writeMeta(key: string, value: string, database = auditDb()): void {
  database?.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run(key, value)
}

/** Tests: use this database (or none). */
export function setAuditDb(next: DatabaseSync | undefined): void {
  db = next ?? null
}

/** How long finished runs are kept, in days. */
export function retentionDays(): number {
  const n = Number(process.env.LOOPENGINE_RETENTION_DAYS)
  return Number.isFinite(n) && n > 0 ? n : 400
}

// ---------- events ----------

/** Appends what someone did in or about a run. Never throws: the record
 * must not stop the work it records. */
export function recordEvent(event: Omit<AuditEvent, 'id' | 'at' | 'prev' | 'hash'> & { at?: string }, database = auditDb()): void {
  if (!database) return
  try {
    // Written and chained in one step, so no other event comes between.
    database.exec('BEGIN IMMEDIATE')
    try {
      const prev = (database.prepare('SELECT hash FROM events ORDER BY id DESC LIMIT 1').get() as { hash: string | null } | undefined)?.hash ?? GENESIS
      const row = { at: event.at ?? new Date().toISOString(), agent: event.agent, workflow_id: event.workflow_id ?? null, run_id: event.run_id ?? null, kind: event.kind, by: event.by ?? null, data: JSON.stringify(event.data) }
      const { lastInsertRowid } = database.prepare('INSERT INTO events (at, agent, workflow_id, run_id, kind, by, data) VALUES (?, ?, ?, ?, ?, ?, ?)').run(row.at, row.agent, row.workflow_id, row.run_id, row.kind, row.by, row.data)
      const id = Number(lastInsertRowid)
      database.prepare('UPDATE events SET prev = ?, hash = ? WHERE id = ?').run(prev, eventHash(prev, { id, ...row }), id)
      database.exec('COMMIT')
    } catch (err) {
      database.exec('ROLLBACK')
      throw err
    }
  } catch (err) {
    console.error('[loopengine] could not record an audit event:', err)
  }
}

/** A run's events, oldest first. */
export function runEvents(runId: string, database = auditDb()): AuditEvent[] {
  if (!database) return []
  return (database.prepare('SELECT * FROM events WHERE run_id = ? ORDER BY id').all(runId) as Record<string, unknown>[]).map(eventOf)
}

export interface EventFilter {
  agent?: string
  /** Only these agents' events (a person limited to some agents). */
  agents?: string[]
  workflowId?: string
  kind?: AuditEventKind
  by?: string
  /** ISO times, inclusive. */
  since?: string
  until?: string
  /** Text anywhere in the event. */
  q?: string
  /** Events older than this id (the next page). */
  before?: number
  limit?: number
}

/** Events matching the filter, newest first, at most 500. */
export function listEvents(filter: EventFilter = {}, database = auditDb()): AuditEvent[] {
  if (!database) return []
  const where: string[] = []
  const args: (string | number)[] = []
  const add = (clause: string, ...values: (string | number)[]) => {
    where.push(clause)
    args.push(...values)
  }
  if (filter.agent) add('agent = ?', filter.agent)
  if (filter.agents) add(`agent IN (${filter.agents.map(() => '?').join(', ') || "''"})`, ...filter.agents)
  if (filter.workflowId) add('workflow_id = ?', filter.workflowId)
  if (filter.kind) add('kind = ?', filter.kind)
  if (filter.by) add('by = ?', filter.by)
  if (filter.since) add('at >= ?', filter.since)
  if (filter.until) add('at <= ?', filter.until)
  if (filter.before) add('id < ?', filter.before)
  if (filter.q) add("(data LIKE ? ESCAPE '\\' OR by LIKE ? ESCAPE '\\')", ...Array(2).fill(`%${filter.q.replace(/[\\%_]/g, (c) => '\\' + c)}%`))
  const limit = Math.min(Math.max(filter.limit ?? 100, 1), 500)
  const sql = `SELECT * FROM events${where.length ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY id DESC LIMIT ${limit}`
  return (database.prepare(sql).all(...args) as Record<string, unknown>[]).map(eventOf)
}

/** Everyone named on an event, most recent first (for a filter). */
export function eventPeople(limit = 200, database = auditDb()): string[] {
  if (!database) return []
  const rows = database.prepare('SELECT by, MAX(id) AS last FROM events WHERE by IS NOT NULL GROUP BY by ORDER BY last DESC LIMIT ?').all(limit) as { by: string }[]
  return rows.map((r) => r.by)
}

function eventOf(r: Record<string, unknown>): AuditEvent {
  return {
    id: Number(r.id),
    at: String(r.at),
    agent: String(r.agent),
    ...(r.workflow_id ? { workflow_id: String(r.workflow_id) } : {}),
    ...(r.run_id ? { run_id: String(r.run_id) } : {}),
    kind: String(r.kind) as AuditEventKind,
    ...(r.by ? { by: String(r.by) } : {}),
    data: JSON.parse(String(r.data)) as Record<string, unknown>,
    ...(r.prev != null ? { prev: String(r.prev) } : {}),
    ...(r.hash ? { hash: String(r.hash) } : {}),
  }
}

// ---------- traces ----------

/** One step of a turn's trace: the prompt it ran with ("prompt"), a model
 * call ("llm"), or a tool call ("tool"). Input and output are what was
 * sent and what came back, as JSON values. */
export interface TraceSpan {
  id: number
  sessionId: string
  at: string
  kind: 'prompt' | 'llm' | 'tool'
  name?: string
  durationMs?: number
  input?: unknown
  output?: unknown
  error?: string
  meta?: Record<string, unknown>
}

// A field longer than this is cut, so one huge tool result can't swell the
// database; the cut says how much was left out.
const MAX_TRACE_FIELD = 100_000

function traceJson(value: unknown): string | null {
  if (value === undefined) return null
  const text = JSON.stringify(value)
  if (text.length <= MAX_TRACE_FIELD) return text
  return JSON.stringify({ truncated: true, chars: text.length, start: text.slice(0, MAX_TRACE_FIELD) })
}

/** Keeps a system prompt once, by its hash, and returns the hash. */
export function recordTracePrompt(text: string, database = auditDb()): string | undefined {
  if (!database) return undefined
  try {
    const hash = hashOf(text)
    database.prepare('INSERT OR IGNORE INTO trace_prompts (hash, text, at) VALUES (?, ?, ?)').run(hash, text, new Date().toISOString())
    return hash
  } catch (err) {
    console.error('[loopengine] could not keep a trace prompt:', err)
    return undefined
  }
}

/** Appends a step to a turn's trace. Never throws: the trace must not stop
 * the work it records. */
export function recordTraceSpan(span: Omit<TraceSpan, 'id'>, database = auditDb()): void {
  if (!database) return
  try {
    database.prepare('INSERT INTO trace_spans (session_id, at, kind, name, duration_ms, input, output, error, meta) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
      span.sessionId, span.at, span.kind, span.name ?? null, span.durationMs ?? null,
      traceJson(span.input), traceJson(span.output), span.error ?? null, span.meta ? JSON.stringify(span.meta) : null,
    )
  } catch (err) {
    console.error('[loopengine] could not record a trace step:', err)
  }
}

/** A session's trace, oldest first; each prompt step carries its system
 * prompt's text (as input.system). */
export function listTraceSpans(sessionId: string, database = auditDb()): TraceSpan[] {
  if (!database) return []
  const rows = database.prepare('SELECT * FROM trace_spans WHERE session_id = ? ORDER BY id').all(sessionId) as Record<string, unknown>[]
  const prompts = new Map<string, string>()
  const promptText = (hash: string) => {
    if (!prompts.has(hash)) prompts.set(hash, String((database.prepare('SELECT text FROM trace_prompts WHERE hash = ?').get(hash) as { text?: string } | undefined)?.text ?? ''))
    return prompts.get(hash)!
  }
  const parse = (v: unknown) => (v == null ? undefined : JSON.parse(String(v)))
  return rows.map((r) => {
    let input = parse(r.input)
    if (r.kind === 'prompt' && input && typeof input === 'object' && typeof (input as { systemHash?: unknown }).systemHash === 'string') {
      const { systemHash, ...rest } = input as { systemHash: string }
      input = { system: promptText(systemHash), ...rest }
    }
    return {
      id: Number(r.id),
      sessionId: String(r.session_id),
      at: String(r.at),
      kind: String(r.kind) as TraceSpan['kind'],
      ...(r.name != null ? { name: String(r.name) } : {}),
      ...(r.duration_ms != null ? { durationMs: Number(r.duration_ms) } : {}),
      ...(input !== undefined ? { input } : {}),
      ...(r.output != null ? { output: parse(r.output) } : {}),
      ...(r.error != null ? { error: String(r.error) } : {}),
      ...(r.meta != null ? { meta: JSON.parse(String(r.meta)) as Record<string, unknown> } : {}),
    }
  })
}

/** At most hourly: trace steps older than the retention period, and the
 * system prompts no step uses any more. */
let lastTracePrune = 0
export function pruneTraces(database = auditDb()): void {
  if (!database || Date.now() - lastTracePrune < 60 * 60 * 1000) return
  lastTracePrune = Date.now()
  try {
    const before = new Date(Date.now() - retentionDays() * 24 * 60 * 60 * 1000).toISOString()
    database.prepare('DELETE FROM trace_spans WHERE at < ?').run(before)
    database.prepare("DELETE FROM trace_prompts WHERE at < ? AND hash NOT IN (SELECT json_extract(input, '$.systemHash') FROM trace_spans WHERE kind = 'prompt' AND input IS NOT NULL)").run(before)
  } catch (err) {
    console.error('[loopengine] could not prune old traces:', err)
  }
}

// ---------- versions ----------

const hashOf = (content: string): string => createHash('sha256').update(content).digest('hex')

/** The version number of `content`: the latest version's when it's the
 * same text, else a new version noted now. Undefined without a database.
 * `agent` and `workflowId` are '' for the workspace's policies. */
export function noteVersion(
  key: { agent: string; workflowId: string; kind: VersionKind },
  content: string,
  about: { by?: string; reason?: string } = {},
  database = auditDb(),
): number | undefined {
  if (!database) return undefined
  try {
    const hash = hashOf(content)
    const latest = database.prepare('SELECT number, hash FROM versions WHERE agent = ? AND workflow_id = ? AND kind = ? ORDER BY number DESC LIMIT 1')
      .get(key.agent, key.workflowId, key.kind) as { number: number; hash: string } | undefined
    if (latest && latest.hash === hash) return Number(latest.number)
    const number = (latest ? Number(latest.number) : 0) + 1
    database.prepare('INSERT INTO versions (agent, workflow_id, kind, number, hash, content, at, by, reason) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
      key.agent, key.workflowId, key.kind, number, hash, content, new Date().toISOString(),
      about.by ?? null, about.reason ?? (latest ? 'Changed outside the console' : 'First version'),
    )
    return number
  } catch (err) {
    console.error('[loopengine] could not note a version:', err)
    return undefined
  }
}

/** Every version, newest first. */
export function listVersions(key: { agent: string; workflowId: string; kind: VersionKind }, database = auditDb()): Version[] {
  if (!database) return []
  const rows = database.prepare('SELECT number, at, by, reason, content FROM versions WHERE agent = ? AND workflow_id = ? AND kind = ? ORDER BY number DESC')
    .all(key.agent, key.workflowId, key.kind) as Record<string, unknown>[]
  return rows.map((r) => ({
    number: Number(r.number),
    at: String(r.at),
    ...(r.by ? { by: String(r.by) } : {}),
    ...(r.reason ? { reason: String(r.reason) } : {}),
    content: String(r.content),
  }))
}

export function getVersion(key: { agent: string; workflowId: string; kind: VersionKind }, number: number, database = auditDb()): Version | undefined {
  return listVersions(key, database).find((v) => v.number === number)
}

/** What a workflow version holds, as text people can read and compare
 * line by line: which workflow it is, its name and description, its input
 * schema, model, the tools it uses with each one's permission, its success
 * criteria, its output schema, its instructions and its result format.
 * What starts it (schedules, webhooks) and where its messages go aren't
 * part of it: they change straight away, recorded in the change log. */
export interface WorkflowSnapshot {
  agent: string
  workflowId: string
  title: string
  description: string
  /** Each input: what it is, whether it's required, and any type and
   * limits (core/input-schema.ts). */
  parameters: Record<string, { description: string; required: boolean; [limit: string]: unknown }>
  model?: { provider: string; model: string }
  /** The agent's tools its instructions name, each with its permission
   * (allow, ask or deny): the workflow's contract. */
  tools: { name: string; permission: string }[]
  criteria: { text: string; kind: string; value?: string }[]
  instructions: string
  output?: string
  /** The JSON Schema its result must match (core/output-schema.ts). */
  outputSchema?: Record<string, unknown>
  /** Its inputs as one JSON Schema, as the version holds them (read
   * back from a version; made from `parameters` when one is written). */
  inputSchema?: Record<string, unknown>
}

const INSTRUCTIONS_HEADING = '\n## Instructions\n\n'
const RESULT_HEADING = '\n\n## Result format\n\n'

export function workflowContent(w: WorkflowSnapshot): string {
  const line = (text: string) => text.replace(/\s+/g, ' ').trim()
  const list = (items: string[]) => (items.length ? items.join('\n') : 'None')
  const json = (schema: unknown) => `\`\`\`json\n${JSON.stringify(schema, null, 2)}\n\`\`\``
  const criteria = w.criteria.map((c) => `- [${c.kind}${c.value !== undefined ? `: ${JSON.stringify(c.value)}` : ''}] ${line(c.text)}`)
  const head = `# ${line(w.title)}` +
    (line(w.description) ? `\n\n${line(w.description)}` : '') +
    `\n\n## Workflow\n\n${w.agent}/${w.workflowId}` +
    `\n\n## Input schema\n\n${json(inputSchemaOf(w.parameters as Parameters<typeof inputSchemaOf>[0]))}` +
    `\n\n## Model\n\n${w.model ? `${w.model.provider}/${w.model.model}` : "The agent's"}` +
    `\n\n## Tools\n\n${list(w.tools.map((t) => `- ${t.name}: ${t.permission}`))}` +
    `\n\n## Success criteria\n\n${list(criteria)}` +
    `\n\n## Output schema\n\n${w.outputSchema ? json(w.outputSchema) : 'None'}\n`
  return head + INSTRUCTIONS_HEADING + w.instructions + (w.output?.trim() ? RESULT_HEADING + w.output.trim() : '')
}

/** A version's text without the schedules and webhooks that started the
 * workflow, which versions held until they became settings that change
 * straight away: the same workflow with only that dropped is the same
 * version, not a new one. */
export function withoutTriggers(content: string): string {
  const at = content.indexOf(INSTRUCTIONS_HEADING)
  if (at < 0) return content
  return content.slice(0, at).replace(/\n\n## Triggers\n\n[\s\S]*?(?=\n\n## )/, '') + content.slice(at)
}

/** A section's ```json block, parsed. */
function jsonBlock(text: string | undefined): Record<string, unknown> | undefined {
  const json = text?.match(/^```json\n([\s\S]*)\n```$/)?.[1]
  if (!json) return undefined
  try {
    return JSON.parse(json) as Record<string, unknown>
  } catch {
    return undefined
  }
}

/** A workflow's inputs, from its input schema (inputSchemaOf's): each
 * property's description, whether it's required, and its type and
 * limits (a text input's "string" type left out, as it's saved). */
function parametersFromSchema(schema: Record<string, unknown>): WorkflowSnapshot['parameters'] {
  const required = new Set(Array.isArray(schema.required) ? (schema.required as string[]) : [])
  const properties = (schema.properties && typeof schema.properties === 'object' ? schema.properties : {}) as Record<string, Record<string, unknown>>
  return Object.fromEntries(Object.entries(properties).map(([name, prop]) => {
    const { description, type, ...spec } = prop
    return [name, { description: typeof description === 'string' ? description : '', required: required.has(name), ...(type && type !== 'string' ? { type } : {}), ...spec }]
  }))
}

/** What a version holds. Older versions hold less: one from when only
 * the brief was numbered has just the instructions and result format;
 * one from before tools and criteria were part of it has no such
 * sections, and none comes back. The schedules and webhooks older
 * versions held are left out. */
export function workflowFromContent(content: string): Partial<WorkflowSnapshot> & { instructions: string } {
  const split = (body: string) => {
    const at = body.lastIndexOf(RESULT_HEADING)
    return at < 0 ? { instructions: body } : { instructions: body.slice(0, at), output: body.slice(at + RESULT_HEADING.length) }
  }
  const at = content.indexOf(INSTRUCTIONS_HEADING)
  if (!content.startsWith('# ') || at < 0) return split(content)
  const head = content.slice(0, at)
  const section = (name: string): string | undefined => head.match(new RegExp(`\\n## ${name}\\n\\n([\\s\\S]*?)(?=\\n## |$)`))?.[1]?.trim()
  const lines = (name: string) => (section(name) ?? '').split('\n').filter((l) => l.startsWith('- ')).map((l) => l.slice(2))
  const firstLines = head.split('\n## ')[0]!.split('\n').filter((l) => l.trim())
  const inputSchema = jsonBlock(section('Input schema'))
  const outputSchema = jsonBlock(section('Output schema'))
  const model = (section('Model') ?? '').match(/^([a-z0-9-]+)\/(.+)$/)
  const which = (section('Workflow') ?? '').match(/^([^/\s]+)\/(\S+)$/)
  const criteria = section('Success criteria') === undefined ? undefined : lines('Success criteria').flatMap((l) => {
    const m = l.match(/^\[([a-z_]+)(?:: (".*"))?\] (.*)$/)
    if (!m) return []
    let value: string | undefined
    try {
      value = m[2] ? String(JSON.parse(m[2])) : undefined
    } catch {
      value = m[2]
    }
    return [{ kind: m[1]!, text: m[3]!, ...(value !== undefined ? { value } : {}) }]
  })
  return {
    ...(which ? { agent: which[1]!, workflowId: which[2]! } : {}),
    title: firstLines[0]!.slice(2).trim(),
    description: firstLines.slice(1).join(' ').trim(),
    parameters: inputSchema ? parametersFromSchema(inputSchema) : {},
    ...(inputSchema ? { inputSchema } : {}),
    ...(model ? { model: { provider: model[1]!, model: model[2]! } } : {}),
    ...(section('Tools') !== undefined ? { tools: lines('Tools').flatMap((l) => { const m = l.match(/^(.+): (\S+)$/); return m ? [{ name: m[1]!, permission: m[2]! }] : [] }) } : {}),
    ...(criteria ? { criteria } : {}),
    ...(outputSchema ? { outputSchema } : {}),
    ...split(content.slice(at + INSTRUCTIONS_HEADING.length)),
  }
}
