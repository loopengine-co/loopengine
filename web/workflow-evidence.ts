// A workflow's evidence: what shows it works. Three kinds, shown on its
// Evidence tab (web/agents-config-page.ts):
//
//   - Live scores, from its runs (core/workflow-runs.ts): how many ended
//     and failed, the approvals people gave or refused while they ran, and
//     the feedback an app or person reported afterwards
//     (POST /agents/:name/runs/:id/feedback): the text actually used,
//     compared with the result (none, light or heavy edits), and a verdict.
//   - Eval cases: real inputs with a good result to compare against, kept
//     beside its skill (agents/<name>/skills/<id>/evals.json). A case is
//     usually saved from a past run, its result edited into the good one.
//   - Eval results: each time the cases are run, as a test run (tools its
//     rules don't allow aren't run, nobody is asked anything), every
//     result is scored 1-5 against its case's good result by a judge model
//     other than the workflow's own (models favour their own writing).
//     The latest 10 rounds are kept.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { ModelCall } from '#core/run-agent.js'
import type { RunFeedback, WorkflowRun } from '#core/workflow-runs.js'
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
 * and a short `note`. */
export function runFeedbackFrom(run: WorkflowRun, body: Record<string, unknown>): RunFeedback {
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
    at: new Date().toISOString(),
  }
}

// ---------- eval cases ----------

export interface EvalCase {
  id: string
  params: Record<string, string>
  /** The good result to compare against. */
  reference: string
  /** The run it was saved from. */
  fromRun?: string
  createdAt: string
}

export interface EvalCaseResult {
  caseId: string
  result?: string
  error?: string
  score?: number
  reason?: string
}

export interface EvalRound {
  at: string
  /** The workflow's model and the judge's, as "provider model". */
  model: string
  judge: string
  cases: EvalCaseResult[]
  /** Mean score of the cases that were scored. */
  average?: number
}

export interface WorkflowEvals {
  cases: EvalCase[]
  rounds: EvalRound[]
  /** Set while a round is running. */
  running?: { startedAt: string; done: number; total: number }
}

const MAX_CASES = 30
const MAX_ROUNDS = 10

function evalsFile(agentDir: string, workflowId: string): string {
  return join(agentDir, 'skills', workflowId, 'evals.json')
}

