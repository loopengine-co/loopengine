// Feedback on a workflow's runs, and Self-Improve: what people said about
// its results (from the Inbox, a signed link in a messaging app or an
// email, a callback, or an app through the API: see FeedbackSource), as a
// summary for its Feedback tab; and, from that, changes to its prompt and
// new success criteria a model suggests, for a person to review, add to
// the workflow's draft (web/workflow-drafts.ts) and publish as its next
// version. Nothing here changes a workflow by itself.
import { randomUUID } from 'node:crypto'
import type { ModelCall } from '../core/run-agent.js'
import type { FeedbackSource, WorkflowRun } from '../core/workflow-runs.js'
import { EvidenceError, type CriterionKind, type EvalCriterion } from './workflow-evidence.js'

/** One piece of feedback, as the Feedback tab lists it. */
export interface FeedbackItem {
  runId: string
  at: string
  verdict?: 'good' | 'bad'
  edit?: 'none' | 'light' | 'heavy'
  note?: string
  by?: string
  source?: FeedbackSource
  /** The run's inputs, in a line. */
  inputs: string
  /** The start of its result, and of the text used instead when it was
   * changed. */
  result: string
  final?: string
  workflowVersion?: number
}

export interface FeedbackSummary {
  days: number
  /** Finished runs in the period, and how many got feedback. */
  runs: number
  total: number
  good: number
  bad: number
  /** Results changed before they were used, a little or a lot. */
  edited: number
  /** Feedback by where it came from. */
  sources: Partial<Record<FeedbackSource | 'unknown', number>>
  /** Newest first. */
  items: FeedbackItem[]
  /** Bad, edited or with a note: what Self-Improve learns from. */
  actionable: number
}

const excerpt = (text: string | undefined, max: number) => {
  const t = (text ?? '').trim()
  return t.length > max ? t.slice(0, max - 1) + '…' : t
}

/** Whether a piece of feedback says something to learn from. */
export function isActionable(f: { verdict?: string; edit?: string; note?: string }): boolean {
  return f.verdict === 'bad' || f.edit === 'light' || f.edit === 'heavy' || Boolean(f.note)
}

/** A workflow's feedback over `days`, from its runs (each carries the
 * latest feedback given on it). */
export function feedbackSummary(runs: WorkflowRun[], days: number): FeedbackSummary {
  const finished = runs.filter((r) => r.status === 'done')
  const given = finished.filter((r) => r.feedback).sort((a, b) => b.feedback!.at.localeCompare(a.feedback!.at))
  const sources: FeedbackSummary['sources'] = {}
  for (const r of given) {
    const k = r.feedback!.source ?? 'unknown'
    sources[k] = (sources[k] ?? 0) + 1
  }
  const items = given.map((r): FeedbackItem => {
    const f = r.feedback!
    return {
      runId: r.run_id, at: f.at,
      ...(f.verdict ? { verdict: f.verdict } : {}), ...(f.edit ? { edit: f.edit } : {}), ...(f.note ? { note: f.note } : {}),
      ...(f.by ? { by: f.by } : {}), ...(f.source ? { source: f.source } : {}),
      inputs: excerpt(Object.entries(r.params ?? {}).map(([k, v]) => `${k}: ${v}`).join(' · '), 200),
      result: excerpt(r.result, 600),
      ...(f.final !== undefined && f.edit !== 'none' ? { final: excerpt(f.final, 600) } : {}),
      ...((r.versions?.workflow ?? r.versions?.brief) ? { workflowVersion: r.versions!.workflow ?? r.versions!.brief } : {}),
    }
  })
  return {
    days, runs: finished.length, total: given.length,
    good: given.filter((r) => r.feedback!.verdict === 'good').length,
    bad: given.filter((r) => r.feedback!.verdict === 'bad').length,
    edited: given.filter((r) => r.feedback!.edit === 'light' || r.feedback!.edit === 'heavy').length,
    sources, items: items.slice(0, 100), actionable: given.filter((r) => isActionable(r.feedback!)).length,
  }
}

export const IMPROVE_PROMPT = `You improve an AI workflow from what people said about its results. You get its prompt (what the agent follows on every run), its result format, its success criteria, its tools, and feedback on recent runs: each run's inputs, the result it gave, whether a person marked it good or bad, their note, and the text they actually used when they changed the result.

Find what the feedback says should change: mistakes that recur, rules the agent missed, the tone, length or format people keep fixing, facts it needed and didn't have. Then change the prompt as little as it takes to fix them:
- Keep everything that works, word for word: its structure, its rules, its examples. Edit or add only what the feedback supports; never remove a rule because one run broke it.
- Write each change as a plain instruction the agent can follow, in the prompt's own style and language. Put it where it belongs (a rule with the rules, an example with the examples).
- Never invent facts, policies, prices or names that aren't in the prompt or the feedback. When a fix needs a fact you don't have, say so in "open" instead.
- Ignore feedback that is about one case only, or that contradicts other feedback, unless a pattern is clear.
- Good feedback tells you what to keep: don't change what people marked good.

Also suggest up to four new success criteria: yes or no checks that a good result passes, for what people kept correcting, each under 20 words ("The reply states the refund amount", "It signs off with the team's name"). Leave out any the current criteria already cover. Each has "kind": "judge" (a reviewer decides, most of them), or "contains" / "not_contains" with "value" for an exact phrase the feedback demands.

Reply with JSON only:
{"summary": "<one or two sentences: what the feedback shows>",
 "changes": [{"what": "<the change, in a short sentence>", "why": "<the feedback behind it, briefly>"}],
 "instructions": "<the whole prompt, with the changes made>",
 "criteria": [{"text": "...", "kind": "judge"}],
 "open": ["<a question only a person can answer, if any>"]}
If the feedback doesn't call for any change, keep "instructions" exactly as given, and leave "changes" and "criteria" empty.`

