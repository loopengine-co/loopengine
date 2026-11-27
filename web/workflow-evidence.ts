// A workflow's evidence: what shows it works. Three kinds, shown on its
// Evidence tab (web/agents-config-page.ts):
//
//   - Live scores, from its runs (core/workflow-runs.ts): how many ended
//     and failed, the approvals people gave or refused while they ran, and
//     the feedback an app or person reported afterwards
//     (POST /agents/:name/runs/:id/feedback): the text actually used,
//     compared with the result (none, light or heavy edits), and a verdict.
//   - Eval cases: real inputs, and when there is one a good result to
//     compare against, kept beside its skill
//     (agents/<name>/skills/<id>/evals.json). A case is usually saved from
//     a past run, its result edited into the good one.
//   - Criteria: the workflow's yes or no checks, in the same file. Some a
//     program answers (a phrase is or isn't in the result, a tool was or
//     wasn't called); the rest a judge model answers, one call per case
//     for all of them, a model other than the workflow's own (models
//     favour their own writing). With none set, the one check is whether
//     the result matches the case's good result.
//   - Eval results: each time the cases are run, as a test run (tools its
//     rules don't allow aren't run, nobody is asked anything), every
//     result is checked against every criterion; a round reports each
//     criterion's pass rate and how many cases passed them all. A crash
//     fails every check. The latest 10 rounds are kept.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { ModelCall } from '#core/run-agent.js'
import { FEEDBACK_SOURCES, type FeedbackSource, type RunFeedback, type WorkflowRun } from '#core/workflow-runs.js'
import { checkOutput, type JsonSchema } from '#core/output-schema.js'
import { editAmount } from './goals-admin.js'

export class EvidenceError extends Error {}

// ---------- live scores ----------

export interface WorkflowScores {
  /** Runs counted (the latest 100 of this workflow). */
  runs: number
  done: number
  failed: number
  approvals: { approved: number; refused: number }
  feedback: { count: number; good: number; bad: number; edits: { none: number; light: number; heavy: number } }
}

export function workflowScores(runs: WorkflowRun[]): WorkflowScores {
  const recent = runs.slice(0, 100)
  const scores: WorkflowScores = {
    runs: recent.length,
    done: 0,
    failed: 0,
    approvals: { approved: 0, refused: 0 },
    feedback: { count: 0, good: 0, bad: 0, edits: { none: 0, light: 0, heavy: 0 } },
  }
  for (const run of recent) {
    if (run.status === 'done') scores.done++
    if (run.status === 'error') scores.failed++
    for (const d of run.decisions ?? []) {
      if (d.approved) scores.approvals.approved++
      else scores.approvals.refused++
    }
    const f = run.feedback
    if (!f) continue
    scores.feedback.count++
    if (f.verdict === 'good') scores.feedback.good++
    if (f.verdict === 'bad') scores.feedback.bad++
    if (f.edit) scores.feedback.edits[f.edit]++
  }
  return scores
}

/** Feedback on a finished run, from an app or a person: `final`, the text
 * actually used (an edited draft, say), and/or `verdict` good or bad,
 * and a short `note`; `source`, where it came from, and `by`, who gave
 * it, when the caller says (see FeedbackSource). */
export function runFeedbackFrom(run: WorkflowRun, body: Record<string, unknown>, given: { source?: FeedbackSource; by?: string } = {}): RunFeedback {
  if (run.status !== 'done') throw new EvidenceError('Only a run that finished with a result can get feedback.')
  const verdict = body.verdict === 'good' || body.verdict === 'bad' ? body.verdict : undefined
  if (body.verdict !== undefined && body.verdict !== null && !verdict) throw new EvidenceError('verdict must be "good" or "bad".')
  const final = typeof body.final === 'string' ? body.final.slice(0, 50000) : undefined
  const note = typeof body.note === 'string' && body.note.trim() ? body.note.trim().slice(0, 1000) : undefined
  if (!verdict && final === undefined) throw new EvidenceError('Send final (the text actually used) or verdict ("good" or "bad").')
  return {
    ...(verdict ? { verdict } : {}),
    ...(final !== undefined ? { final, edit: editAmount(run.result ?? '', final) } : {}),
    ...(note ? { note } : {}),
    ...(given.source ? { source: given.source } : {}),
    ...(given.by ? { by: given.by.slice(0, 120) } : {}),
    at: new Date().toISOString(),
  }
}