export function readEvals(agentDir: string, workflowId: string): WorkflowEvals {
  try {
    const raw = JSON.parse(readFileSync(evalsFile(agentDir, workflowId), 'utf8')) as Partial<WorkflowEvals>
    return { cases: Array.isArray(raw.cases) ? raw.cases : [], rounds: Array.isArray(raw.rounds) ? raw.rounds : [], ...(raw.running ? { running: raw.running } : {}) }
  } catch {
    return { cases: [], rounds: [] }
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
  const reference = typeof input.reference === 'string' && input.reference.trim() ? input.reference.trim() : input.run?.result?.trim()
  if (!reference) throw new EvidenceError('A case needs a good result to compare against.')
  const params = input.run?.params ?? input.params ?? {}
  if (input.run && evals.cases.some((c) => c.fromRun === input.run!.run_id)) throw new EvidenceError('That run is already a case.')
  const c: EvalCase = { id: randomUUID().slice(0, 8), params, reference: reference.slice(0, 50000), ...(input.run ? { fromRun: input.run.run_id } : {}), createdAt: new Date().toISOString() }
  writeEvals(agentDir, workflowId, { ...evals, cases: [...evals.cases, c] })
  return c
}

export function updateEvalCase(agentDir: string, workflowId: string, caseId: string, reference: unknown): void {
  const evals = readEvals(agentDir, workflowId)
  if (typeof reference !== 'string' || !reference.trim()) throw new EvidenceError('A case needs a good result to compare against.')
  if (!evals.cases.some((c) => c.id === caseId)) throw new EvidenceError('No such case.')
  writeEvals(agentDir, workflowId, { ...evals, cases: evals.cases.map((c) => (c.id === caseId ? { ...c, reference: reference.trim().slice(0, 50000) } : c)) })
}

export function removeEvalCase(agentDir: string, workflowId: string, caseId: string): void {
  const evals = readEvals(agentDir, workflowId)
  writeEvals(agentDir, workflowId, { ...evals, cases: evals.cases.filter((c) => c.id !== caseId) })
}

export const EVAL_JUDGE_PROMPT = `You grade one result of an AI agent's workflow against a known good result for the same inputs.

Score 1-5:
5 = as good as the good result or better: same facts and decisions, nothing wrong or missing that matters.
4 = right in substance, small gaps or wording differences that wouldn't matter to the person using it.
3 = usable after edits: a fact, step or decision missing or off, but nothing harmful.
2 = needs a rewrite: wrong in a way that matters (a wrong fact, a wrong decision, a promise it shouldn't make).
1 = wrong or harmful, or no real result.

Judge substance, not style: a different wording of the same facts and decisions is a 5. A test run doesn't make calls that need approval; a result saying it would have made one counts as making it.

Reply with JSON only: {"score": <1-5>, "reason": "<one or two sentences: what's right, what's missing or wrong>"}`

/** Scores one result against its case. */
export async function judgeEvalResult(judge: ModelCall, input: { instructions: string; reference: string; result: string }): Promise<{ score: number; reason: string }> {
  const content = `The workflow's instructions:\n<instructions>\n${input.instructions.slice(0, 12000)}\n</instructions>\n\nThe good result:\n<good_result>\n${input.reference.slice(0, 12000)}\n</good_result>\n\nThe result to grade:\n<result>\n${input.result.slice(0, 12000)}\n</result>`
  const response = await judge([{ role: 'user', content }], EVAL_JUDGE_PROMPT, [])
  const text = response.content.filter((b) => b.type === 'text').map((b) => b.text ?? '').join('')
  const match = /\{[\s\S]*\}/.exec(text)
  try {
    const parsed = JSON.parse(match?.[0] ?? '') as { score?: unknown; reason?: unknown }
    const score = Math.round(Number(parsed.score))
    if (score >= 1 && score <= 5) return { score, reason: typeof parsed.reason === 'string' ? parsed.reason.slice(0, 600) : '' }
  } catch {}
  throw new Error('The judge did not return a score.')
}

export interface EvalRunDeps {
  agentDir: string
  workflowId: string
  instructions: string
  /** The workflow's model and the judge's, as "provider model". */
  model: string
  judgeLabel: string
  judge: ModelCall
  /** One test run of the workflow with these inputs; its result. */
  runCase(params: Record<string, string>): Promise<string>
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
  writeEvals(deps.agentDir, deps.workflowId, { ...evals, running: { startedAt, done: 0, total: cases.length } })
  return (async () => {
    const results: EvalCaseResult[] = []
    for (const c of cases) {
      try {
        const result = await deps.runCase(c.params)
        try {
          const verdict = await judgeEvalResult(deps.judge, { instructions: deps.instructions, reference: c.reference, result })
          results.push({ caseId: c.id, result: result.slice(0, 20000), ...verdict })
        } catch (err) {
          results.push({ caseId: c.id, result: result.slice(0, 20000), error: err instanceof Error ? err.message : String(err) })
        }
      } catch (err) {
        results.push({ caseId: c.id, error: err instanceof Error ? err.message : String(err) })
      }
      const now = readEvals(deps.agentDir, deps.workflowId)
      writeEvals(deps.agentDir, deps.workflowId, { ...now, running: { startedAt, done: results.length, total: cases.length } })
    }
    const scored = results.filter((r) => typeof r.score === 'number')
    const round: EvalRound = {
      at: startedAt,
      model: deps.model,
      judge: deps.judgeLabel,
      cases: results,
      ...(scored.length ? { average: Math.round((scored.reduce((sum, r) => sum + r.score!, 0) / scored.length) * 100) / 100 } : {}),
    }
    const now = readEvals(deps.agentDir, deps.workflowId)
    const { running: _done, ...rest } = now
    writeEvals(deps.agentDir, deps.workflowId, { ...rest, rounds: [round, ...rest.rounds].slice(0, MAX_ROUNDS) })
    return round
  })()
}
