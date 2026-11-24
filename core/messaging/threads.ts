// The thread map: which approval request or question each posted message
// is, so a reply in its thread reaches the right one after a restart or a
// sleep. A notifier reports where it posted (SlackNotifier's onThread);
// this keeps it in the workspace's database (core/audit-store.ts), keyed
// by the agent's folder name, and looks it up by index. What an agent
// had in agents/<name>/.messaging/threads.jsonl and jobs.jsonl, one line
// each, is copied in the first time; where there's no database, those
// files are still where it's kept.
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import { auditDb } from '../audit-store.js'

export interface ThreadLink {
  /** Which connector posted it: 'slack', 'telegram', ... */
  app: string
  /** Channel, group or DM id the request was posted in. */
  conversation: string
  /** The request message's id, which is its thread's id. */
  ts: string
  pendingId: string
  kind: 'approval' | 'question'
  /** A change an approver asked for, waiting to be approved as changed.
   * Recording the thread again without it drops the change. */
  proposedArgs?: Record<string, unknown>
  /** The latest message the agent posted with buttons in this thread (a
   * proposed change, a Confirm), so it can be replaced once the request
   * is decided and its buttons don't linger. */
  choiceTs?: string
  /** A long request goes out as several messages (Telegram), its
   * buttons on the last: that message, when it isn't `ts`. */
  buttonsTs?: string
}

function threadsFile(agentDir: string): string {
  return join(agentDir, '.messaging', 'threads.jsonl')
}

// The database, with this agent's old .messaging files copied in (once
// per agent; noted in meta so a restart doesn't copy them again).
const imported = new Set<string>()
function dbFor(agentDir: string): { db: DatabaseSync; agent: string } | undefined {
  const db = auditDb()
  if (!db) return undefined
  const agent = basename(resolve(agentDir))
  if (!imported.has(agent)) {
    imported.add(agent)
    try {
      importFiles(db, agentDir, agent)
    } catch (err) {
      console.error(`[loopengine] could not copy ${agent}'s message threads into the database:`, err instanceof Error ? err.message : err)
    }
  }
  return { db, agent }
}

