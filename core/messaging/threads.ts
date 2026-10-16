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
}

function threadsFile(agentDir: string): string {
  return join(agentDir, '.messaging', 'threads.jsonl')
}

/** Appends one request's thread. Never throws: a request that can't be
 * mapped still works through its buttons and link. */
export function recordThread(agentDir: string, link: ThreadLink): void {
  try {
    mkdirSync(join(agentDir, '.messaging'), { recursive: true })
    appendFileSync(threadsFile(agentDir), JSON.stringify({ ...link, at: new Date().toISOString() }) + '\n')
  } catch (err) {
    console.error('[loopengine] could not record the thread:', err instanceof Error ? err.message : err)
  }
}

/** The request a thread belongs to, or undefined for any other thread. */
export function findThread(agentDir: string, app: string, conversation: string, ts: string): ThreadLink | undefined {
  const path = threadsFile(agentDir)
  if (!existsSync(path)) return undefined
  let found: ThreadLink | undefined
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (!line) continue
    try {
      const link = JSON.parse(line) as ThreadLink
      if (link.app === app && link.conversation === conversation && link.ts === ts) found = link
    } catch {}
  }
  return found
}
