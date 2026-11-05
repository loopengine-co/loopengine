// Starting jobs from messages, the app-neutral part: a DM to the agent's
// bot, or a mention of it, runs the agent with that message, and the
// answer goes in a thread under it (in a DM, under the message). Later
// messages in the thread continue the same session, so the agent
// remembers what it did there.
//
// Off unless the Messaging tab turns it on, and then only for the agent's
// approvers, or, with no approvers listed, for anyone in the agent's own
// channel or chat (never a DM): a job runs with the agent's tools, so who
// can start one is the same question as who can decide its requests.
//
// A run that stops for an approval or a question says so in the thread
// (the request itself goes out through the agent's notifier as usual, and
// the thread is linked to it, so an approver can decide by replying
// there). Once it's decided, the resumed run's answer is posted back
// into the thread (settleJobThread).
import type { InboundMessage, MessagingConnector } from './connector.js'
import { findJobThread, findJobThreadBySession, recordJobThread, recordThread, type JobThread } from './threads.js'

export type JobTurn =
  | { kind: 'done'; text: string }
  | { kind: 'pending'; items: Array<{ pendingId: string; kind: 'approval' | 'question'; tool: string; question?: string }> }

export interface JobDeps {
  agentName: string
  agentDir: string
  connector: MessagingConnector
  plan?: string
  /** Whether this person may start a job, or continue one, here. */
  allowed(message: InboundMessage): { allowed: boolean; message?: string }
  /** One agent turn in `sessionId` with the person's message. */
  runTurn(sessionId: string, text: string): Promise<JobTurn>
  /** The decision page for a pending item, when the server's address is known. */
  decideLink?(pendingId: string, kind: 'approval' | 'question'): string | undefined
}

/** A session id for a job thread, from the app's own ids: one per thread
 * in a channel, one per DM (so a DM keeps its context from one message to
 * the next). Only characters a session id can hold. */
export function jobSessionId(message: Pick<InboundMessage, 'app' | 'conversation' | 'direct'>, threadTs: string): string {
  const safe = (s: string) => s.replace(/[^A-Za-z0-9_-]/g, '_')
  return message.direct ? `${message.app}-dm-${safe(message.conversation)}` : `${message.app}-${safe(message.conversation)}-${safe(threadTs)}`
}

/** The job thread a message continues, if any: the thread it's in, or,
 * in a DM, the DM itself. */
export function findJobFor(agentDir: string, message: InboundMessage): JobThread | undefined {
  const threadTs = message.threadTs ?? message.ts
  const inThread = findJobThread(agentDir, message.app, message.conversation, threadTs)
  if (inThread) return inThread
  if (!message.direct) return undefined
  const sessionId = jobSessionId(message, threadTs)
  return findJobThreadBySession(agentDir, sessionId)
}

/** Whether a message starts or continues a job: a DM, a mention, or any
 * message in a job's thread. */
export function isJobMessage(agentDir: string, message: InboundMessage): boolean {
  return Boolean(message.direct || message.mentioned || findJobFor(agentDir, message))
}

// One turn at a time per session: a second message waits for the first's
// answer rather than racing it.
const sessionLocks = new Map<string, Promise<unknown>>()
function inSession<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const previous = sessionLocks.get(key) ?? Promise.resolve()
  const next = previous.then(fn, fn)
  const settled = next.catch(() => {})
  sessionLocks.set(key, settled)
  void settled.then(() => {
    if (sessionLocks.get(key) === settled) sessionLocks.delete(key)
  })
  return next
}

/** Runs the agent on a job message and answers in its thread. */
export async function handleJobMessage(message: InboundMessage, deps: JobDeps): Promise<void> {
  const { connector } = deps
  const threadTs = message.threadTs ?? message.ts
  const say = (text: string) => connector.postInThread(message.conversation, threadTs, text)
  if (deps.plan === 'free') {
    await say(`Starting jobs from ${connector.name} needs LoopEngine Pro.`)
    return
  }
  const gate = deps.allowed(message)
  if (!gate.allowed) {
    await say(gate.message ?? `You can't start jobs for ${deps.agentName} here.`)
    return
  }
  const text = message.text.trim()
  if (!text) {
    await say('What should I do? Write the job in the same message.')
    return
  }
  const sessionId = findJobFor(deps.agentDir, message)?.sessionId ?? jobSessionId(message, threadTs)
  // Recorded per message, so a resumed run answers in the thread of the
  // message that started it.
  recordJobThread(deps.agentDir, { app: message.app, conversation: message.conversation, ts: threadTs, sessionId })
  await inSession(`${deps.agentName}:${sessionId}`, async () => {
    let turn: JobTurn
    try {
      turn = await deps.runTurn(sessionId, text)
    } catch (err) {
      await say(`That didn't work: ${connector.escape(err instanceof Error ? err.message : String(err))}`)
      return
    }
    await postTurn(deps, { app: message.app, conversation: message.conversation, ts: threadTs, sessionId }, turn)
  })
}

async function postTurn(deps: Pick<JobDeps, 'agentDir' | 'connector' | 'decideLink'>, job: JobThread, turn: JobTurn): Promise<void> {
  const say = (text: string) => deps.connector.postInThread(job.conversation, job.ts, text)
  if (turn.kind === 'done') {
    await say(turn.text.trim() || 'Done.')
    return
  }
  for (const item of turn.items) {
    // The thread is linked to the request, so a reply here can ask about
    // it or decide it (core/messaging/engine.ts).
    recordThread(deps.agentDir, { app: job.app, conversation: job.conversation, ts: job.ts, pendingId: item.pendingId, kind: item.kind })
    const link = deps.decideLink?.(item.pendingId, item.kind)
    const head =
      item.kind === 'approval'
        ? `This needs approval before it runs \`${item.tool}\`.`
        : `A question before I go on: ${deps.connector.escape(item.question ?? '')}`
    const how = item.kind === 'approval' ? 'An approver can reply here to approve or deny it' : 'Reply here to answer it'
    await say(`${head}\n${how}${link ? `, or [open the request](${link})` : ''}. I'll carry on in this thread once it's decided.`)
  }
}

/** Posts a resumed run's outcome in the job thread it came from, if it
 * came from one. */
export async function settleJobThread(
  deps: Pick<JobDeps, 'agentDir' | 'connector' | 'decideLink'>,
  sessionId: string,
  turn: JobTurn,
): Promise<void> {
  const job = findJobThreadBySession(deps.agentDir, sessionId)
  if (!job || job.app !== deps.connector.app) return
  await postTurn(deps, job, turn)
}