function importFiles(db: DatabaseSync, agentDir: string, agent: string): void {
  const key = `threads_imported:${agent}`
  if (db.prepare('SELECT value FROM meta WHERE key = ?').get(key)) return
  db.exec('BEGIN')
  try {
    for (const link of readLinks(agentDir)) insertThread(db, agent, link, (link as ThreadLink & { at?: string }).at)
    for (const job of readJobs(agentDir)) insertJob(db, agent, job, (job as JobThread & { at?: string }).at)
    db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run(key, new Date().toISOString())
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}

function linkData(link: ThreadLink): ThreadLink {
  const { app, conversation, ts, pendingId, kind, proposedArgs, choiceTs, buttonsTs } = link
  return { app, conversation, ts, pendingId, kind, ...(proposedArgs ? { proposedArgs } : {}), ...(choiceTs ? { choiceTs } : {}), ...(buttonsTs ? { buttonsTs } : {}) }
}

function insertThread(db: DatabaseSync, agent: string, link: ThreadLink, at = new Date().toISOString()): void {
  db.prepare('INSERT INTO threads (agent, app, conversation, ts, pending_id, data, at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(agent, link.app, link.conversation, link.ts, link.pendingId, JSON.stringify(linkData(link)), at)
}

function insertJob(db: DatabaseSync, agent: string, job: JobThread, at = new Date().toISOString()): void {
  db.prepare('INSERT INTO job_threads (agent, app, conversation, ts, session_id, at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(agent, job.app, job.conversation, job.ts, job.sessionId, at)
}

/** Records one request's thread; the latest record of a request wins.
 * Never throws: a request that can't be mapped still works through its
 * buttons and link. */
export function recordThread(agentDir: string, link: ThreadLink): void {
  try {
    const store = dbFor(agentDir)
    if (store) return insertThread(store.db, store.agent, link)
    mkdirSync(join(agentDir, '.messaging'), { recursive: true })
    appendFileSync(threadsFile(agentDir), JSON.stringify({ ...linkData(link), at: new Date().toISOString() }) + '\n')
  } catch (err) {
    console.error('[loopengine] could not record the thread:', err instanceof Error ? err.message : err)
  }
}

/** The thread a request was posted in, found by its pendingId. */
export function findThreadByPending(agentDir: string, pendingId: string): ThreadLink | undefined {
  const store = dbFor(agentDir)
  if (store) {
    const row = store.db.prepare('SELECT data FROM threads WHERE agent = ? AND pending_id = ? ORDER BY id DESC LIMIT 1').get(store.agent, pendingId) as { data: string } | undefined
    return row ? (JSON.parse(row.data) as ThreadLink) : undefined
  }
  return readLinks(agentDir).filter((link) => link.pendingId === pendingId).at(-1)
}

function readLinks(agentDir: string): ThreadLink[] {
  const path = threadsFile(agentDir)
  if (!existsSync(path)) return []
  const links: ThreadLink[] = []
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (!line) continue
    try {
      links.push(JSON.parse(line) as ThreadLink)
    } catch {}
  }
  return links
}

/** The request a thread belongs to, or undefined for any other thread. */
export function findThread(agentDir: string, app: string, conversation: string, ts: string): ThreadLink | undefined {
  const store = dbFor(agentDir)
  if (store) {
    const row = store.db.prepare('SELECT data FROM threads WHERE agent = ? AND app = ? AND conversation = ? AND ts = ? ORDER BY id DESC LIMIT 1').get(store.agent, app, conversation, ts) as { data: string } | undefined
    return row ? (JSON.parse(row.data) as ThreadLink) : undefined
  }
  return readLinks(agentDir).filter((link) => link.app === app && link.conversation === conversation && link.ts === ts).at(-1)
}

// Job threads: a job someone started by messaging the agent (a DM, or a
// mention), and the session it runs in. Follow-ups in the thread continue
// that session, and a run that paused for a decision posts its result
// back here once it resumes. Kept beside the threads above.

export interface JobThread {
  app: string
  conversation: string
  /** The thread's first message id. */
  ts: string
  sessionId: string
}

function jobsFile(agentDir: string): string {
  return join(agentDir, '.messaging', 'jobs.jsonl')
}

function readJobs(agentDir: string): JobThread[] {
  const path = jobsFile(agentDir)
  if (!existsSync(path)) return []
  const jobs: JobThread[] = []
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (!line) continue
    try {
      jobs.push(JSON.parse(line) as JobThread)
    } catch {}
  }
  return jobs
}

/** Never throws, like recordThread. */
export function recordJobThread(agentDir: string, job: JobThread): void {
  try {
    const store = dbFor(agentDir)
    if (store) return insertJob(store.db, store.agent, job)
    mkdirSync(join(agentDir, '.messaging'), { recursive: true })
    const { app, conversation, ts, sessionId } = job
    appendFileSync(jobsFile(agentDir), JSON.stringify({ app, conversation, ts, sessionId, at: new Date().toISOString() }) + '\n')
  } catch (err) {
    console.error('[loopengine] could not record the job thread:', err instanceof Error ? err.message : err)
  }
}

function jobOf(row: Record<string, unknown> | undefined): JobThread | undefined {
  return row ? { app: String(row.app), conversation: String(row.conversation), ts: String(row.ts), sessionId: String(row.session_id) } : undefined
}

export function findJobThread(agentDir: string, app: string, conversation: string, ts: string): JobThread | undefined {
  const store = dbFor(agentDir)
  if (store) return jobOf(store.db.prepare('SELECT * FROM job_threads WHERE agent = ? AND app = ? AND conversation = ? AND ts = ? ORDER BY id DESC LIMIT 1').get(store.agent, app, conversation, ts) as Record<string, unknown> | undefined)
  return readJobs(agentDir).filter((job) => job.app === app && job.conversation === conversation && job.ts === ts).at(-1)
}

/** The session's latest job thread: where its last message came from. */
export function findJobThreadBySession(agentDir: string, sessionId: string): JobThread | undefined {
  const store = dbFor(agentDir)
  if (store) return jobOf(store.db.prepare('SELECT * FROM job_threads WHERE agent = ? AND session_id = ? ORDER BY id DESC LIMIT 1').get(store.agent, sessionId) as Record<string, unknown> | undefined)
  return readJobs(agentDir).filter((job) => job.sessionId === sessionId).at(-1)
}
