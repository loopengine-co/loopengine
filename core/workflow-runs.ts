// Workflow runs: started by hand or by an app (Run now in the console, or
// POST /agents/:name/workflows/:id/run), or by a schedule that runs the
// workflow. Each is a record of its own here, so a workflow has one
// history of every run whatever started it, the Schedules tab only lists
// what is set to run, and each run can be looked up by its id afterwards
// (GET /agents/:name/runs/:id).
//
// A run executes the same way a scheduled task fires (supplied by the
// server, adapters/http.ts): an unattended agent turn whose approvals and
// questions go to the agent's messaging app and wait durably (or, for a
// run started with "decisions": "callback", only to its callback_url). A
// run that pauses there is settled by settleFromResume once someone
// decides.
//
// Stored in the workspace's database (core/audit-store.ts), kept for
// its retention period; the console lists each agent's latest
// MAX_FINISHED_PER_AGENT finished runs. Where there's no database (no
// node:sqlite), one JSON file per run under
// `<LOOPENGINE_SCHEDULER_DIR or .scheduler>/runs/`, keeping only those.
// Runs already in files are copied into the database once.
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import { auditDb, recordEvent, retentionDays, schedulerDir } from './audit-store.js'
import { KeyedMutex } from './session-store.js'
import type { CallbackDelivery } from './run-callbacks.js'

export type WorkflowRunStatus = 'running' | 'awaiting_approval' | 'done' | 'error'

export interface WorkflowRun {
  run_id: string
  agent: string
  workflow_id: string
  params?: Record<string, string>
  /** Who started it: the console's Run now, an app over the API, a
   * schedule, an outside service through a webhook trigger, a goal's
   * one-off job assigned to the agent (workflow_id is then empty), or
   * another run it follows in a job's chain. */
  source: 'console' | 'api' | 'schedule' | 'webhook' | 'assignment' | 'chain'
  /** For an assignment or a chained run: the goal and the job it's for. */
  job?: { goal: string; job: string }
  /** For a chained run: the run it follows, and how many runs came before
   * it in the chain (1 for the step after the first run). */
  chained_from?: string
  chain_depth?: number
  /** The webhook trigger that started it, for source "webhook"
   * (core/workflow-triggers.ts). */
  trigger_id?: string
  /** The schedule that started it, for source "schedule". */
  task_id?: string
  task_name?: string
  status: WorkflowRunStatus
  started_at: string
  finished_at?: string
  /** The message it started with: the workflow's start message and steps. */
  message: string
  session_id: string
  /** The agent's final reply, when done. */
  result?: string
  error?: string
  /** The approvals or questions it is waiting on. */
  pending_ids?: string[]
  /** Send its result to the agent's messaging app when it ends. */
  result_to_chat?: boolean
  /** The old name of result_to_chat, on runs recorded before it. */
  notify?: boolean
  /** Where its record is posted when it starts (with decisions_to), stops
   * for a decision, ends or fails (core/run-callbacks.ts). */
  callback_url?: string
  /** "callback": its approvals and questions go only to callback_url,
   * never to the agent's messaging app, and the app that gets them
   * answers through the API. */
  decisions_to?: 'callback'
  /** A message posted to the agent's messaging app when it starts. */
  chat_notice?: string
  /** Something asked for that couldn't be done, e.g. a chat notice with
   * no messaging app set up. The run goes ahead without it. */
  warnings?: string[]
  /** Each callback delivery, oldest first (the latest 10). */
  callbacks?: CallbackDelivery[]
  /** The brief and shared policies it ran under (core/audit-store.ts's
   * versions), when the workspace keeps versions. */
  versions?: RunVersions
  /** Each approval decided while it ran, oldest first, with who decided
   * (an email, or a chat name) when known. */
  decisions?: RunDecision[]
  /** Each question it asked that was answered, oldest first. */
  answers?: { question: string; answer: string; at: string; by?: string }[]
  /** What the app or person reported after it ended
   * (POST /agents/:name/runs/:id/feedback): the text actually used, how
   * much it was edited from the result, and a verdict. */
  feedback?: RunFeedback
}

export interface RunVersions {
  brief?: number
  policies?: number
}

