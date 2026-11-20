// The Inbox's data (web/inbox-page.ts): every workflow run as a case, the
// ones waiting on a person first, and one case in full: what it was given,
// what the agent did, what it asks now, and who decided what.
//
// Built from what's already kept: workflow runs (core/workflow-runs.ts),
// open approvals and questions (the checkpoint store, as
// listAgentPending lists them) and each run's session history. A decision
// waiting outside a workflow run (in a chat, a plain scheduled message) is
// listed too, as a case of its own without a run.
import type { Message } from '../core/run-agent.js'
import type { WorkflowRun } from '../core/workflow-runs.js'

/** An open approval or question, as listAgentPending gives it. */
export interface InboxPending {
  pendingId: string
  kind: 'approval' | 'question'
  tool: string
  args: Record<string, unknown>
  reason: string
  sessionId: string
  createdAt: string | null
  agent: string
}

export interface InboxDeps {
  runs(): Promise<WorkflowRun[]>
  pending(): Promise<InboxPending[]>
  history(run: WorkflowRun): Promise<Message[]>
  workflowTitle(agent: string, workflowId: string): string | undefined
}

/** One row in the list. */
export interface InboxItem {
  /** The run's id, or "p-<pendingId>" for a decision outside a run. */
  id: string
  title: string
  agent: string
  workflowId: string
  workflowTitle: string
  status: WorkflowRun['status']
  /** What it waits on now: "approval", "question", or both. */
  waiting: ('approval' | 'question')[]
  startedAt: string
  finishedAt?: string
  /** The latest person who decided something in it. */
  lastBy?: string
}

const OUTSIDE = 'p-'

function short(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > max ? flat.slice(0, max - 1) + '…' : flat
}

/** A case's name: its start message, else its workflow and first input. */
function titleOf(run: WorkflowRun, workflowTitle: string): string {
  if (run.chat_notice) return short(run.chat_notice, 120)
  const first = run.params ? Object.values(run.params)[0] : undefined
  return first ? `${workflowTitle}: ${short(first, 60)}` : workflowTitle
}

function questionOf(p: InboxPending): string {
  return typeof p.args.question === 'string' ? p.args.question : p.reason
}

export async function listInbox(deps: InboxDeps, filter: { open?: boolean; q?: string; workflow?: string; limit?: number } = {}): Promise<{ items: InboxItem[]; open: number }> {
  const [runs, pending] = await Promise.all([deps.runs(), deps.pending()])
  const bySession = new Map<string, InboxPending[]>()
  for (const p of pending) bySession.set(p.sessionId, [...(bySession.get(p.sessionId) ?? []), p])
  const runSessions = new Set(runs.map((r) => r.session_id))
  const items: InboxItem[] = runs.map((run) => {
    const wfTitle = deps.workflowTitle(run.agent, run.workflow_id) ?? (run.workflow_id || 'One-off job')
    const waits = run.status === 'awaiting_approval' ? (bySession.get(run.session_id) ?? []) : []
    const lastBy = [...(run.decisions ?? []), ...(run.answers ?? [])].sort((a, b) => a.at.localeCompare(b.at)).pop()?.by
    return {
      id: run.run_id, title: titleOf(run, wfTitle), agent: run.agent, workflowId: run.workflow_id, workflowTitle: wfTitle, status: run.status,
      waiting: [...new Set(waits.map((p) => p.kind))], startedAt: run.started_at, ...(run.finished_at ? { finishedAt: run.finished_at } : {}), ...(lastBy ? { lastBy } : {}),
    }
  })
  for (const p of pending) {
    if (runSessions.has(p.sessionId)) continue
    items.push({
      id: OUTSIDE + p.pendingId, title: short(p.kind === 'question' ? questionOf(p) : `Approve ${p.tool}`, 120), agent: p.agent, workflowId: '', workflowTitle: 'Chat',
      status: 'awaiting_approval', waiting: [p.kind], startedAt: p.createdAt ?? new Date(0).toISOString(),
    })
  }
  const open = items.filter((i) => i.waiting.length).length
  const q = filter.q?.trim().toLowerCase()
  const runParams = new Map(runs.map((r) => [r.run_id, Object.values(r.params ?? {}).join(' ')]))
  const shown = items
    .filter((i) => !filter.open || i.waiting.length)
    .filter((i) => !filter.workflow || i.workflowId === filter.workflow)
    .filter((i) => !q || `${i.title} ${i.agent} ${i.workflowTitle} ${runParams.get(i.id) ?? ''} ${i.lastBy ?? ''}`.toLowerCase().includes(q))
    // Waiting first, newest first within each.
    .sort((a, b) => (b.waiting.length ? 1 : 0) - (a.waiting.length ? 1 : 0) || b.startedAt.localeCompare(a.startedAt))
  return { items: shown.slice(0, filter.limit ?? 200), open }
}

