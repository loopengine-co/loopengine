// The console's front page (web/workflows-overview-page.ts): every
// workflow in the workspace, across agents, with how it starts, how it's
// been running and what's waiting for a person. Built from what each
// agent's Workflows tab already shows (listAgentWorkflows), every run
// (core/workflow-runs.ts) and the Inbox's open cases (web/inbox-admin.ts).
import type { WorkflowRun } from '../core/workflow-runs.js'
import type { InboxItem } from './inbox-admin.js'
import type { AgentWorkflowView } from './workflow-admin.js'

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

export interface WorkflowOverviewRow {
  agent: string
  agentLabel: string
  id: string
  title: string
  /** How it starts, in words: its schedules and webhooks; "Run now" when
   * nothing else starts it. */
  starts: string[]
  /** Running: a run under way, or a schedule or webhook on to start it.
   * Otherwise it's pending: it only runs when someone starts it. */
  live: boolean
  /** Runs started in the last 7 days, and how many of them failed. */
  runsThisWeek: number
  failedThisWeek: number
  lastRun?: { status: WorkflowRun['status']; at: string }
  /** Its cases waiting for a person in the Inbox. */
  waiting: number
  /** Decisions on its recent runs. */
  approved: number
  refused: number
}

export interface WorkflowsOverview {
  workflows: WorkflowOverviewRow[]
  summary: { workflows: number; runsThisWeek: number; failedThisWeek: number; waiting: number }
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

export function startsOf(view: AgentWorkflowView): string[] {
  const starts = view.schedules.map((s) => (s.status === 'paused' ? `${s.describe} (paused)` : s.describe))
  if (view.webhooks) starts.push(plural(view.webhooks, 'webhook', 'webhooks'))
  if (view.webhooksWaiting) starts.push(`${plural(view.webhooksWaiting, 'webhook', 'webhooks')} waiting for a secret`)
  return starts.length ? starts : ['Run now']
}

export function workflowsOverview(input: {
  workflows: { agent: string; agentLabel: string; view: AgentWorkflowView }[]
  runs: WorkflowRun[]
  waiting: InboxItem[]
  now?: Date
}): WorkflowsOverview {
  const since = (input.now ?? new Date()).getTime() - WEEK_MS
  const rows = input.workflows.map(({ agent, agentLabel, view }): WorkflowOverviewRow => {
    const own = input.runs.filter((r) => r.agent === agent && r.workflow_id === view.id)
    const week = own.filter((r) => Date.parse(r.started_at) >= since)
    const latest = [...own].sort((a, b) => b.started_at.localeCompare(a.started_at))[0]
    return {
      agent,
      agentLabel,
      id: view.id,
      title: view.title || view.id,
      starts: startsOf(view),
      live: own.some((r) => r.status === 'running') || view.webhooks > 0 || view.schedules.some((s) => s.status !== 'paused' && s.status !== 'done' && s.status !== 'cancelled'),
      runsThisWeek: week.length,
      failedThisWeek: week.filter((r) => r.status === 'error').length,
      ...(latest ? { lastRun: { status: latest.status, at: latest.started_at } } : {}),
      waiting: input.waiting.filter((i) => i.agent === agent && i.workflowId === view.id && i.waiting.length).length,
      approved: view.scores?.approvals.approved ?? 0,
      refused: view.scores?.approvals.refused ?? 0,
    }
  })
  // Waiting ones first, then the most recently run, then by name.
  rows.sort((a, b) => b.waiting - a.waiting || (b.lastRun?.at ?? '').localeCompare(a.lastRun?.at ?? '') || a.title.localeCompare(b.title))
  return {
    workflows: rows,
    summary: {
      workflows: rows.length,
      runsThisWeek: rows.reduce((n, r) => n + r.runsThisWeek, 0),
      failedThisWeek: rows.reduce((n, r) => n + r.failedThisWeek, 0),
      waiting: input.waiting.filter((i) => i.waiting.length).length,
    },
  }
}
