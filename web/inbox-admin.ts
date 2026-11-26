// The Inbox's data (web/inbox-page.ts): every workflow run as a
// conversation between the agent and the people it works for, sorted into
// All, Needs attention, Completed, Failed and Archived, each with what it
// last said in a line; and one in full: what it was given, what the agent
// did, what it asks now, and who decided what.
//
// Built from what's already kept: workflow runs (core/workflow-runs.ts),
// open approvals and questions (the checkpoint store, as
// listAgentPending lists them) and each run's session history. A decision
// waiting outside a workflow run (in a chat, a plain scheduled message) is
// listed too, as a case of its own without a run.
import type { Message } from '../core/run-agent.js'
import type { UsageRow } from '../core/usage.js'
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
  /** A run by id, including one too old for runs() (an archived case). */
  run?(runId: string): Promise<WorkflowRun | undefined>
  /** The run's model calls, oldest first (core/usage.ts). */
  usage?(run: WorkflowRun): UsageRow[]
  /** An agent's display name. */
  agentLabel?(agent: string): string
  /** The cases put away (web/inbox-archive.ts), by id. */
  archived?(): Record<string, InboxArchived>
}

/** A case put away: when, and by whom. */
export interface InboxArchived {
  at: string
  by?: string
}

/** Where a case stands: waiting on a person, still running, or finished
 * (done or failed). */
export type InboxState = 'needs' | 'running' | 'completed' | 'failed'

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
  /** When it began waiting on a person (its oldest open request). */
  waitingSince?: string
  /** When anything last happened in it: finished, or decided. */
  lastActivity: string
  /** What happened, in a few words: "Done automatically", "Approved by
   * ana@…", "Failed". */
  outcome: string
  state: InboxState
  /** The agent's display name. */
  agentLabel: string
  /** What it last said, in a line: what it asks, its result, or why it
   * failed. */
  summary: string
  archived?: InboxArchived
}

/** The Inbox's views: everything not archived; what waits on a person
 * (however long); what's completed or failed; what's archived. "recent"
 * (everything not waiting from the last RECENT_DAYS days) is the older
 * view, kept for links and apps. */
export type InboxView = 'all' | 'needs' | 'completed' | 'failed' | 'archived' | 'recent'
export const INBOX_VIEWS: InboxView[] = ['all', 'needs', 'completed', 'failed', 'archived', 'recent']
export const RECENT_DAYS = 7

const SUMMARY_MAX = 240

// The last thing the agent said in its own words, from its history.
function lastAgentText(history: Message[]): string {
  for (let i = history.length - 1; i > 0; i--) {
    const m = history[i]!
    if (m.role !== 'assistant') continue
    const blocks = typeof m.content === 'string' ? [{ type: 'text', text: m.content }] : (m.content as { type: string; text?: string }[])
    const text = blocks.filter((b) => b.type === 'text' && b.text?.trim()).map((b) => b.text!.trim()).join(' ')
    if (text) return text
  }
  return ''
}

