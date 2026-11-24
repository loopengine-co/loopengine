// The Audit page's data (web/audit-page.ts): the workspace's log in words
// and as a CSV file, and its cases (every run kept) as rows. The log is
// core/audit-store.ts's events; the cases, core/workflow-runs.ts's runs.
import type { AuditEvent } from '../core/audit-store.js'
import type { WorkflowRun } from '../core/workflow-runs.js'

const short = (text: string, max: number): string => {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > max ? flat.slice(0, max - 1) + '…' : flat
}

/** An event in words, as the page and the CSV file show it: what
 * happened, and any detail (a reason, an answer, a note). */
export function eventText(e: AuditEvent): { what: string; detail: string } {
  const d = e.data
  const str = (v: unknown) => (typeof v === 'string' ? v : '')
  if (e.kind === 'change') return { what: str(d.label) || 'Changed a setting', detail: '' }
  if (e.kind === 'decision') {
    const what = `${d.approved ? (d.edited ? 'Approved as changed' : 'Approved') : 'Denied'} ${str(d.tool)}`
    return { what, detail: str(d.reason) }
  }
  if (e.kind === 'answer') return { what: 'Answered a question', detail: `${short(str(d.question), 200)} → ${short(str(d.answer), 400)}` }
  const verdict = d.verdict === 'good' ? 'Good' : d.verdict === 'bad' ? 'Bad' : ''
  const edit = d.edit === 'none' ? 'used unedited' : d.edit ? `${str(d.edit)} edits` : ''
  return { what: `Feedback${verdict || edit ? `: ${[verdict, edit].filter(Boolean).join(', ')}` : ''}`, detail: str(d.note) }
}

const CSV_COLUMNS = ['When (UTC)', 'Kind', 'Person', 'Agent', 'Workflow', 'What', 'Detail', 'Case', 'Event', 'Hash']

function csvCell(value: string): string {
  // A leading = + - @ would run as a formula in a spreadsheet.
  const safe = /^[=+\-@]/.test(value) ? `'${value}` : value
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

/** The events as a CSV file, one row each, in the order given. */
export function eventsCsv(events: AuditEvent[]): string {
  const rows = events.map((e) => {
    const { what, detail } = eventText(e)
    return [e.at, e.kind, e.by ?? '', e.agent, e.workflow_id ?? '', what, detail, e.run_id ?? '', String(e.id), e.hash ?? ''].map(csvCell).join(',')
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
  briefVersion?: number
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
    ...(run.versions?.brief ? { briefVersion: run.versions.brief } : {}),
    people,
    outcome: short(run.status === 'error' ? run.error ?? '' : run.result ?? '', 200),
    ...(evalCase ? { evalCase: true } : {}),
  }
}
