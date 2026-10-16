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
}

function threadsFile(agentDir: string): string {
  return join(agentDir, '.messaging', 'threads.jsonl')
}

/** Appends one request's thread. Never throws: a request that can't be
 * mapped still works through its buttons and link. */
export function recordThread(agentDir: string, link: ThreadLink): void {
  try {
    mkdirSync(join(agentDir, '.messaging'), { recursive: true })
    const { app, conversation, ts, pendingId, kind, proposedArgs } = link
    appendFileSync(threadsFile(agentDir), JSON.stringify({ app, conversation, ts, pendingId, kind, ...(proposedArgs ? { proposedArgs } : {}), at: new Date().toISOString() }) + '\n')
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