/** A source an app names for its feedback, or undefined for none or one
 * not known. */
export function feedbackSourceOf(value: unknown): FeedbackSource | undefined {
  return typeof value === 'string' && (FEEDBACK_SOURCES as string[]).includes(value) ? (value as FeedbackSource) : undefined
}

// ---------- eval cases ----------

export interface EvalCase {
  id: string
  params: Record<string, string>
  /** The good result to compare against; empty for a case checked only
   * on criteria that need none. */
  reference: string
  /** The run it was saved from. */
  fromRun?: string
  createdAt: string
}

/** A yes or no check on every result. `judge`: a statement the judge
 * says is true or false of the result. `reference`: the result matches
 * the case's good result (cases without one skip it). `contains` /
 * `not_contains`: `value` is or isn't in the result, ignoring case.
 * `tool_called` / `tool_not_called`: the run did or didn't call tool
 * `value` (in a test run, a call it would have made counts). */
export type CriterionKind = 'judge' | 'reference' | 'contains' | 'not_contains' | 'tool_called' | 'tool_not_called' | 'output_schema'

/** The check every round adds for a workflow with an output schema: its
 * result matches the schema (core/output-schema.ts), checked in code. */
export const OUTPUT_SCHEMA_CRITERION: EvalCriterion = { id: 'output-schema', text: 'Matches the output schema', kind: 'output_schema' }

export interface EvalCriterion {
  id: string
  text: string
  kind: CriterionKind
  value?: string
}

export interface EvalCheck {
  criterionId: string
  pass: boolean
  reason?: string
}

export interface StandIn {
  tool: string
  input: Record<string, unknown>
  replayed: boolean
}

export interface EvalCaseResult {
  caseId: string
  result?: string
  error?: string
  /** The tools the test run called. */
  tools?: string[]
  /** The calls a test run doesn't make (they'd change something, or
   * need approval): each with whether it got its reply from the case's
   * own run, or a note to assume it worked. */
  standIns?: StandIn[]
  checks?: EvalCheck[]
  /** Rounds from before criteria: a 1-5 score. */
  score?: number
  reason?: string
}

export interface EvalRound {
  at: string
  /** The workflow version it tested (core/audit-store.ts), when kept. */
  workflowVersion?: number
  /** Set on a round that tested the draft, not a published version: when
   * that draft was saved, so a later edit shows the round is out of date. */
  draft?: { savedAt: string }
  /** On rounds from when only the brief was versioned: the same number. */
  briefVersion?: number
  /** The workflow's model and the judge's, as "provider model". */
  model: string
  judge: string
  cases: EvalCaseResult[]
  /** The criteria the round checked, as they were. */
  criteria?: EvalCriterion[]
  /** Each criterion's pass rate: cases that passed it, of those it
   * applied to. */
  passRates?: { criterionId: string; passed: number; total: number }[]
  /** Cases that passed every check that applied to them. */
  allPassed?: number
  /** Rounds from before criteria: the mean 1-5 score. */
  average?: number
}

export interface WorkflowEvals {
  cases: EvalCase[]
  criteria: EvalCriterion[]
  rounds: EvalRound[]
  /** Set while a round is running; `draft` when it's testing the draft. */
  running?: { startedAt: string; done: number; total: number; draft?: boolean }
}

const MAX_CASES = 30
const MAX_ROUNDS = 10
const MAX_CRITERIA = 8
const CRITERION_KINDS: CriterionKind[] = ['judge', 'reference', 'contains', 'not_contains', 'tool_called', 'tool_not_called']

/** The check a workflow has before anyone sets criteria. */
export const REFERENCE_CRITERION: EvalCriterion = { id: 'reference', text: 'Matches the good result: the same facts and decisions', kind: 'reference' }

