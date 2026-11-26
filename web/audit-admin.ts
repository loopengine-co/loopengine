// The Audit page's data (web/audit-page.ts): the workspace's log in words
// and as a CSV file, and its cases (every run kept) as rows. The log is
// core/audit-store.ts's events; the cases, core/workflow-runs.ts's runs.
import type { AuditEvent } from '../core/audit-store.js'
import { changesSummary, type FieldChange } from './change-log.js'
import { workflowVersionOf, type WorkflowRun } from '../core/workflow-runs.js'

const short = (text: string, max: number): string => {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > max ? flat.slice(0, max - 1) + '…' : flat
}

/** An event in words, as the page and the CSV file show it: what
 * happened, and any detail (a reason, an answer, a note). */
export function eventText(e: AuditEvent): { what: string; detail: string } {
  const d = e.data
  const str = (v: unknown) => (typeof v === 'string' ? v : '')
  if (e.kind === 'change') {
    // The workflow's version before and after ("brief" on older events).
    const version = (d.version ?? d.brief) as { from?: number; to?: number } | undefined
    const summary = Array.isArray(d.changes) ? changesSummary(d.changes as FieldChange[]) : ''
    return { what: str(d.label) || 'Changed a setting', detail: [version?.from && version.to ? `workflow v${version.from} → v${version.to}` : '', summary].filter(Boolean).join('; ') }
  }
  if (e.kind === 'decision') {
    const what = `${d.approved ? (d.edited ? 'Approved as changed' : 'Approved') : 'Denied'} ${str(d.tool)}`
    return { what, detail: str(d.reason) }
  }
  if (e.kind === 'answer') return { what: 'Answered a question', detail: `${short(str(d.question), 200)} → ${short(str(d.answer), 400)}` }
  const verdict = d.verdict === 'good' ? 'Good' : d.verdict === 'bad' ? 'Bad' : ''
  const edit = d.edit === 'none' ? 'used unedited' : d.edit ? `${str(d.edit)} edits` : ''
  return { what: `Feedback${verdict || edit ? `: ${[verdict, edit].filter(Boolean).join(', ')}` : ''}`, detail: str(d.note) }
}

/** Who did what to which resource: what the event did, as "<resource>
 * <done>" (Workflow published, Schedule deleted), and the resource it
 * did it to. Read from the request a change kept (its method and path),
 * so older events, logged with other labels, read the same way. */
export interface EventAction {
  action: string
  resource: { type: string; name: string; agent?: string; workflowId?: string; runId?: string }
}

export interface EventNames {
  agentLabel(agent: string): string
  workflowTitle(agent: string, workflowId: string): string | undefined
}

const PLAIN_NAMES: EventNames = { agentLabel: (a) => a, workflowTitle: () => undefined }