/** A step in a case's timeline. */
export type InboxStep =
  | { kind: 'text'; text: string }
  | { kind: 'tool'; tool: string; args: Record<string, unknown>; result?: string; failed?: boolean }
  | { kind: 'question'; question: string; answer?: string }

/** What the agent did, in order: its words, the tools it used with what
 * came back, and the questions it asked with their answers. The run's
 * first message (its instructions) is left out; its inputs are shown
 * apart. */
export function timelineOf(history: Message[]): InboxStep[] {
  const steps: InboxStep[] = []
  const byToolUse = new Map<string, InboxStep>()
  history.forEach((m, index) => {
    if (index === 0 && m.role === 'user') return
    const blocks = typeof m.content === 'string' ? [{ type: 'text', text: m.content }] : m.content
    for (const b of blocks as { type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown>; tool_use_id?: string; content?: unknown; is_error?: boolean }[]) {
      if (m.role === 'assistant' && b.type === 'text' && b.text?.trim()) steps.push({ kind: 'text', text: b.text.trim() })
      else if (b.type === 'tool_use' && b.name) {
        const step: InboxStep = b.name === 'system_ask_user'
          ? { kind: 'question', question: String(b.input?.question ?? '') }
          : { kind: 'tool', tool: b.name, args: b.input ?? {} }
        steps.push(step)
        if (b.id) byToolUse.set(b.id, step)
      } else if (b.type === 'tool_result' && b.tool_use_id) {
        const step = byToolUse.get(b.tool_use_id)
        const text = typeof b.content === 'string' ? b.content : JSON.stringify(b.content ?? '')
        if (step?.kind === 'question') step.answer = text
        else if (step?.kind === 'tool') {
          step.result = text.length > 2000 ? text.slice(0, 2000) + '…' : text
          if (b.is_error) step.failed = true
        }
      }
    }
  })
  return steps
}

export interface InboxCase {
  id: string
  title: string
  agent: string
  workflowId: string
  workflowTitle: string
  run?: WorkflowRun
  /** What it waits on now, in full. */
  pending: (InboxPending & { question?: string; options?: string[] })[]
  steps: InboxStep[]
}

export async function getInboxCase(deps: InboxDeps, id: string): Promise<InboxCase | undefined> {
  const [runs, pending] = await Promise.all([deps.runs(), deps.pending()])
  const full = (p: InboxPending) => ({
    ...p,
    ...(p.kind === 'question' ? { question: questionOf(p) } : {}),
    ...(p.kind === 'question' && Array.isArray(p.args.options) ? { options: p.args.options.map(String) } : {}),
  })
  if (id.startsWith(OUTSIDE)) {
    const p = pending.find((x) => x.pendingId === id.slice(OUTSIDE.length))
    if (!p) return undefined
    return { id, title: short(p.kind === 'question' ? questionOf(p) : `Approve ${p.tool}`, 120), agent: p.agent, workflowId: '', workflowTitle: 'Chat', pending: [full(p)], steps: [] }
  }
  const run = runs.find((r) => r.run_id === id)
  if (!run) return undefined
  const wfTitle = deps.workflowTitle(run.agent, run.workflow_id) ?? (run.workflow_id || 'One-off job')
  const waits = run.status === 'awaiting_approval' ? pending.filter((p) => p.sessionId === run.session_id).map(full) : []
  let steps: InboxStep[] = []
  try {
    steps = timelineOf(await deps.history(run))
  } catch {
    // An unreadable history still shows the run and what it waits on.
  }
  const { session_id: _s, message: _m, callbacks: _c, ...shown } = run
  return { id, title: titleOf(run, wfTitle), agent: run.agent, workflowId: run.workflow_id, workflowTitle: wfTitle, run: shown as WorkflowRun, pending: waits, steps }
}