function evalsFile(agentDir: string, workflowId: string): string {
  return join(agentDir, 'skills', workflowId, 'evals.json')
}

export function readEvals(agentDir: string, workflowId: string): WorkflowEvals {
  try {
    const raw = JSON.parse(readFileSync(evalsFile(agentDir, workflowId), 'utf8')) as Partial<WorkflowEvals>
    return { cases: Array.isArray(raw.cases) ? raw.cases : [], criteria: Array.isArray(raw.criteria) ? raw.criteria : [], rounds: Array.isArray(raw.rounds) ? raw.rounds : [], ...(raw.running ? { running: raw.running } : {}) }
  } catch {
    return { cases: [], criteria: [], rounds: [] }
  }
}

function writeEvals(agentDir: string, workflowId: string, evals: WorkflowEvals): void {
  const file = evalsFile(agentDir, workflowId)
  if (!existsSync(dirname(file))) throw new EvidenceError(`No workflow ${workflowId}.`)
  mkdirSync(dirname(file), { recursive: true })
  const temp = `${file}.${process.pid}.tmp`
  writeFileSync(temp, `${JSON.stringify(evals, null, 2)}\n`)
  renameSync(temp, file)
}

/** Adds a case: from a past run (its inputs, and its result unless a
 * `reference` is given), or from `params` and a `reference`. */
export function addEvalCase(agentDir: string, workflowId: string, input: { run?: WorkflowRun; params?: Record<string, string>; reference?: unknown }): EvalCase {
  const evals = readEvals(agentDir, workflowId)
  if (evals.cases.length >= MAX_CASES) throw new EvidenceError(`A workflow keeps up to ${MAX_CASES} eval cases; remove one first.`)
  // The good result: what was given, else the text a person actually used
  // (feedback's `final`, their edit of the result), else the result.
  const reference = (typeof input.reference === 'string' && input.reference.trim() ? input.reference.trim() : (input.run?.feedback?.final?.trim() || input.run?.result?.trim())) ?? ''
  const params = input.run?.params ?? input.params ?? {}
  if (!reference && !Object.keys(params).length) throw new EvidenceError('An eval case needs its inputs, a good result, or both.')
  if (input.run && evals.cases.some((c) => c.fromRun === input.run!.run_id)) throw new EvidenceError('That run is already an eval case.')
  const c: EvalCase = { id: randomUUID().slice(0, 8), params, reference: reference.slice(0, 50000), ...(input.run ? { fromRun: input.run.run_id } : {}), createdAt: new Date().toISOString() }
  writeEvals(agentDir, workflowId, { ...evals, cases: [...evals.cases, c] })
  return c
}

export function updateEvalCase(agentDir: string, workflowId: string, caseId: string, reference: unknown): void {
  const evals = readEvals(agentDir, workflowId)
  if (typeof reference !== 'string') throw new EvidenceError('reference must be text; send "" for none.')
  if (!evals.cases.some((c) => c.id === caseId)) throw new EvidenceError('No such eval case.')
  writeEvals(agentDir, workflowId, { ...evals, cases: evals.cases.map((c) => (c.id === caseId ? { ...c, reference: reference.trim().slice(0, 50000) } : c)) })
}

export function removeEvalCase(agentDir: string, workflowId: string, caseId: string): void {
  const evals = readEvals(agentDir, workflowId)
  writeEvals(agentDir, workflowId, { ...evals, cases: evals.cases.filter((c) => c.id !== caseId) })
}

/** Replaces the workflow's criteria. Each needs its words; a code check
 * needs its value. */
export function setEvalCriteria(agentDir: string, workflowId: string, input: unknown): EvalCriterion[] {
  const criteria = checkEvalCriteria(input)
  const evals = readEvals(agentDir, workflowId)
  writeEvals(agentDir, workflowId, { ...evals, criteria })
  return criteria
}

/** Criteria as given, checked (each its words, a value where its kind
 * needs one, at most MAX_CRITERIA), without saving them. */