export interface RunDecision {
  tool: string
  approved: boolean
  at: string
  by?: string
  edited?: boolean
  /** For an approval changed before it ran: the input the agent asked
   * for, and what ran instead. */
  before?: unknown
  after?: unknown
  /** Why it was denied, when the person said. */
  reason?: string
}

export interface RunFeedback {
  verdict?: 'good' | 'bad'
  /** How far the text actually used is from the result. */
  edit?: 'none' | 'light' | 'heavy'
  final?: string
  note?: string
  at: string
}

export type RunOutcome = { kind: 'done'; text: string } | { kind: 'pending'; pendingIds: string[] }

/** Runs the agent once: what a scheduled task's fire does. A workflow's
 * run says which workflow, for its own model. */
export type ExecuteRun = (agent: string, message: string, sessionId: string, options?: { workflowId?: string; decisionsTo?: 'callback' }) => Promise<RunOutcome>

const MAX_FINISHED_PER_AGENT = 500
const SESSION_PREFIX = 'run-'
/** A scheduled task's sessions (core/scheduler.ts). */
const SCHEDULE_SESSION_PREFIX = 'sched-'

export class RunError extends Error {}

// ---------- store ----------

export interface RunStore {
  list(): Promise<WorkflowRun[]>
  get(runId: string): Promise<WorkflowRun | undefined>
  put(run: WorkflowRun): Promise<void>
  remove(runId: string): Promise<void>
  update(runId: string, fn: (run: WorkflowRun | undefined) => WorkflowRun | undefined): Promise<WorkflowRun | undefined>
  /** An agent's runs, newest first, without reading every run. */
  forAgent?(agent: string, filter: { workflowId?: string; limit?: number }): Promise<WorkflowRun[]>
  /** The run with this session, without reading every run. */
  bySession?(sessionId: string): Promise<WorkflowRun | undefined>
  /** Drops what's past keeping, instead of the runner's per-agent cap. */
  prune?(): Promise<void>
}

const fileMutex = new KeyedMutex()

/** One JSON file per run under `<dir>/runs/` — one server process. */
export class FileRunStore implements RunStore {
  private readonly dir: string

  constructor(dir: string) {
    this.dir = path.join(dir, 'runs')
  }

  private file(runId: string): string {
    if (!/^[A-Za-z0-9_-]+$/.test(runId)) throw new RunError(`invalid run id "${runId}"`)
    return path.join(this.dir, `${runId}.json`)
  }

  async list(): Promise<WorkflowRun[]> {
    if (!existsSync(this.dir)) return []
    const runs: WorkflowRun[] = []
    for (const name of readdirSync(this.dir)) {
      if (!name.endsWith('.json')) continue
      try {
        runs.push(JSON.parse(readFileSync(path.join(this.dir, name), 'utf8')) as WorkflowRun)
      } catch {
        // A file being written, or not a run: skip it.
      }
    }
    return runs.sort((a, b) => b.started_at.localeCompare(a.started_at))
  }

  async get(runId: string): Promise<WorkflowRun | undefined> {
    const file = this.file(runId)
    return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as WorkflowRun) : undefined
  }

  async put(run: WorkflowRun): Promise<void> {
    mkdirSync(this.dir, { recursive: true })
    const file = this.file(run.run_id)
    writeFileSync(file + '.tmp', JSON.stringify(run, null, 2))
    renameSync(file + '.tmp', file)
  }

  async remove(runId: string): Promise<void> {
    rmSync(this.file(runId), { force: true })
  }

  async update(runId: string, fn: (run: WorkflowRun | undefined) => WorkflowRun | undefined): Promise<WorkflowRun | undefined> {
    return fileMutex.run(runId, async () => {
      const next = fn(await this.get(runId))
      if (next) await this.put(next)
      return next
    })
  }
}

const UNDER_WAY = "('running', 'awaiting_approval')"

/** Runs in the workspace's database (core/audit-store.ts). list() is what
 * the console shows: every run under way, and each agent's latest
 * `listed` finished ones; older runs stay until the retention period
 * ends. */
export class SqliteRunStore implements RunStore {
  private readonly db: DatabaseSync
  private readonly listed: number
  private lastPrune = 0

  /** `importFrom`: a scheduler folder whose runs/ JSON files are copied in
   * the first time. */
  constructor(db: DatabaseSync, options: { importFrom?: string; listed?: number } = {}) {
    this.db = db
    this.listed = options.listed ?? MAX_FINISHED_PER_AGENT
    if (options.importFrom) this.importFiles(options.importFrom)
  }