// Each kind of change: its path, and what it did by method.
const ACTIONS: [RegExp, string, (method: string, m: RegExpMatchArray) => string][] = [
  [/^\/workflows\/create$/, 'Workflow', () => 'created'],
  [/^\/agents$/, 'Agent', () => 'created'],
  [/^\/agents\/[^/]+$/, 'Agent', (method) => (method === 'DELETE' ? 'deleted' : 'updated')],
  [/^\/agents\/[^/]+\/workflows$/, 'Workflow', () => 'created'],
  [/^\/agents\/[^/]+\/workflows\/[^/]+$/, 'Workflow', (method) => (method === 'DELETE' ? 'deleted' : 'edited')],
  [/^\/agents\/[^/]+\/workflows\/[^/]+\/publish$/, 'Workflow', () => 'published'],
  [/^\/agents\/[^/]+\/workflows\/[^/]+\/versions\/(\d+)\/restore$/, 'Workflow', (_method, m) => `version ${m[1]} restored`],
  [/^\/agents\/[^/]+\/workflows\/[^/]+\/messages$/, 'Workflow messaging', () => 'changed'],
  [/^\/agents\/[^/]+\/workflows\/[^/]+\/triggers/, 'Webhook', (method) => (method === 'POST' ? 'created' : method === 'DELETE' ? 'deleted' : 'updated')],
  [/^\/agents\/[^/]+\/workflows\/[^/]+\/evals\/criteria/, 'Success criteria', () => 'changed'],
  [/^\/agents\/[^/]+\/workflows\/[^/]+\/evals/, 'Eval case', (method) => (method === 'POST' ? 'added' : method === 'DELETE' ? 'removed' : 'updated')],
  [/^\/agents\/[^/]+\/schedules/, 'Schedule', (method) => (method === 'POST' ? 'created' : method === 'DELETE' ? 'deleted' : 'updated')],
  [/^\/schedules\//, 'Schedule', (method) => (method === 'DELETE' ? 'deleted' : 'updated')],
  [/^\/agents\/[^/]+\/actauth/, 'Permissions', () => 'changed'],
  [/^\/agents\/[^/]+\/tools\/http/, 'HTTP tool', (method) => (method === 'POST' ? 'added' : method === 'DELETE' ? 'removed' : 'updated')],
  [/^\/agents\/[^/]+\/gateway-tools/, 'App tools', () => 'changed'],
  [/^\/agents\/[^/]+\/apps\//, 'App', (method) => (method === 'DELETE' ? 'removed' : 'changed')],
  [/^\/agents\/[^/]+\/skills\//, 'Skill', (method) => (method === 'POST' ? 'added' : method === 'DELETE' ? 'removed' : 'updated')],
  [/^\/agents\/[^/]+\/abilities/, 'Abilities', () => 'changed'],
  [/^\/agents\/[^/]+\/notifier/, 'Messaging app', () => 'changed'],
  [/^\/agents\/[^/]+\/env/, 'Agent secrets', () => 'changed'],
  [/^\/config\/policies\/versions\/(\d+)\/restore$/, 'Shared policies', (_method, m) => `version ${m[1]} restored`],
  [/^\/config\/policies$/, 'Shared policies', () => 'changed'],
  [/^\/config\/models/, 'Models', () => 'changed'],
  [/^\/config\/time-zone$/, 'Time zone', () => 'changed'],
  [/^\/config\/apps/, 'Workspace apps', () => 'changed'],
  [/^\/config\/gateways/, 'App gateway', () => 'changed'],
  [/^\/config\/upgrade$/, 'LoopEngine', () => 'upgraded'],
  [/^\/abilities\//, 'Workspace abilities', () => 'changed'],
]

// Of an agent or a workflow, where the resource is a part of one.
const AGENT_PARTS = new Set(['Permissions', 'HTTP tool', 'App tools', 'App', 'Skill', 'Abilities', 'Messaging app', 'Agent secrets', 'Schedule'])
const WORKFLOW_PARTS = new Set(['Workflow messaging', 'Webhook', 'Success criteria', 'Eval case'])

export function eventAction(e: AuditEvent, names: EventNames = PLAIN_NAMES): EventAction {
  const d = e.data
  const str = (v: unknown) => (typeof v === 'string' ? v : '')
  // A workflow by its name now, or (deleted) as it was, or its id.
  const workflowName = (agent: string, id: string) => {
    const was = Array.isArray(d.changes) ? (d.changes as FieldChange[]).find((c) => c.field === 'title')?.from : undefined
    return names.workflowTitle(agent, id) || str(d.title) || (was && was !== '(none)' ? was : '') || id
  }
  const run = { type: 'Run', name: e.workflow_id ? workflowName(e.agent, e.workflow_id) : 'One-off job', agent: e.agent, ...(e.workflow_id ? { workflowId: e.workflow_id } : {}), ...(e.run_id ? { runId: e.run_id } : {}) }
  if (e.kind === 'decision') return { action: d.approved ? (d.edited ? 'Tool call approved with changes' : 'Tool call approved') : 'Tool call denied', resource: run }
  if (e.kind === 'answer') return { action: 'Question answered', resource: run }
  if (e.kind === 'feedback') return { action: 'Feedback given', resource: run }
  const method = str(d.method).toUpperCase()
  const path = str(d.path)
  const workflow = e.workflow_id ? { workflowId: e.workflow_id } : {}
  for (const [pattern, type, done] of ACTIONS) {
    const m = path.match(pattern)
    if (!m) continue
    const action = `${type} ${done(method, m)}`
    if (type === 'Workflow' && e.workflow_id) return { action, resource: { type: 'Workflow', name: workflowName(e.agent, e.workflow_id), agent: e.agent, ...workflow } }
    if (type === 'Workflow') return { action, resource: { type: 'Workflow', name: str(d.title) || 'New workflow', ...(e.agent ? { agent: e.agent } : {}) } }
    if (WORKFLOW_PARTS.has(type) && e.workflow_id) return { action, resource: { type, name: workflowName(e.agent, e.workflow_id), agent: e.agent, ...workflow } }
    if (type === 'Agent' || AGENT_PARTS.has(type)) {
      const agent = e.agent || (type === 'Agent' && d.body && typeof d.body === 'object' ? str((d.body as Record<string, unknown>).name) : '')
      return { action, resource: { type: type === 'Agent' ? 'Agent' : type, name: agent ? names.agentLabel(agent) : 'Workspace', ...(agent ? { agent } : {}) } }
    }
    return { action, resource: { type: 'Workspace', name: type } }
  }
  // A change with no request kept: its label, and where it was.
  const label = str(d.label) || 'Setting changed'
  if (e.workflow_id) return { action: label, resource: { type: 'Workflow', name: workflowName(e.agent, e.workflow_id), agent: e.agent, ...workflow } }
  if (e.agent) return { action: label, resource: { type: 'Agent', name: names.agentLabel(e.agent), agent: e.agent } }
  return { action: label, resource: { type: 'Workspace', name: 'Settings' } }
}

const CSV_COLUMNS = ['When (UTC)', 'Person', 'Action', 'Resource type', 'Resource', 'Kind', 'Agent', 'Workflow', 'What', 'Detail', 'Case', 'Event', 'Hash']

function csvCell(value: string): string {
  // A leading = + - @ would run as a formula in a spreadsheet.
  const safe = /^[=+\-@]/.test(value) ? `'${value}` : value
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

/** The events as a CSV file, one row each, in the order given. */
export function eventsCsv(events: AuditEvent[], names: EventNames = PLAIN_NAMES): string {
  const rows = events.map((e) => {
    const { what, detail } = eventText(e)
    const { action, resource } = eventAction(e, names)
    return [e.at, e.by ?? '', action, resource.type, resource.name, e.kind, e.agent, e.workflow_id ?? '', what, detail, e.run_id ?? '', String(e.id), e.hash ?? ''].map(csvCell).join(',')
  })
  return [CSV_COLUMNS.join(','), ...rows].join('\r\n') + '\r\n'
}

/** A case in the Cases list. */
export interface AuditCaseRow {
  id: string
  agent: string
  workflowId: string
  workflowTitle: string
  /** Its inputs, in a line. */
  inputs: string
  status: WorkflowRun['status']
  startedAt: string
  finishedAt?: string
  workflowVersion?: number
  /** Everyone who decided or answered something in it. */
  people: string[]
  /** The start of its result, or its error. */
  outcome: string
  /** Saved as one of its workflow's eval cases. */
  evalCase?: boolean
}

export function caseRow(run: WorkflowRun, workflowTitle: string | undefined, evalCase = false): AuditCaseRow {
  const inputs = Object.entries(run.params ?? {}).map(([k, v]) => `${k}: ${v}`).join(' · ')
  const people = [...new Set([...(run.decisions ?? []), ...(run.answers ?? [])].map((d) => d.by).filter((b): b is string => Boolean(b)))]
  return {
    id: run.run_id,
    agent: run.agent,
    workflowId: run.workflow_id,
    workflowTitle: workflowTitle ?? (run.workflow_id || 'One-off job'),
    inputs: short(inputs, 160),
    status: run.status,
    startedAt: run.started_at,
    ...(run.finished_at ? { finishedAt: run.finished_at } : {}),
    ...(workflowVersionOf(run) ? { workflowVersion: workflowVersionOf(run) } : {}),
    people,
    outcome: short(run.status === 'error' ? run.error ?? '' : run.result ?? '', 200),
    ...(evalCase ? { evalCase: true } : {}),
  }
}