export function checkEvalCriteria(input: unknown): EvalCriterion[] {
  if (!Array.isArray(input)) throw new EvidenceError('criteria must be a list.')
  if (input.length > MAX_CRITERIA) throw new EvidenceError(`Keep it to ${MAX_CRITERIA} criteria: the ones that matter most.`)
  const used = new Set<string>()
  const criteria = input.map((raw, i): EvalCriterion => {
    const c = (raw ?? {}) as Record<string, unknown>
    const kind = CRITERION_KINDS.includes(c.kind as CriterionKind) ? (c.kind as CriterionKind) : 'judge'
    const text = typeof c.text === 'string' ? c.text.trim().slice(0, 300) : ''
    const value = typeof c.value === 'string' ? c.value.trim().slice(0, 300) : ''
    if (!text) throw new EvidenceError(`Criterion ${i + 1} needs its words.`)
    if (kind !== 'judge' && kind !== 'reference' && !value) throw new EvidenceError(`Criterion ${i + 1} needs ${kind.startsWith('tool') ? 'the tool' : 'the text to look for'}.`)
    let id = typeof c.id === 'string' && /^[a-z0-9-]{1,40}$/.test(c.id) ? c.id : randomUUID().slice(0, 8)
    if (used.has(id)) id = randomUUID().slice(0, 8)
    used.add(id)
    return { id, text, kind, ...(value && kind !== 'judge' && kind !== 'reference' ? { value } : {}) }
  })
  return criteria
}

/** The criteria a round checks: the workflow's, or with none set,
 * whether the result matches the good result. */
export function effectiveCriteria(evals: Pick<WorkflowEvals, 'criteria'>): EvalCriterion[] {
  return evals.criteria.length ? evals.criteria : [REFERENCE_CRITERION]
}

/** The checks a program answers, on one result. */
export function codeCheck(criterion: EvalCriterion, run: { result: string; tools: string[]; outputSchema?: JsonSchema }): EvalCheck | undefined {
  const value = (criterion.value ?? '').toLowerCase()
  const text = run.result.toLowerCase()
  switch (criterion.kind) {
    case 'contains': return { criterionId: criterion.id, pass: text.includes(value), ...(text.includes(value) ? {} : { reason: `"${criterion.value}" isn't in the result.` }) }
    case 'not_contains': return { criterionId: criterion.id, pass: !text.includes(value), ...(text.includes(value) ? { reason: `"${criterion.value}" is in the result.` } : {}) }
    case 'tool_called': {
      const called = run.tools.some((t) => t.toLowerCase() === value)
      return { criterionId: criterion.id, pass: called, ...(called ? {} : { reason: `It didn't call ${criterion.value}.` }) }
    }
    case 'tool_not_called': {
      const called = run.tools.some((t) => t.toLowerCase() === value)
      return { criterionId: criterion.id, pass: !called, ...(called ? { reason: `It called ${criterion.value}.` } : {}) }
    }
    case 'output_schema': {
      if (!run.outputSchema) return { criterionId: criterion.id, pass: true }
      const check = checkOutput(run.outputSchema, run.result)
      return { criterionId: criterion.id, pass: check.ok, ...(check.ok ? {} : { reason: check.errors.join('; ').slice(0, 500) }) }
    }
    default: return undefined
  }
}

export const EVAL_CRITERIA_PROMPT = `You check one result of an AI agent's workflow against a list of statements. For each statement, say whether it is true of the result.

Judge substance, not style: the same facts and decisions in other words count. A test run doesn't make calls that need approval; a result saying it would have made one, or a call listed as attempted, counts as making it. When a statement can't be checked from what you're given, it is false, and say why.

Reply with JSON only: {"checks": [{"id": "<the statement's id>", "pass": true or false, "reason": "<one sentence; required when false>"}]}, one entry per statement.`