export interface ImproveSuggestion {
  summary: string
  changes: { what: string; why: string }[]
  /** The whole prompt with the changes made (the same as given when
   * nothing should change). */
  instructions: string
  criteria: EvalCriterion[]
  open: string[]
  /** How many pieces of feedback it read. */
  basedOn: number
}

const KINDS: CriterionKind[] = ['judge', 'contains', 'not_contains']

/** Changes to a workflow's prompt and new success criteria, suggested from
 * its feedback, for a person to review. Reads the feedback worth learning
 * from (bad, changed or with a note), newest first, and a few marked good
 * for what to keep. */
export async function suggestImprovements(model: ModelCall, input: {
  title: string
  instructions: string
  output?: string
  criteria: { text: string; kind: string; value?: string }[]
  tools: string[]
  items: FeedbackItem[]
}): Promise<ImproveSuggestion> {
  const learn = input.items.filter(isActionable).slice(0, 14)
  const keep = input.items.filter((i) => !isActionable(i) && i.verdict === 'good').slice(0, 4)
  if (!learn.length) throw new EvidenceError('There is no feedback to learn from yet: mark a result bad, change it, or add a note, from the Inbox, a messaging app or the API.')
  const block = (i: FeedbackItem, n: number) =>
    `<run n="${n}">\n<inputs>${i.inputs || 'none'}</inputs>\n<result>${i.result}</result>\n` +
    `<feedback verdict="${i.verdict ?? 'none'}" edited="${i.edit ?? 'no'}">${i.note ?? ''}</feedback>\n` +
    (i.final ? `<used_instead>${i.final}</used_instead>\n` : '') + '</run>'
  const content = `The workflow: ${input.title}\n\n<prompt>\n${input.instructions.slice(0, 20000)}\n</prompt>\n\n` +
    `<result_format>${input.output ?? 'none'}</result_format>\n\n` +
    `<success_criteria>\n${input.criteria.map((c) => `- [${c.kind}${c.value ? `: ${c.value}` : ''}] ${c.text}`).join('\n') || 'none'}\n</success_criteria>\n\n` +
    `Its tools: ${input.tools.length ? input.tools.join(', ') : 'none'}\n\n` +
    `Feedback to learn from (newest first):\n${learn.map((i, n) => block(i, n + 1)).join('\n')}\n\n` +
    (keep.length ? `Results people marked good (keep what made them good):\n${keep.map((i, n) => block(i, n + 1)).join('\n')}` : '')
  const response = await model([{ role: 'user', content }], IMPROVE_PROMPT, [])
  const text = response.content.filter((b) => b.type === 'text').map((b) => b.text ?? '').join('')
  const match = /\{[\s\S]*\}/.exec(text)
  let parsed: Record<string, unknown> = {}
  try {
    parsed = JSON.parse(match?.[0] ?? '') as Record<string, unknown>
  } catch {
    throw new EvidenceError('The model didn’t give usable suggestions this time: try again.')
  }
  const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
  const instructions = str(parsed.instructions, 30000) || input.instructions
  const have = new Set(input.criteria.map((c) => c.text.toLowerCase()))
  const criteria = (Array.isArray(parsed.criteria) ? parsed.criteria : []).flatMap((raw): EvalCriterion[] => {
    const c = (raw ?? {}) as Record<string, unknown>
    const t = str(c.text, 300)
    let kind: CriterionKind = KINDS.includes(c.kind as CriterionKind) ? (c.kind as CriterionKind) : 'judge'
    const value = str(c.value, 300)
    if (kind !== 'judge' && !value) kind = 'judge'
    return t && !have.has(t.toLowerCase()) ? [{ id: randomUUID().slice(0, 8), text: t, kind, ...(kind !== 'judge' ? { value } : {}) }] : []
  }).slice(0, 4)
  return {
    summary: str(parsed.summary, 600),
    changes: (Array.isArray(parsed.changes) ? parsed.changes : []).flatMap((raw) => {
      const c = (raw ?? {}) as Record<string, unknown>
      const what = str(c.what, 300)
      return what ? [{ what, why: str(c.why, 400) }] : []
    }).slice(0, 10),
    instructions,
    criteria,
    open: (Array.isArray(parsed.open) ? parsed.open : []).map((o) => str(o, 300)).filter(Boolean).slice(0, 5),
    basedOn: learn.length + keep.length,
  }
}
