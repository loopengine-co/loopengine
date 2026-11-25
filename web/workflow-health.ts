// A workflow's health (the workflow page's Health panel): how its runs
// went over the last 30 days, per workflow version and day by day, and an
// alert when a measure suddenly gets worse. Built from the runs
// (core/workflow-runs.ts: status, decisions, answers, feedback, the brief
// version each ran under) and their model calls' cost (core/usage.ts).
import { workflowVersionOf, type WorkflowRun } from '../core/workflow-runs.js'

export interface HealthNumbers {
  runs: number
  /** Finished, done or failed. */
  finished: number
  failed: number
  /** Approvals decided: approved (of which changed first) or denied. */
  approved: number
  changed: number
  denied: number
  /** Questions answered in its runs. */
  questions: number
  /** Feedback on results: how many, used unedited, bad. */
  feedback: number
  unedited: number
  bad: number
  /** Middle start-to-finish time of finished runs. */
  medianMs?: number
  /** Mean cost of the runs whose every model call has a price, and how
   * many runs that is. */
  costPerRunUsd?: number
  pricedRuns: number
}

export interface HealthVersion extends HealthNumbers {
  /** The workflow version, or null for runs from before versions. */
  version: number | null
  /** Its first and last run in the period. */
  from: string
  to: string
}

export interface HealthDay {
  /** YYYY-MM-DD, UTC. */
  date: string
  runs: number
  failed: number
  decided: number
  /** Denied or changed before approving. */
  overruled: number
}

export type HealthMeasure = 'failure' | 'overruled' | 'bad-feedback'

export interface HealthAlert {
  measure: HealthMeasure
  /** In words, for the panel and the messaging app. */
  text: string
  recent: number
  before: number
}

export interface WorkflowHealth {
  days: number
  since: string
  total: HealthNumbers
  versions: HealthVersion[]
  daily: HealthDay[]
  alerts: HealthAlert[]
}

const DAY = 24 * 60 * 60 * 1000

/** Each run's cost in US dollars, where known. */
export type RunCosts = Map<string, number>

function numbers(runs: WorkflowRun[], costs: RunCosts): HealthNumbers {
  const finished = runs.filter((r) => r.status === 'done' || r.status === 'error')
  const decisions = runs.flatMap((r) => r.decisions ?? [])
  const feedback = runs.flatMap((r) => (r.feedback ? [r.feedback] : []))
  const times = finished.filter((r) => r.finished_at).map((r) => Date.parse(r.finished_at!) - Date.parse(r.started_at)).sort((a, b) => a - b)
  const priced = runs.filter((r) => costs.has(r.run_id))
  return {
    runs: runs.length,
    finished: finished.length,
    failed: finished.filter((r) => r.status === 'error').length,
    approved: decisions.filter((d) => d.approved).length,
    changed: decisions.filter((d) => d.approved && d.edited).length,
    denied: decisions.filter((d) => !d.approved).length,
    questions: runs.reduce((n, r) => n + (r.answers?.length ?? 0), 0),
    feedback: feedback.length,
    unedited: feedback.filter((f) => f.edit === 'none' && f.verdict !== 'bad').length,
    bad: feedback.filter((f) => f.verdict === 'bad').length,
    ...(times.length ? { medianMs: times[Math.floor((times.length - 1) / 2)] } : {}),
    pricedRuns: priced.length,
    ...(priced.length ? { costPerRunUsd: priced.reduce((n, r) => n + costs.get(r.run_id)!, 0) / priced.length } : {}),
  }
}

const rate = (part: number, whole: number) => (whole ? part / whole : 0)
const pct = (r: number) => `${Math.round(r * 100)}%`

/** The last 7 days against the 23 before them: an alert when a rate at
 * least doubled, reached 20%, and rests on at least 5 cases. */
export function healthAlerts(runs: WorkflowRun[], now = Date.now()): HealthAlert[] {
  const cut = new Date(now - 7 * DAY).toISOString()
  const recent = runs.filter((r) => r.started_at >= cut)
  const before = runs.filter((r) => r.started_at < cut)
  const alerts: HealthAlert[] = []
  const check = (measure: HealthMeasure, of: (rs: WorkflowRun[]) => { part: number; whole: number }, text: (now: string, then: string) => string) => {
    const a = of(recent)
    const b = of(before)
    const r = rate(a.part, a.whole)
    const was = rate(b.part, b.whole)
    if (a.whole >= 5 && r >= 0.2 && (b.whole === 0 ? false : r >= 2 * was)) alerts.push({ measure, text: text(pct(r), pct(was)), recent: r, before: was })
  }
  const finished = (rs: WorkflowRun[]) => rs.filter((r) => r.status === 'done' || r.status === 'error')
  check('failure', (rs) => ({ part: finished(rs).filter((r) => r.status === 'error').length, whole: finished(rs).length }), (n, t) => `${n} of runs failed in the last 7 days, up from ${t}.`)
  check('overruled', (rs) => {
    const ds = rs.flatMap((r) => r.decisions ?? [])
    return { part: ds.filter((d) => !d.approved || d.edited).length, whole: ds.length }
  }, (n, t) => `People denied or changed ${n} of its requests in the last 7 days, up from ${t}.`)
  check('bad-feedback', (rs) => {
    const fs = rs.flatMap((r) => (r.feedback ? [r.feedback] : []))
    return { part: fs.filter((f) => f.verdict === 'bad').length, whole: fs.length }
  }, (n, t) => `${n} of its results were marked bad in the last 7 days, up from ${t}.`)
  return alerts
}

/** The workflow's health over the last `days` days, from its runs in
 * that period (any order) and each run's cost where known. */
export function workflowHealth(runs: WorkflowRun[], costs: RunCosts, options: { days?: number; now?: number } = {}): WorkflowHealth {
  const days = options.days ?? 30
  const now = options.now ?? Date.now()
  const since = new Date(now - days * DAY).toISOString()
  const inPeriod = runs.filter((r) => r.started_at >= since).sort((a, b) => a.started_at.localeCompare(b.started_at))

  const byVersion = new Map<number | null, WorkflowRun[]>()
  for (const r of inPeriod) {
    const v = workflowVersionOf(r) ?? null
    byVersion.set(v, [...(byVersion.get(v) ?? []), r])
  }
  const versions = [...byVersion.entries()]
    .map(([version, rs]) => ({ version, from: rs[0].started_at, to: rs.at(-1)!.started_at, ...numbers(rs, costs) }))
    .sort((a, b) => b.from.localeCompare(a.from))

  const daily: HealthDay[] = []
  for (let d = days - 1; d >= 0; d--) {
    const date = new Date(now - d * DAY).toISOString().slice(0, 10)
    const rs = inPeriod.filter((r) => r.started_at.slice(0, 10) === date)
    const ds = rs.flatMap((r) => r.decisions ?? [])
    daily.push({ date, runs: rs.length, failed: rs.filter((r) => r.status === 'error').length, decided: ds.length, overruled: ds.filter((x) => !x.approved || x.edited).length })
  }

  return { days, since, total: numbers(inPeriod, costs), versions, daily, alerts: healthAlerts(inPeriod, now) }
}
