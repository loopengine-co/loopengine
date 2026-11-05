// The thread map: which approval request or question each posted message
// is, so a reply in its thread reaches the right one after a restart or a
// sleep. A notifier reports where it posted (SlackNotifier's onThread);
// this keeps it in agents/<name>/.messaging/threads.jsonl, one line each.
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

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
}

function threadsFile(agentDir: string): string {
  return join(agentDir, '.messaging', 'threads.jsonl')
}

/** Appends one request's thread. Never throws: a request that can't be
 * mapped still works through its buttons and link. */
export function recordThread(agentDir: string, link: ThreadLink): void {
  try {
    mkdirSync(join(agentDir, '.messaging'), { recursive: true })
    const { app, conversation, ts, pendingId, kind, proposedArgs, choiceTs } = link
    appendFileSync(threadsFile(agentDir), JSON.stringify({ app, conversation, ts, pendingId, kind, ...(proposedArgs ? { proposedArgs } : {}), ...(choiceTs ? { choiceTs } : {}), at: new Date().toISOString() }) + '\n')
  } catch (err) {
    console.error('[loopengine] could not record the thread:', err instanceof Error ? err.message : err)
  }
}

/** The thread a request was posted in, found by its pendingId. */
export function findThreadByPending(agentDir: string, pendingId: string): ThreadLink | undefined {
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
  return readLinks(agentDir).filter((link) => link.app === app && link.conversation === conversation && link.ts === ts).at(-1)
}

// Job threads: a job someone started by messaging the agent (a DM, or a
// mention), and the session it runs in. Follow-ups in the thread continue
// that session, and a run that paused for a decision posts its result
// back here once it resumes. Kept in agents/<name>/.messaging/jobs.jsonl.

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
    mkdirSync(join(agentDir, '.messaging'), { recursive: true })
    const { app, conversation, ts, sessionId } = job
    appendFileSync(jobsFile(agentDir), JSON.stringify({ app, conversation, ts, sessionId, at: new Date().toISOString() }) + '\n')
  } catch (err) {
    console.error('[loopengine] could not record the job thread:', err instanceof Error ? err.message : err)
  }
}

export function findJobThread(agentDir: string, app: string, conversation: string, ts: string): JobThread | undefined {
  return readJobs(agentDir).filter((job) => job.app === app && job.conversation === conversation && job.ts === ts).at(-1)
}

/** The session's latest job thread: where its last message came from. */
export function findJobThreadBySession(agentDir: string, sessionId: string): JobThread | undefined {
  return readJobs(agentDir).filter((job) => job.sessionId === sessionId).at(-1)
}
