// A workflow's audit for a period: what it did, who decided what, how its
// brief changed and whether each change helped, and whether the log
// checks out. In numbers, and in plain sentences for someone who isn't an
// engineer. The Audit page shows it for a workflow
// (/agents/:agent/workflows/:id/audit), and its report
// (…/audit/report) prints it, or saves it as a PDF or JSON, for an auditor
// or a customer.
//
// Built from what's kept: the runs (core/workflow-runs.ts), the brief's
// versions and the settings changes (core/audit-store.ts), each run's cost
// (core/usage.ts with models.yaml's prices) and the log's hash-chain check.
import type { AuditEvent, ChainCheck, Version } from '../core/audit-store.js'
import type { WorkflowRun } from '../core/workflow-runs.js'

export interface AuditCounts {
  runs: number
  done: number
  failed: number
  /** Still running or waiting for a decision. */
  open: number
  decided: number
  approved: number
  /** Approved after a person changed what it would do. */
  changed: number
  denied: number
  answered: number
  feedback: number
  bad: number
  unedited: number
}

export interface AuditPerson {
  by: string
  approved: number
  changed: number
  denied: number
  answered: number
}

export interface AuditDecision {
  at: string
  runId: string
  tool: string
  by?: string
  approved: boolean
  edited: boolean
  reason?: string
  /** For a change: each field, from what the agent asked to what ran. */
  changes?: { field: string; from: string; to: string }[]
}

export interface AuditVersion {
  number: number
  at: string
  by?: string
  reason?: string
  /** Saved within the period (else it was in use when it began). */
  changedInPeriod: boolean
  /** Its runs in the period. */
  counts: AuditCounts
  /** Lines added and removed against the version before it. */
  diff?: { added: string[]; removed: string[] }
}

export interface AuditCase {
  runId: string
  at: string
  inputs: string
  status: WorkflowRun['status']
  briefVersion?: number
  decidedBy: string[]
  outcome: string
}

export interface WorkflowAudit {
  workflow: { agent: string; agentLabel: string; id: string; title: string }
  period: { since: string; until: string }
  counts: AuditCounts
  people: AuditPerson[]
  /** Denied, or changed before approving: the decisions worth reading. */
  overruled: AuditDecision[]
  versions: AuditVersion[]
  changes: { at: string; by?: string; label: string }[]
  cost?: { totalUsd: number; perRunUsd: number; pricedRuns: number }
  cases: AuditCase[]
  verification: ChainCheck
  /** The audit in sentences, most important first. */
  summary: string[]
}

export interface WorkflowAuditInput {
  workflow: WorkflowAudit['workflow']
  since: string
  until: string
  /** Its runs that started in the period. */
  runs: WorkflowRun[]
  /** Each run's cost in US dollars, where known. */
  costs: Map<string, number>
  /** Every brief version, any order. */
  versions: Version[]
  /** Its settings changes (events of kind "change") in the period. */
  changes: AuditEvent[]
  verification: ChainCheck
}

const short = (text: string, max: number): string => {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > max ? flat.slice(0, max - 1) + '…' : flat
}

function counts(runs: WorkflowRun[]): AuditCounts {
  const ds = runs.flatMap((r) => r.decisions ?? [])
  const fs = runs.flatMap((r) => (r.feedback ? [r.feedback] : []))
  return {
    runs: runs.length,
    done: runs.filter((r) => r.status === 'done').length,
    failed: runs.filter((r) => r.status === 'error').length,
    open: runs.filter((r) => r.status === 'running' || r.status === 'awaiting_approval').length,
    decided: ds.length,
    approved: ds.filter((d) => d.approved).length,
    changed: ds.filter((d) => d.approved && d.edited).length,
    denied: ds.filter((d) => !d.approved).length,
    answered: runs.reduce((n, r) => n + (r.answers?.length ?? 0), 0),
    feedback: fs.length,
    bad: fs.filter((f) => f.verdict === 'bad').length,
    unedited: fs.filter((f) => f.edit === 'none' && f.verdict !== 'bad').length,
  }
}

const show = (v: unknown): string => short(v === undefined ? '(none)' : typeof v === 'string' ? v : JSON.stringify(v), 200)

function fieldChanges(before: unknown, after: unknown): { field: string; from: string; to: string }[] | undefined {
  if (!before || !after || typeof before !== 'object' || typeof after !== 'object') return undefined
  const b = before as Record<string, unknown>
  const a = after as Record<string, unknown>
  const fields = [...new Set([...Object.keys(b), ...Object.keys(a)])].filter((k) => JSON.stringify(b[k]) !== JSON.stringify(a[k]))
  return fields.map((field) => ({ field, from: show(b[field]), to: show(a[field]) }))
}

/** Lines in `after` and not `before`, and the reverse (a line diff by
 * longest common subsequence, for briefs of a few hundred lines). */