// Markdown left out, for a line of plain text.
function plain(text: string): string {
  return text.replace(/```[\s\S]*?```/g, ' ').replace(/\*\*|__|`/g, '').replace(/\*([^*\n]+)\*/g, '$1').replace(/^\s*(#+|>)\s*/gm, '').replace(/\[([^\]]*)\]\(([^)]*)\)/g, '$1')
}

// A case's outcome in words, from its status and the last decision.
function outcomeOf(run: WorkflowRun, waiting: boolean): string {
  if (waiting) return 'Waiting'
  if (run.status === 'error') return 'Failed'
  if (run.status === 'running') return 'Running'
  const last = [...(run.decisions ?? []).map((d) => ({ at: d.at, by: d.by, what: d.approved ? (d.edited ? 'Changed' : 'Approved') : 'Denied' })), ...(run.answers ?? []).map((a) => ({ at: a.at, by: a.by, what: 'Answered' }))]
    .sort((a, b) => a.at.localeCompare(b.at)).pop()
  if (!last) return 'Done automatically'
  return last.by ? `${last.what} by ${last.by}` : last.what
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

/** `view`: "needs" (waiting on a person, oldest first, however long),
 * "recent" (the last RECENT_DAYS days, latest first), or "auto" (needs
 * when anything waits, else recent). `open` is the older name for needs. */
export async function listInbox(deps: InboxDeps, filter: { view?: InboxView | 'auto'; open?: boolean; q?: string; workflow?: string; limit?: number; now?: number } = {}): Promise<{ items: InboxItem[]; open: number; view: InboxView; counts: Record<Exclude<InboxView, 'recent'>, number>; workflows: { id: string; title: string }[] }> {
  const [runs, pending] = await Promise.all([deps.runs(), deps.pending()])
  const archived = deps.archived?.() ?? {}
  const label = (agent: string) => deps.agentLabel?.(agent) ?? agent
  const bySession = new Map<string, InboxPending[]>()
  for (const p of pending) bySession.set(p.sessionId, [...(bySession.get(p.sessionId) ?? []), p])
  const runSessions = new Set(runs.map((r) => r.session_id))
  const items: InboxItem[] = runs.map((run) => {
    const wfTitle = deps.workflowTitle(run.agent, run.workflow_id) ?? (run.workflow_id || 'One-off run')
    const waits = run.status === 'awaiting_approval' ? (bySession.get(run.session_id) ?? []) : []
    const decided = [...(run.decisions ?? []), ...(run.answers ?? [])].sort((a, b) => a.at.localeCompare(b.at))
    const lastBy = decided.at(-1)?.by
    const since = waits.map((p) => p.createdAt).filter((t): t is string => Boolean(t)).sort()[0]
    const lastActivity = [run.started_at, run.finished_at, decided.at(-1)?.at].filter((t): t is string => Boolean(t)).sort().at(-1)!
    const state: InboxState = waits.length ? 'needs' : run.status === 'error' ? 'failed' : run.status === 'done' ? 'completed' : 'running'
    const question = waits.find((p) => p.kind === 'question')
    const summary = question ? questionOf(question)
      : state === 'failed' ? run.error ?? 'It failed.'
      : state === 'completed' ? run.result ?? outcomeOf(run, false)
      : state === 'running' ? 'Working on it…'
      : `Wants to run ${waits[0]!.tool}.`
    return {
      id: run.run_id, title: titleOf(run, wfTitle), agent: run.agent, agentLabel: label(run.agent), workflowId: run.workflow_id, workflowTitle: wfTitle, status: run.status, state,
      waiting: [...new Set(waits.map((p) => p.kind))], startedAt: run.started_at, ...(run.finished_at ? { finishedAt: run.finished_at } : {}), ...(lastBy ? { lastBy } : {}),
      ...(waits.length ? { waitingSince: since ?? run.started_at } : {}), lastActivity: waits.length && since && since > lastActivity ? since : lastActivity, outcome: outcomeOf(run, waits.length > 0),
      summary: short(plain(summary), SUMMARY_MAX), ...(archived[run.run_id] && !waits.length ? { archived: archived[run.run_id] } : {}),
    }
  })
  // An approval it waits on reads best in the agent's own words, from
  // just before it asked ("The content is ready. Please review…").
  await Promise.all(items.map(async (item, i) => {
    if (item.state !== 'needs' || item.waiting.includes('question')) return
    try {
      const said = lastAgentText(await deps.history(runs[i]!))
      if (said) item.summary = short(plain(said), SUMMARY_MAX)
    } catch {}
  }))
  for (const p of pending) {
    if (runSessions.has(p.sessionId)) continue
    const at = p.createdAt ?? new Date(0).toISOString()
    items.push({
      id: OUTSIDE + p.pendingId, title: short(p.kind === 'question' ? questionOf(p) : `Approve ${p.tool}`, 120), agent: p.agent, agentLabel: label(p.agent), workflowId: '', workflowTitle: 'Chat',
      status: 'awaiting_approval', state: 'needs', waiting: [p.kind], startedAt: at, waitingSince: at, lastActivity: at, outcome: 'Waiting',
      summary: short(plain(p.kind === 'question' ? questionOf(p) : `Wants to run ${p.tool}.`), SUMMARY_MAX),
    })
  }
  const open = items.filter((i) => i.waiting.length).length
  // None asked: Needs attention when anything waits, else All.
  const view: InboxView = filter.open ? 'needs' : filter.view && filter.view !== 'auto' ? filter.view : open ? 'needs' : 'all'
  const inView = (i: InboxItem, v: InboxView): boolean =>
    v === 'needs' ? i.state === 'needs'
    : v === 'archived' ? Boolean(i.archived)
    : v === 'recent' ? !i.waiting.length && i.lastActivity >= recentSince
    : !i.archived && (v === 'all' || (v === 'completed' && i.state === 'completed') || (v === 'failed' && i.state === 'failed'))
  const recentSince = new Date((filter.now ?? Date.now()) - RECENT_DAYS * 24 * 60 * 60 * 1000).toISOString()
  const q = filter.q?.trim().toLowerCase()
  const runParams = new Map(runs.map((r) => [r.run_id, Object.values(r.params ?? {}).join(' ')]))
  const matches = (i: InboxItem) => (!filter.workflow || i.workflowId === filter.workflow) &&
    (!q || `${i.title} ${i.agent} ${i.agentLabel} ${i.workflowTitle} ${runParams.get(i.id) ?? ''} ${i.lastBy ?? ''} ${i.outcome} ${i.summary}`.toLowerCase().includes(q))
  const counts = { all: 0, needs: 0, completed: 0, failed: 0, archived: 0 }
  for (const i of items.filter(matches)) for (const v of Object.keys(counts) as (keyof typeof counts)[]) if (inView(i, v)) counts[v]++
  const shown = items
    .filter((i) => inView(i, view) && matches(i))
    // Needs attention: the longest-waiting first. All: what waits on a
    // person first, then the latest. The rest: the latest first.
    .sort((a, b) => view === 'needs' ? (a.waitingSince ?? '').localeCompare(b.waitingSince ?? '')
      : view === 'all' ? Number(b.state === 'needs') - Number(a.state === 'needs') || b.lastActivity.localeCompare(a.lastActivity)
      : b.lastActivity.localeCompare(a.lastActivity))
  // Every workflow with a case, whatever the filter, for the workflow picker.
  const workflows = [...new Map(items.filter((i) => i.workflowId).map((i) => [i.workflowId, i.workflowTitle])).entries()]
    .map(([id, title]) => ({ id, title }))
    .sort((a, b) => a.title.localeCompare(b.title))
  return { items: shown.slice(0, filter.limit ?? 200), open, view, counts, workflows }
}

/** A step in a case's timeline. */
export type InboxStep = (
  | { kind: 'text'; text: string }
  | { kind: 'tool'; tool: string; args: Record<string, unknown>; result?: string; failed?: boolean }
  | { kind: 'question'; question: string; answer?: string }
) & {
  /** On the first step of each model reply: that model call. */
  call?: { inputTokens: number; outputTokens: number; durationMs?: number; model?: string; costUsd?: number }
  /** On the first tool or question step of a reply: the time from the
   * end of that model call to the start of the next (the tools running,
   * or a person deciding). */
  waitMs?: number
}

/** A case's totals, from its model calls. */
export interface InboxTotals {
  calls: number
  inputTokens: number
  outputTokens: number
  /** Time spent in model calls. */
  modelMs: number
  /** Start to finish (or to now, for one still open). */
  elapsedMs?: number
  /** US dollars, when every call's model has a price. */
  costUsd?: number
}

/** What the agent did, in order: its words, the tools it used with what
 * came back, and the questions it asked with their answers. The run's
 * first message (its instructions) is left out; its inputs are shown
 * apart. */
export function timelineOf(history: Message[], usage: UsageRow[] = []): InboxStep[] {
  const steps: InboxStep[] = []
  const byToolUse = new Map<string, InboxStep>()
  // Each model reply is one model call, in order, when the counts agree
  // (a retried call is recorded too, and then they can't be matched).
  const replies = history.filter((m) => m.role === 'assistant').length
  const calls = usage.length === replies ? usage : []
  const endOf = (u: UsageRow) => Date.parse(u.at)
  const startOf = (u: UsageRow) => Date.parse(u.at) - (u.durationMs ?? 0)
  let reply = -1
  history.forEach((m, index) => {
    if (index === 0 && m.role === 'user') return
    const call = m.role === 'assistant' ? calls.at(++reply) : undefined
    const next = m.role === 'assistant' ? calls.at(reply + 1) : undefined
    const blocks = typeof m.content === 'string' ? [{ type: 'text', text: m.content }] : m.content
    // The wait after the call goes on its question when it asked one (a
    // person answering is most of it), else on its first tool.
    const asks = (blocks as { type: string; name?: string }[]).some((b) => b.type === 'tool_use' && b.name === 'system_ask_user')
    let first = true
    let waitShown = false
    const mark = (step: InboxStep, action: boolean): InboxStep => {
      if (first && call) step.call = { inputTokens: call.inputTokens, outputTokens: call.outputTokens, ...(call.durationMs != null ? { durationMs: call.durationMs } : {}), ...(call.model ? { model: call.model } : {}), ...(call.costUsd != null ? { costUsd: call.costUsd } : {}) }
      if (action && !waitShown && (!asks || step.kind === 'question') && call && next) {
        step.waitMs = Math.max(0, startOf(next) - endOf(call))
        waitShown = true
      }
      first = false
      return step
    }
    for (const b of blocks as { type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown>; tool_use_id?: string; content?: unknown; is_error?: boolean }[]) {
      if (m.role === 'assistant' && b.type === 'text' && b.text?.trim()) steps.push(mark({ kind: 'text', text: b.text.trim() }, false))
      else if (b.type === 'tool_use' && b.name) {
        const step: InboxStep = b.name === 'system_ask_user'
          ? { kind: 'question', question: String(b.input?.question ?? '') }
          : { kind: 'tool', tool: b.name, args: b.input ?? {} }
        steps.push(mark(step, true))
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
  agentLabel?: string
  archived?: InboxArchived
  workflowId: string
  workflowTitle: string
  run?: WorkflowRun
  /** What it waits on now, in full. */
  pending: (InboxPending & { question?: string; options?: string[] })[]
  steps: InboxStep[]
  totals?: InboxTotals
}

export function totalsOf(run: WorkflowRun, usage: UsageRow[]): InboxTotals | undefined {
  if (!usage.length) return undefined
  const end = run.finished_at ? Date.parse(run.finished_at) : Date.now()
  return {
    calls: usage.length,
    inputTokens: usage.reduce((n, u) => n + u.inputTokens, 0),
    outputTokens: usage.reduce((n, u) => n + u.outputTokens, 0),
    modelMs: usage.reduce((n, u) => n + (u.durationMs ?? 0), 0),
    elapsedMs: Math.max(0, end - Date.parse(run.started_at)),
    ...(usage.every((u) => u.costUsd != null) ? { costUsd: usage.reduce((n, u) => n + u.costUsd!, 0) } : {}),
  }
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
  const run = runs.find((r) => r.run_id === id) ?? (deps.run ? await deps.run(id) : undefined)
  if (!run) return undefined
  const wfTitle = deps.workflowTitle(run.agent, run.workflow_id) ?? (run.workflow_id || 'One-off run')
  const waits = run.status === 'awaiting_approval' ? pending.filter((p) => p.sessionId === run.session_id).map(full) : []
  const usage = deps.usage?.(run) ?? []
  let steps: InboxStep[] = []
  try {
    steps = timelineOf(await deps.history(run), usage)
  } catch {
    // An unreadable history still shows the run and what it waits on.
  }
  const { session_id: _s, message: _m, callbacks: _c, ...shown } = run
  const totals = totalsOf(run, usage)
  const archived = waits.length ? undefined : deps.archived?.()[id]
  return {
    id, title: titleOf(run, wfTitle), agent: run.agent, agentLabel: deps.agentLabel?.(run.agent) ?? run.agent, ...(archived ? { archived } : {}),
    workflowId: run.workflow_id, workflowTitle: wfTitle, run: shown as WorkflowRun, pending: waits, steps, ...(totals ? { totals } : {}),
  }
}