/** The judge's answers for one result, one call for all its statements. */
export async function judgeCriteria(judge: ModelCall, input: { instructions: string; reference?: string; result: string; tools: string[]; criteria: EvalCriterion[] }): Promise<EvalCheck[]> {
  const statements = input.criteria.map((c) => `- ${c.id}: ${c.kind === 'reference' ? 'The result has the same facts and decisions as the good result (wording may differ).' : c.text}`).join('\n')
  const content = `The workflow's instructions:\n<instructions>\n${input.instructions.slice(0, 12000)}\n</instructions>\n\n` +
    (input.reference ? `The good result for these inputs:\n<good_result>\n${input.reference.slice(0, 12000)}\n</good_result>\n\n` : '') +
    `Tools the run called: ${input.tools.length ? input.tools.join(', ') : 'none'}\n\nThe result to check:\n<result>\n${input.result.slice(0, 12000)}\n</result>\n\nThe statements:\n${statements}`
  const response = await judge([{ role: 'user', content }], EVAL_CRITERIA_PROMPT, [])
  const text = response.content.filter((b) => b.type === 'text').map((b) => b.text ?? '').join('')
  const match = /\{[\s\S]*\}/.exec(text)
  let parsed: { checks?: unknown } = {}
  try {
    parsed = JSON.parse(match?.[0] ?? '') as { checks?: unknown }
  } catch {}
  const answers = new Map<string, { pass: boolean; reason: string }>()
  for (const a of Array.isArray(parsed.checks) ? parsed.checks : []) {
    const x = (a ?? {}) as Record<string, unknown>
    if (typeof x.id === 'string' && typeof x.pass === 'boolean') answers.set(x.id, { pass: x.pass, reason: typeof x.reason === 'string' ? x.reason.slice(0, 400) : '' })
  }
  if (!answers.size) throw new Error('The judge did not answer the checks.')
  return input.criteria.map((c) => {
    const a = answers.get(c.id)
    return a ? { criterionId: c.id, pass: a.pass, ...(a.reason && !a.pass ? { reason: a.reason } : {}) } : { criterionId: c.id, pass: false, reason: 'The judge gave no answer for this check.' }
  })
}

/** Every check on one case's result: the program's, then the judge's in
 * one call. A case with no good result skips the reference check; a
 * failed run fails every check that applies. */
export async function checkCase(judge: ModelCall, input: { instructions: string; criteria: EvalCriterion[]; reference: string; outputSchema?: JsonSchema; run: { result: string; tools: string[] } | { error: string } }): Promise<EvalCheck[]> {
  const applies = input.criteria.filter((c) => c.kind !== 'reference' || input.reference.trim())
  if ('error' in input.run) {
    const error = input.run.error
    return applies.map((c) => ({ criterionId: c.id, pass: false, reason: `The run failed: ${error.slice(0, 200)}` }))
  }
  const run = { ...input.run, ...(input.outputSchema ? { outputSchema: input.outputSchema } : {}) }
  const coded = new Map(applies.flatMap((c) => { const r = codeCheck(c, run); return r ? [[c.id, r] as const] : [] }))
  const forJudge = applies.filter((c) => !coded.has(c.id))
  let judged = new Map<string, EvalCheck>()
  if (forJudge.length) {
    try {
      judged = new Map((await judgeCriteria(judge, { instructions: input.instructions, reference: input.reference || undefined, result: run.result, tools: run.tools, criteria: forJudge })).map((c) => [c.criterionId, c]))
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err)
      judged = new Map(forJudge.map((c) => [c.id, { criterionId: c.id, pass: false, reason }]))
    }
  }
  return applies.map((c) => coded.get(c.id) ?? judged.get(c.id)!)
}

/** A round's pass rate per criterion, and the cases that passed all. */
export function roundSummary(criteria: EvalCriterion[], cases: EvalCaseResult[]): Pick<EvalRound, 'passRates' | 'allPassed'> {
  const passRates = criteria.map((c) => {
    const checks = cases.flatMap((r) => (r.checks ?? []).filter((x) => x.criterionId === c.id))
    return { criterionId: c.id, passed: checks.filter((x) => x.pass).length, total: checks.length }
  })
  return { passRates, allPassed: cases.filter((r) => (r.checks ?? []).length && r.checks!.every((x) => x.pass)).length }
}