export function lineDiff(before: string, after: string): { added: string[]; removed: string[] } {
  const a = before.split('\n')
  const b = after.split('\n')
  if (a.length * b.length > 4_000_000) {
    const setA = new Set(a)
    const setB = new Set(b)
    return { added: b.filter((l) => !setA.has(l) && l.trim()), removed: a.filter((l) => !setB.has(l) && l.trim()) }
  }
  const table: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0))
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) table[i][j] = a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1])
  }
  const added: string[] = []
  const removed: string[] = []
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++
      j++
    } else if (table[i + 1][j] >= table[i][j + 1]) removed.push(a[i++])
    else added.push(b[j++])
  }
  removed.push(...a.slice(i))
  added.push(...b.slice(j))
  return { added: added.filter((l) => l.trim()), removed: removed.filter((l) => l.trim()) }
}

const pct = (part: number, whole: number): string => `${Math.round((100 * part) / whole)}%`
const plural = (n: number, word: string, many = `${word}s`): string => `${n.toLocaleString('en-US')} ${n === 1 ? word : many}`
// Dollars: to the cent, or to a tenth of a cent under ten cents.
const dollars = (usd: number): string => `$${usd >= 0.1 ? usd.toFixed(2) : usd >= 0.001 ? usd.toFixed(3) : usd > 0 ? '0.001' : '0'}`
// Someone's words in quotes, without their own final full stop.
const quote = (text: string, max: number): string => `“${short(text, max).replace(/[.!]+$/, '')}”`
const day = (iso: string): string => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })

export function buildWorkflowAudit(input: WorkflowAuditInput): WorkflowAudit {
  const runs = [...input.runs].sort((a, b) => a.started_at.localeCompare(b.started_at))
  const total = counts(runs)

  // Who decided what.
  const people = new Map<string, AuditPerson>()
  const person = (by: string) => people.get(by) ?? people.set(by, { by, approved: 0, changed: 0, denied: 0, answered: 0 }).get(by)!
  for (const r of runs) {
    for (const d of r.decisions ?? []) {
      if (!d.by) continue
      const p = person(d.by)
      if (!d.approved) p.denied++
      else if (d.edited) p.changed++
      else p.approved++
    }
    for (const a of r.answers ?? []) if (a.by) person(a.by).answered++
  }

  const overruled: AuditDecision[] = runs.flatMap((r) => (r.decisions ?? [])
    .filter((d) => !d.approved || d.edited)
    .map((d) => {
      const changes = d.edited ? fieldChanges(d.before, d.after) : undefined
      return { at: d.at, runId: r.run_id, tool: d.tool, ...(d.by ? { by: d.by } : {}), approved: d.approved, edited: Boolean(d.edited), ...(d.reason ? { reason: d.reason } : {}), ...(changes?.length ? { changes } : {}) }
    }))

  // The brief: the version in use when the period began, and each saved in it.
  const all = [...input.versions].sort((a, b) => a.number - b.number)
  const atStart = all.filter((v) => v.at < input.since).at(-1)
  const shown = all.filter((v) => v === atStart || (v.at >= input.since && v.at <= input.until))
  const versions: AuditVersion[] = shown.map((v) => {
    const previous = all.filter((x) => x.number < v.number).at(-1)
    const changedInPeriod = v.at >= input.since
    return {
      number: v.number,
      at: v.at,
      ...(v.by ? { by: v.by } : {}),
      ...(v.reason ? { reason: v.reason } : {}),
      changedInPeriod,
      counts: counts(runs.filter((r) => r.versions?.brief === v.number)),
      ...(changedInPeriod && previous ? { diff: lineDiff(previous.content, v.content) } : {}),
    }
  })

  const priced = runs.filter((r) => input.costs.has(r.run_id))
  const totalUsd = priced.reduce((n, r) => n + input.costs.get(r.run_id)!, 0)
  const cost = priced.length ? { totalUsd, perRunUsd: totalUsd / priced.length, pricedRuns: priced.length } : undefined

  const cases: AuditCase[] = [...runs].reverse().map((r) => ({
    runId: r.run_id,
    at: r.started_at,
    inputs: short(Object.entries(r.params ?? {}).map(([k, v]) => `${k}: ${v}`).join(' · '), 160),
    status: r.status,
    ...(r.versions?.brief ? { briefVersion: r.versions.brief } : {}),
    decidedBy: [...new Set([...(r.decisions ?? []), ...(r.answers ?? [])].map((d) => d.by).filter((b): b is string => Boolean(b)))],
    outcome: short(r.status === 'error' ? r.error ?? '' : r.result ?? '', 200),
  }))

  const changes = input.changes.map((e) => ({ at: e.at, ...(e.by ? { by: e.by } : {}), label: typeof e.data.label === 'string' ? e.data.label : 'Changed a setting' }))

  // ---- The summary, in sentences. ----
  const summary: string[] = []
  const v = input.verification
  summary.push(v.ok
    ? `The audit log checks out: ${plural(v.events, 'event')} verified.`
    : `The audit log does not check out: it's broken at event #${v.broken?.id}. Treat this report's record as unreliable from there on.`)
  if (!total.runs) summary.push('It didn’t run in this period.')
  else {
    summary.push(`${plural(total.runs, 'run')}: ${total.done} done, ${total.failed} failed${total.open ? `, ${total.open} still open` : ''}${total.runs && total.failed ? ` (${pct(total.failed, total.runs)} failed)` : ''}.`)
    if (total.decided) {
      const asAsked = total.approved - total.changed
      summary.push(`People decided ${plural(total.decided, 'request')}: ${asAsked} approved as asked, ${total.changed} changed before approving, ${total.denied} denied.`)
    } else summary.push('Nothing needed a person’s approval.')
    const reasons = [...new Set(overruled.filter((d) => !d.approved && d.reason).map((d) => quote(d.reason!, 80)))].slice(0, 3)
    if (reasons.length) summary.push(`Reasons given for denials include ${reasons.join(', ')}.`)
    if (total.answered) summary.push(`It asked, and people answered, ${plural(total.answered, 'question')}.`)
    if (total.feedback) summary.push(`Feedback on ${plural(total.feedback, 'result')}: ${total.unedited} used unedited, ${total.bad} marked bad.`)
  }
  // The brief: each change in a sentence when there are one or two, else
  // one sentence for them all; and what changed in how people judged its
  // work, from the version before to the one after.
  const saved = versions.filter((x) => x.changedInPeriod)
  const effect = (from: AuditVersion | undefined, to: AuditVersion): string => {
    const rate = (c: AuditCounts) => (c.decided >= 3 ? (c.changed + c.denied) / c.decided : undefined)
    const before = from && rate(from.counts)
    const after = rate(to.counts)
    if (before !== undefined && after !== undefined) return `; requests changed or denied went from ${Math.round(before * 100)}% to ${Math.round(after * 100)}%`
    if (from && from.counts.runs >= 3 && to.counts.runs >= 3) return `; failures went from ${pct(from.counts.failed, from.counts.runs)} to ${pct(to.counts.failed, to.counts.runs)}`
    return ''
  }
  const ran = (x: AuditVersion) => x.counts.runs > 0
  if (saved.length && saved.length <= 2) {
    for (const ver of saved) {
      const previous = versions.filter((x) => x.number < ver.number).at(-1)
      const what = ver.diff ? ` (${plural(ver.diff.added.length, 'line')} added, ${ver.diff.removed.length} removed)` : ''
      const first = !previous && ver.number === 1
      summary.push(first
        ? `The brief was first recorded, as version 1, on ${day(ver.at)}.`
        : `The brief changed to version ${ver.number} on ${day(ver.at)}${ver.by ? ` by ${ver.by}` : ''}${ver.reason ? `, ${quote(ver.reason, 60)}` : ''}${what}${effect(previous, ver)}.`)
    }
  } else if (saved.length > 2) {
    const latest = saved.at(-1)!
    const people = [...new Set(saved.map((x) => x.by).filter((b): b is string => Boolean(b)))]
    const start = versions.find((x) => !x.changedInPeriod)
    const firstRan = versions.find(ran)
    const lastRan = [...versions].reverse().find(ran)
    const change = firstRan && lastRan && firstRan !== lastRan ? effect(firstRan, lastRan).replace(/^; /, ` From version ${firstRan.number} to ${lastRan.number}, `) : ''
    summary.push(`The brief changed ${saved.length} times${start ? `, from version ${start.number}` : ''} to version ${latest.number}, last on ${day(latest.at)}${people.length ? `, by ${people.join(', ')}` : ''}.${change ? `${change}.` : ''}`)
  } else if (versions.length) summary.push(`The brief stayed at version ${versions[0].number} all period.`)
  const otherChanges = changes.filter((c) => !/^Edited the workflow$|^Restored brief version/.test(c.label))
  if (otherChanges.length) summary.push(`${plural(otherChanges.length, 'other setting change')}: ${[...new Set(otherChanges.map((c) => c.label.toLowerCase()))].slice(0, 4).join(', ')}.`)
  if (cost) summary.push(`It cost ${dollars(cost.totalUsd)} in model calls${cost.pricedRuns < total.runs ? ` (for the ${plural(cost.pricedRuns, 'run')} with a known price)` : ''}, ${dollars(cost.perRunUsd)} a run.`)

  return {
    workflow: input.workflow,
    period: { since: input.since, until: input.until },
    counts: total,
    people: [...people.values()].sort((a, b) => b.approved + b.changed + b.denied + b.answered - (a.approved + a.changed + a.denied + a.answered)),
    overruled,
    versions,
    changes,
    ...(cost ? { cost } : {}),
    cases,
    verification: input.verification,
    summary,
  }
}
