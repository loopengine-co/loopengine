// The console's front page (web/workflows-overview-page.ts): every
// workflow in the workspace, across agents, with how it starts, how it's
// been running and what's waiting for a person. Built from what each
// agent's Workflows tab already shows (listAgentWorkflows), every run
// (core/workflow-runs.ts) and the Inbox's open cases (web/inbox-admin.ts).
import type { WorkflowRun } from '../core/workflow-runs.js'
import type { InboxItem } from './inbox-admin.js'
import type { AgentWorkflowView } from './workflow-admin.js'
import type { Goal, GoalJob } from './goals-admin.js'

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

// The home page's tree: each goal, its workflows and groups of workflows
// (a chained one right after the one that starts it); then workflows no
// goal points to.
export interface HomeFlow {
  agent: string
  id: string
  starts: string[]
  waiting: number
  /** Started by the workflow listed before it, when that one finishes. */
  then: boolean
  /** No longer on its agent. */
  gone?: true
}

export interface HomeJob {
  id: string
  title: string
  kind: 'recurring' | 'once'
  measure: string
  state: string
  agent: string
  flows: HomeFlow[]
  /** A group's steps in order, each with whether it's built yet. */
  group?: { steps: { name: string; built: boolean }[] }
}

export interface HomeOverview extends WorkflowsOverview {
  goals: { id: string; goal: string; measure: string; jobs: HomeJob[] }[]
  loose: WorkflowOverviewRow[]
}

type TreeJob = Pick<GoalJob, 'id' | 'title' | 'kind' | 'measure' | 'state' | 'agent' | 'doers' | 'chain' | 'group'>

export function homeOverview(overview: WorkflowsOverview, goals: (Pick<Goal, 'id' | 'goal' | 'standalone'> & { brief?: { measure?: string }; jobs: TreeJob[] })[]): HomeOverview {
  const rows = new Map(overview.workflows.map((r) => [`${r.agent}|${r.id}`, r]))
  const used = new Set<string>()
  const toJob = (j: TreeJob): HomeJob => {
    const flows = j.doers.flatMap((d) => (d.type === 'workflow' ? [`${d.agent}|${d.workflowId}`] : []))
    const after = new Map((j.chain ?? []).map((st) => [`${st.run.agent}|${st.run.workflowId}`, `${st.after.agent}|${st.after.workflowId}`]))
    const ordered = flows.filter((k) => !after.has(k) || !flows.includes(after.get(k)!))
    for (let i = 0; i < ordered.length; i++) for (const k of flows) if (after.get(k) === ordered[i] && !ordered.includes(k)) ordered.splice(i + 1, 0, k)
    for (const k of flows) if (!ordered.includes(k)) ordered.push(k)
    return {
      id: j.id,
      title: j.title,
      kind: j.kind,
      measure: j.measure,
      state: j.state,
      agent: j.agent.name,
      flows: ordered.map((k, i) => {
        used.add(k)
        const [agent, id] = k.split('|') as [string, string]
        const row = rows.get(k)
        return { agent, id, starts: row?.starts ?? [], waiting: row?.waiting ?? 0, then: i > 0 && after.get(k) === ordered[i - 1], ...(row ? {} : { gone: true as const }) }
      }),
      ...(j.group ? { group: { steps: j.group.steps.map((st) => ({ name: st.name, built: Boolean(st.built) })) } } : {}),
    }
  }
  // A goal's suggestions not built yet stay on its own page; one-off jobs
  // from before goals suggested only workflows aren't shown, and workflows
  // built from jobs once submitted without a goal are listed apart.
  const shown = (j: TreeJob) => j.state === 'active' && j.kind !== 'once'
  const tree = goals.filter((g) => !g.standalone).map((g) => ({ id: g.id, goal: g.goal, measure: g.brief?.measure ?? '', jobs: g.jobs.filter(shown).map(toJob) }))
  return { ...overview, goals: tree, loose: overview.workflows.filter((r) => !used.has(`${r.agent}|${r.id}`)) }
}