export const DRAFT_CRITERIA_PROMPT = `You write the checks a workflow's results are tested against, from its brief: what the agent is told to do, its rules and policies.

Write three to six yes or no checks, the ones that matter most: a result failing one is a result a person would have to fix. Each checks one thing, in a short statement under 20 words that is true of a good result ("The reply gives the order's tracking number", "It doesn't promise a refund"); split a rule with several parts into separate checks, keeping the ones that matter most. Take them from the brief's rules and its job; never invent requirements it doesn't state.

Each check has a kind:
- "judge": a statement a reviewer decides by reading the result (most checks).
- "contains" / "not_contains" with "value": an exact phrase that must or mustn't appear, only when the brief names the exact words (a sign-off, a banned phrase).
- "tool_called" / "tool_not_called" with "value": a tool the run must or mustn't call, only when the brief says so and the tool's exact name is in the list given.

Reply with JSON only: {"criteria": [{"text": "...", "kind": "judge"}, {"text": "...", "kind": "tool_called", "value": "<tool name>"}]}`

/** Criteria drafted from a workflow's brief, for a person to edit before
 * saving. */
export async function draftCriteria(model: ModelCall, input: { instructions: string; tools: string[] }): Promise<EvalCriterion[]> {
  const content = `The workflow's brief:\n<brief>\n${input.instructions.slice(0, 16000)}\n</brief>\n\nIts tools: ${input.tools.length ? input.tools.join(', ') : 'none'}`
  const response = await model([{ role: 'user', content }], DRAFT_CRITERIA_PROMPT, [])
  const text = response.content.filter((b) => b.type === 'text').map((b) => b.text ?? '').join('')
  const match = /\{[\s\S]*\}/.exec(text)
  let parsed: { criteria?: unknown } = {}
  try {
    parsed = JSON.parse(match?.[0] ?? '') as { criteria?: unknown }
  } catch {}
  const tools = new Set(input.tools.map((t) => t.toLowerCase()))
  const drafted = (Array.isArray(parsed.criteria) ? parsed.criteria : []).flatMap((raw): EvalCriterion[] => {
    const c = (raw ?? {}) as Record<string, unknown>
    const text = typeof c.text === 'string' ? c.text.trim().slice(0, 300) : ''
    let kind = CRITERION_KINDS.includes(c.kind as CriterionKind) && c.kind !== 'reference' ? (c.kind as CriterionKind) : 'judge'
    const value = typeof c.value === 'string' ? c.value.trim().slice(0, 300) : ''
    // A tool it can't call, or a phrase with no words, is judged instead.
    if ((kind === 'tool_called' || kind === 'tool_not_called') && !tools.has(value.toLowerCase())) kind = 'judge'
    if ((kind === 'contains' || kind === 'not_contains') && !value) kind = 'judge'
    return text ? [{ id: randomUUID().slice(0, 8), text, kind, ...(kind !== 'judge' ? { value } : {}) }] : []
  })
  if (!drafted.length) throw new EvidenceError('No checks could be drafted from this brief: add them by hand.')
  return drafted.slice(0, MAX_CRITERIA)
}

export interface EvalRunDeps {
  agentDir: string
  workflowId: string
  /** The workflow version being tested, recorded on the round. */
  workflowVersion?: number
  /** Testing the draft: when it was saved, recorded on the round. */
  draft?: { savedAt: string }
  /** The criteria to check instead of the saved ones (a draft's). */
  criteria?: EvalCriterion[]
  /** Its output schema: each case is also checked against it. */
  outputSchema?: JsonSchema
  instructions: string
  /** The workflow's model and the judge's, as "provider model". */
  model: string
  judgeLabel: string
  judge: ModelCall
  /** One test run of the workflow for this case (its inputs, and the run
   * it came from to replay): its result, the tools it called, and the
   * calls it didn't make. */
  runCase(c: EvalCase): Promise<{ result: string; tools: string[]; standIns?: StandIn[] }>
}

/** Runs every case once and scores it, recording progress as it goes.
 * Throws when a round is already running or there are no cases. */