  private importFiles(dir: string): void {
    const done = this.db.prepare("SELECT value FROM meta WHERE key = 'runs_imported'").get()
    if (done) return
    const runsDir = path.join(dir, 'runs')
    let count = 0
    if (existsSync(runsDir)) {
      this.db.exec('BEGIN')
      try {
        for (const name of readdirSync(runsDir)) {
          if (!name.endsWith('.json')) continue
          try {
            const run = JSON.parse(readFileSync(path.join(runsDir, name), 'utf8')) as WorkflowRun
            if (run.run_id && run.agent) {
              this.write(run, 'OR IGNORE')
              count++
            }
          } catch {
            // Not a run: skip it.
          }
        }
        this.db.exec('COMMIT')
      } catch (err) {
        this.db.exec('ROLLBACK')
        throw err
      }
    }
    // The files stay, untouched, as they were.
    this.db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('runs_imported', ?)").run(`${new Date().toISOString()} ${count}`)
  }

  private write(run: WorkflowRun, conflict: 'OR REPLACE' | 'OR IGNORE' = 'OR REPLACE'): void {
    this.db.prepare(`INSERT ${conflict} INTO runs (run_id, agent, workflow_id, status, started_at, finished_at, session_id, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(run.run_id, run.agent, run.workflow_id ?? '', run.status, run.started_at, run.finished_at ?? null, run.session_id ?? '', JSON.stringify(run))
  }

  private read(row: unknown): WorkflowRun {
    return JSON.parse(String((row as { data: string }).data)) as WorkflowRun
  }

  async list(): Promise<WorkflowRun[]> {
    const rows = this.db.prepare(`
      SELECT data, started_at FROM runs WHERE status IN ${UNDER_WAY}
      UNION ALL
      SELECT data, started_at FROM (
        SELECT data, started_at, ROW_NUMBER() OVER (PARTITION BY agent ORDER BY started_at DESC) AS n
        FROM runs WHERE status NOT IN ${UNDER_WAY}
      ) WHERE n <= ?
      ORDER BY started_at DESC`).all(this.listed)
    return rows.map((r) => this.read(r))
  }

  async forAgent(agent: string, filter: { workflowId?: string; limit?: number }): Promise<WorkflowRun[]> {
    const limit = Math.min(filter.limit ?? this.listed, this.listed)
    const rows = filter.workflowId
      ? this.db.prepare('SELECT data FROM runs WHERE agent = ? AND workflow_id = ? ORDER BY started_at DESC LIMIT ?').all(agent, filter.workflowId, limit)
      : this.db.prepare('SELECT data FROM runs WHERE agent = ? ORDER BY started_at DESC LIMIT ?').all(agent, limit)
    return rows.map((r) => this.read(r))
  }

  async bySession(sessionId: string): Promise<WorkflowRun | undefined> {
    const row = this.db.prepare('SELECT data FROM runs WHERE session_id = ? ORDER BY started_at DESC LIMIT 1').get(sessionId)
    return row ? this.read(row) : undefined
  }

  async get(runId: string): Promise<WorkflowRun | undefined> {
    const row = this.db.prepare('SELECT data FROM runs WHERE run_id = ?').get(runId)
    return row ? this.read(row) : undefined
  }

  async put(run: WorkflowRun): Promise<void> {
    this.write(run)
  }

  async remove(runId: string): Promise<void> {
    this.db.prepare('DELETE FROM runs WHERE run_id = ?').run(runId)
  }

  // node:sqlite is synchronous, so read-change-write here can't interleave.
  async update(runId: string, fn: (run: WorkflowRun | undefined) => WorkflowRun | undefined): Promise<WorkflowRun | undefined> {
    const next = fn(await this.get(runId))
    if (next) this.write(next)
    return next
  }

  /** At most hourly: runs finished before the retention period. */
  async prune(): Promise<void> {
    if (Date.now() - this.lastPrune < 60 * 60 * 1000) return
    this.lastPrune = Date.now()
    const before = new Date(Date.now() - retentionDays() * 24 * 60 * 60 * 1000).toISOString()
    this.db.prepare(`DELETE FROM runs WHERE status NOT IN ${UNDER_WAY} AND COALESCE(finished_at, started_at) < ?`).run(before)
  }
}

let store: RunStore | undefined

/** The process-wide store: the workspace's database, or JSON files in
 * `runs/` in the scheduler's folder where there's none. */
export function getRunStore(): RunStore {
  if (!store) {
    const db = auditDb()
    store = db ? new SqliteRunStore(db, { importFrom: schedulerDir() }) : new FileRunStore(schedulerDir())
  }
  return store
}

export function setRunStore(next: RunStore): void {
  store = next
}

// ---------- reading ----------

/** An agent's runs, newest first; of one workflow when `workflowId` is given. */
export async function listRuns(agent: string, filter: { workflowId?: string; limit?: number } = {}): Promise<WorkflowRun[]> {
  const store = getRunStore()
  if (store.forAgent) return store.forAgent(agent, filter)
  const runs = (await getRunStore().list()).filter((r) => r.agent === agent && (!filter.workflowId || r.workflow_id === filter.workflowId))
  return filter.limit ? runs.slice(0, filter.limit) : runs
}

/** One of an agent's runs; undefined for another agent's. */
export async function getRun(agent: string, runId: string): Promise<WorkflowRun | undefined> {
  if (!/^[A-Za-z0-9_-]+$/.test(runId)) return undefined
  const run = await getRunStore().get(runId)
  return run && run.agent === agent ? run : undefined
}

export function isUnderWay(run: WorkflowRun): boolean {
  return run.status === 'running' || run.status === 'awaiting_approval'
}

// ---------- running ----------

export interface StartRunInput {
  agent: string
  workflow_id: string
  params?: Record<string, string>
  source: WorkflowRun['source']
  message: string
  result_to_chat?: boolean
  callback_url?: string
  decisions_to?: 'callback'
  chat_notice?: string
  warnings?: string[]
  trigger_id?: string
  job?: { goal: string; job: string }
  chained_from?: string
  chain_depth?: number
}

export class WorkflowRunner {
  private readonly execute: ExecuteRun
  private readonly maxFinishedPerAgent: number
  private readonly onChange?: (run: WorkflowRun) => void | Promise<void>
  private readonly versionsFor?: (agent: string, workflowId: string) => RunVersions | undefined
  private readonly inFlight = new Set<Promise<void>>()

  /** `onChange`: called with the run when it starts, and each time it
   * finishes, fails or stops for a decision (the server sends its chat
   * messages and callbacks). `versionsFor`: the brief and policies
   * versions a run of this workflow starts under. */
  constructor(options: { execute: ExecuteRun; maxFinishedPerAgent?: number; onChange?: (run: WorkflowRun) => void | Promise<void>; versionsFor?: (agent: string, workflowId: string) => RunVersions | undefined }) {
    this.execute = options.execute
    this.maxFinishedPerAgent = options.maxFinishedPerAgent ?? MAX_FINISHED_PER_AGENT
    this.onChange = options.onChange
    this.versionsFor = options.versionsFor
  }

  private versionsOf(agent: string, workflowId: string): { versions?: RunVersions } {
    if (!this.versionsFor || !workflowId) return {}
    try {
      const versions = this.versionsFor(agent, workflowId)
      return versions && (versions.brief || versions.policies) ? { versions } : {}
    } catch (err) {
      console.error('[loopengine] could not note the versions a run starts under:', err)
      return {}
    }
  }

  private changed(run: WorkflowRun | undefined): void {
    if (!run || !this.onChange) return
    void Promise.resolve()
      .then(() => this.onChange!(run))
      .catch((err) => console.error(`[loopengine] reporting run ${run.run_id} failed:`, err))
  }

  /** Records a run and starts it; returns at once with the record. */
  async start(input: StartRunInput): Promise<WorkflowRun> {
    const runId = randomUUID()
    const run: WorkflowRun = {
      run_id: runId,
      agent: input.agent,
      workflow_id: input.workflow_id,
      ...(input.params && Object.keys(input.params).length ? { params: input.params } : {}),
      source: input.source,
      ...(input.result_to_chat ? { result_to_chat: true } : {}),
      ...(input.callback_url ? { callback_url: input.callback_url } : {}),
      ...(input.decisions_to ? { decisions_to: input.decisions_to } : {}),
      ...(input.chat_notice ? { chat_notice: input.chat_notice } : {}),
      ...(input.warnings?.length ? { warnings: input.warnings } : {}),
      ...(input.trigger_id ? { trigger_id: input.trigger_id } : {}),
      ...(input.job ? { job: input.job } : {}),
      ...(input.chained_from ? { chained_from: input.chained_from, chain_depth: input.chain_depth ?? 1 } : {}),
      ...this.versionsOf(input.agent, input.workflow_id),
      status: 'running',
      started_at: new Date().toISOString(),
      message: input.message,
      session_id: `${SESSION_PREFIX}${runId.slice(0, 8)}-${Date.now().toString(36)}`,
    }
    await getRunStore().put(run)
    await this.prune(input.agent)
    this.changed(run)
    const job = this.run(run).finally(() => this.inFlight.delete(job))
    this.inFlight.add(job)
    return run
  }

  /** A schedule firing one of its agent's workflows (the scheduler's fire,
   * for a workflow task): recorded as a run of the workflow, then run the
   * usual way. Returns the outcome for the scheduler, and throws what the
   * run threw, so the schedule's own history records it too. */
  async runForSchedule(input: { agent: string; workflow_id: string; params?: Record<string, string>; task_id: string; task_name?: string; message: string; session_id: string } & Pick<StartRunInput, 'result_to_chat' | 'callback_url' | 'decisions_to' | 'chat_notice' | 'warnings'>): Promise<RunOutcome> {
    const run: WorkflowRun = {
      run_id: randomUUID(),
      agent: input.agent,
      workflow_id: input.workflow_id,
      ...(input.params && Object.keys(input.params).length ? { params: input.params } : {}),
      source: 'schedule',
      task_id: input.task_id,
      ...(input.task_name ? { task_name: input.task_name } : {}),
      ...(input.result_to_chat ? { result_to_chat: true } : {}),
      ...(input.callback_url ? { callback_url: input.callback_url } : {}),
      ...(input.decisions_to ? { decisions_to: input.decisions_to } : {}),
      ...(input.chat_notice ? { chat_notice: input.chat_notice } : {}),
      ...(input.warnings?.length ? { warnings: input.warnings } : {}),
      ...this.versionsOf(input.agent, input.workflow_id),
      status: 'running',
      started_at: new Date().toISOString(),
      message: input.message,
      session_id: input.session_id,
    }
    await getRunStore().put(run)
    await this.prune(input.agent)
    this.changed(run)
    try {
      const outcome = await this.execute(run.agent, run.message, run.session_id, { workflowId: run.workflow_id, ...(run.decisions_to ? { decisionsTo: run.decisions_to } : {}) })
      if (outcome.kind === 'pending') this.changed(await getRunStore().update(run.run_id, (r) => r && { ...r, status: 'awaiting_approval', pending_ids: outcome.pendingIds }))
      else await this.finish(run.run_id, { status: 'done', result: outcome.text })
      return outcome
    } catch (err) {
      await this.finish(run.run_id, { status: 'error', error: err instanceof Error ? err.message : String(err) })
      throw err
    }
  }

  /** Waits for the runs this process has started (tests, shutdown). */
  async idle(): Promise<void> {
    await Promise.all([...this.inFlight])
  }

  /** How many runs are executing right now (for idle-shutdown checks). */
  get running(): number {
    return this.inFlight.size
  }

  private async run(run: WorkflowRun): Promise<void> {
    try {
      const outcome = await this.execute(run.agent, run.message, run.session_id, { workflowId: run.workflow_id, ...(run.decisions_to ? { decisionsTo: run.decisions_to } : {}) })
      if (outcome.kind === 'pending') {
        this.changed(await getRunStore().update(run.run_id, (r) => r && { ...r, status: 'awaiting_approval', pending_ids: outcome.pendingIds }))
        return
      }
      await this.finish(run.run_id, { status: 'done', result: outcome.text })
    } catch (err) {
      await this.finish(run.run_id, { status: 'error', error: err instanceof Error ? err.message : String(err) })
    }
  }

  private async finish(runId: string, end: { status: 'done' | 'error'; result?: string; error?: string }): Promise<void> {
    this.changed(await getRunStore().update(runId, (r) => r && { ...r, ...end, pending_ids: undefined, finished_at: new Date().toISOString() }))
  }

  /** A paused run resumed after a decision (the server calls this from
   * its resolve path, for every resumed session): settle it, or record
   * what it's waiting on now. */
  async settleFromResume(sessionId: string, outcome: { text: string; pendingIds?: string[] }): Promise<void> {
    const run = await this.forSession(sessionId)
    if (!run) return
    if (outcome.pendingIds?.length) {
      this.changed(await getRunStore().update(run.run_id, (r) => r && { ...r, status: 'awaiting_approval', pending_ids: outcome.pendingIds }))
      return
    }
    await this.finish(run.run_id, { status: 'done', result: outcome.text })
  }

  /** The run a session belongs to, if it's a workflow run's. */
  async forSession(sessionId: string): Promise<WorkflowRun | undefined> {
    if (!sessionId.startsWith(SESSION_PREFIX) && !sessionId.startsWith(SCHEDULE_SESSION_PREFIX)) return undefined
    const store = getRunStore()
    if (store.bySession) return store.bySession(sessionId)
    return (await store.list()).find((r) => r.session_id === sessionId)
  }

  /** Records an approval decided in a run's session: on the run, and in
   * the workspace's audit events. */
  async recordDecision(sessionId: string, decision: { tool: string; approved: boolean; by?: string; edited?: boolean; before?: unknown; after?: unknown; reason?: string }): Promise<void> {
    const run = await this.forSession(sessionId)
    if (!run) return
    const reason = decision.reason?.trim().slice(0, 2000)
    const entry: RunDecision = {
      tool: decision.tool,
      approved: decision.approved,
      at: new Date().toISOString(),
      ...(decision.by ? { by: decision.by } : {}),
      ...(decision.edited ? { edited: true, before: clip(decision.before), after: clip(decision.after) } : {}),
      ...(reason ? { reason } : {}),
    }
    await getRunStore().update(run.run_id, (r) => r && { ...r, decisions: [...(r.decisions ?? []), entry].slice(-50) })
    const { at, by, ...data } = entry
    recordEvent({ at, agent: run.agent, workflow_id: run.workflow_id, run_id: run.run_id, kind: 'decision', ...(by ? { by } : {}), data })
  }

  /** Records feedback given on a run's result in the audit events (the
   * run itself carries the latest). */
  recordFeedback(run: WorkflowRun, feedback: RunFeedback, by?: string): void {
    const { at, ...data } = feedback
    recordEvent({ at, agent: run.agent, workflow_id: run.workflow_id, run_id: run.run_id, kind: 'feedback', ...(by ? { by } : {}), data })
  }

  /** Records a question answered in a run's session. */
  async recordAnswer(sessionId: string, answer: { question: string; answer: string; by?: string }): Promise<void> {
    const run = await this.forSession(sessionId)
    if (!run) return
    const entry = { question: answer.question.slice(0, 4000), answer: answer.answer.slice(0, 4000), at: new Date().toISOString(), ...(answer.by ? { by: answer.by } : {}) }
    await getRunStore().update(run.run_id, (r) => r && { ...r, answers: [...(r.answers ?? []), entry].slice(-50) })
    recordEvent({ at: entry.at, agent: run.agent, workflow_id: run.workflow_id, run_id: run.run_id, kind: 'answer', ...(answer.by ? { by: answer.by } : {}), data: { question: entry.question, answer: entry.answer } })
  }

  /** On startup: a run a restart cut off can't continue, so it's an
   * error. One waiting on a decision is kept: its checkpoint survives. */
  async recover(): Promise<void> {
    for (const run of await getRunStore().list()) {
      if (run.status === 'running') await this.finish(run.run_id, { status: 'error', error: 'The server restarted while this run was in progress.' })
    }
  }

  private async prune(agent: string): Promise<void> {
    const store = getRunStore()
    if (store.prune) return store.prune()
    const finished = (await listRuns(agent)).filter((r) => !isUnderWay(r))
    for (const old of finished.slice(this.maxFinishedPerAgent)) await getRunStore().remove(old.run_id)
  }
}

// A tool input kept on a decision: as given when small, else its JSON cut
// to 8,000 characters.
function clip(value: unknown): unknown {
  if (value === undefined) return undefined
  const text = JSON.stringify(value)
  return text.length <= 8000 ? value : text.slice(0, 8000)
}