export function startEvalRound(deps: EvalRunDeps): Promise<EvalRound> {
  const evals = readEvals(deps.agentDir, deps.workflowId)
  // A round left running by a restart is over after an hour.
  if (evals.running && Date.now() - Date.parse(evals.running.startedAt) < 60 * 60 * 1000) throw new EvidenceError('The eval cases are already running.')
  if (!evals.cases.length) throw new EvidenceError('Add an eval case first: save a past run as one, from History.')
  const cases = evals.cases
  const startedAt = new Date().toISOString()
  const drafting = deps.draft ? { draft: true } : {}
  writeEvals(deps.agentDir, deps.workflowId, { ...evals, running: { startedAt, done: 0, total: cases.length, ...drafting } })
  const criteria = [...effectiveCriteria(deps.criteria ? { criteria: deps.criteria } : evals), ...(deps.outputSchema ? [OUTPUT_SCHEMA_CRITERION] : [])]
  return (async () => {
    const results: EvalCaseResult[] = []
    for (const c of cases) {
      let run: { result: string; tools: string[]; standIns?: StandIn[] } | { error: string }
      try {
        run = await deps.runCase(c)
      } catch (err) {
        run = { error: err instanceof Error ? err.message : String(err) }
      }
      const checks = await checkCase(deps.judge, { instructions: deps.instructions, criteria, reference: c.reference ?? '', ...(deps.outputSchema ? { outputSchema: deps.outputSchema } : {}), run })
      results.push({
        caseId: c.id,
        ...('error' in run ? { error: run.error } : { result: run.result.slice(0, 20000), tools: [...new Set(run.tools)], ...(run.standIns?.length ? { standIns: run.standIns.slice(0, 50) } : {}) }),
        checks,
      })
      const now = readEvals(deps.agentDir, deps.workflowId)
      writeEvals(deps.agentDir, deps.workflowId, { ...now, running: { startedAt, done: results.length, total: cases.length, ...drafting } })
    }
    const round: EvalRound = {
      at: startedAt,
      ...(deps.draft ? { draft: deps.draft } : deps.workflowVersion ? { workflowVersion: deps.workflowVersion } : {}),
      model: deps.model,
      judge: deps.judgeLabel,
      cases: results,
      criteria,
      ...roundSummary(criteria, results),
    }
    const now = readEvals(deps.agentDir, deps.workflowId)
    const { running: _done, ...rest } = now
    writeEvals(deps.agentDir, deps.workflowId, { ...rest, rounds: [round, ...rest.rounds].slice(0, MAX_ROUNDS) })
    return round
  })()
}

// ---------- choosing cases ----------

const clip = (text: string, max: number): string => {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > max ? flat.slice(0, max - 1) + '…' : flat
}
const shown = (v: unknown): string => clip(v === undefined ? '(none)' : typeof v === 'string' ? v : JSON.stringify(v), 80)

/** Success criteria a run suggests (the Evaluation tab's),
 * from what people corrected in it: a denial's reason, a changed
 * request, a bad result's note, a question it had to ask. */
export function suggestedCriteria(run: WorkflowRun): { kind: 'judge'; text: string }[] {
  const out: string[] = []
  for (const d of run.decisions ?? []) {
    if (!d.approved && d.reason) out.push(`Doesn’t do what a person denied before (${d.tool}): “${clip(d.reason, 160)}”`)
    if (d.approved && d.edited && d.before && d.after && typeof d.before === 'object' && typeof d.after === 'object') {
      const b = d.before as Record<string, unknown>
      const a = d.after as Record<string, unknown>
      for (const field of [...new Set([...Object.keys(b), ...Object.keys(a)])].filter((k) => JSON.stringify(b[k]) !== JSON.stringify(a[k])).slice(0, 2)) {
        out.push(`Gets ${field} right for ${d.tool}: a person changed it from ${shown(b[field])} to ${shown(a[field])}`)
      }
    }
  }
  if (run.feedback?.verdict === 'bad' && run.feedback.note) out.push(`Avoids what made a result bad: “${clip(run.feedback.note, 160)}”`)
  for (const answer of run.answers ?? []) out.push(`Handles this without asking: “${clip(answer.question, 120)}” (the answer was “${clip(answer.answer, 80)}”)`)
  return [...new Set(out)].slice(0, 4).map((text) => ({ kind: 'judge' as const, text: text.slice(0, 300) }))
}

/** A run worth saving as an eval case, and why. */
export interface EvalCandidate {
  runId: string
  at: string
  why: 'denied' | 'changed' | 'bad' | 'asked' | 'failed' | 'typical'
  /** The why in words: the reason, the change, the note. */
  detail: string
  inputs: string
}

/** Runs worth testing, from the given ones (any order), leaving out those
 * already cases: where a person denied or changed what it did, a result
 * marked bad, a question it had to ask, a failure; then a few typical
 * good runs with different inputs. At most `max`. */
export function evalCandidates(runs: WorkflowRun[], evals: WorkflowEvals, max = 10): EvalCandidate[] {
  const saved = new Set(evals.cases.map((c) => c.fromRun).filter(Boolean))
  const inputsOf = (r: WorkflowRun) => clip(Object.entries(r.params ?? {}).map(([k, v]) => `${k}: ${v}`).join(' · '), 120)
  const fresh = [...runs].filter((r) => !saved.has(r.run_id)).sort((a, b) => b.started_at.localeCompare(a.started_at))
  const out: EvalCandidate[] = []
  const taken = new Set<string>()
  const add = (r: WorkflowRun, why: EvalCandidate['why'], detail: string) => {
    if (taken.has(r.run_id) || out.length >= max) return
    taken.add(r.run_id)
    out.push({ runId: r.run_id, at: r.started_at, why, detail: clip(detail, 160), inputs: inputsOf(r) })
  }
  for (const r of fresh) {
    const denied = (r.decisions ?? []).find((d) => !d.approved)
    if (denied) add(r, 'denied', denied.reason ? `Denied ${denied.tool}: “${denied.reason}”` : `Denied ${denied.tool}`)
  }
  for (const r of fresh) {
    const changed = (r.decisions ?? []).find((d) => d.approved && d.edited)
    if (!changed) continue
    const b = (changed.before && typeof changed.before === 'object' ? changed.before : {}) as Record<string, unknown>
    const a = (changed.after && typeof changed.after === 'object' ? changed.after : {}) as Record<string, unknown>
    const fields = [...new Set([...Object.keys(b), ...Object.keys(a)])].filter((k) => JSON.stringify(b[k]) !== JSON.stringify(a[k]))
    add(r, 'changed', fields.length ? `Changed ${fields.slice(0, 2).map((k) => `${k} ${shown(b[k])} → ${shown(a[k])}`).join(', ')} for ${changed.tool}` : `Changed ${changed.tool} before approving`)
  }
  for (const r of fresh) if (r.feedback?.verdict === 'bad' || r.feedback?.edit === 'heavy') add(r, 'bad', r.feedback!.note ? `Marked bad: “${r.feedback!.note}”` : r.feedback!.verdict === 'bad' ? 'Marked bad' : 'Heavily edited before use')
  for (const r of fresh) if (r.answers?.length) add(r, 'asked', `Asked: “${r.answers[0].question}”`)
  for (const r of fresh) if (r.status === 'error') add(r, 'failed', `Failed: ${r.error ?? ''}`)
  // Typical good runs: done, nobody overruled them, each with other inputs.
  const seenInputs = new Set<string>()
  for (const r of fresh) {
    if (out.filter((c) => c.why === 'typical').length >= 3) break
    const overruled = (r.decisions ?? []).some((d) => !d.approved || d.edited) || r.feedback?.verdict === 'bad'
    const key = JSON.stringify(r.params ?? {})
    if (r.status !== 'done' || !r.result || overruled || seenInputs.has(key)) continue
    seenInputs.add(key)
    add(r, 'typical', r.feedback?.verdict === 'good' ? 'A good result, marked good' : r.feedback?.edit === 'none' ? 'A good result, used unedited' : 'A typical run that went through')
  }
  return out
}
