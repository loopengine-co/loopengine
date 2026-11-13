// Runs the goal planner on the eval set and prints a score card.
//
//   npm run eval:goals -- [--provider deepseek] [--model deepseek-v4-flash]
//                         [--only le-grow-100,moon] [--judge] [--concurrency 4]
//                         [--judge-provider deepseek] [--judge-model deepseek-v4-flash]
//                         [--out tests/evals/results]
//   npm run eval:goals -- --rejudge <results.json> [--judge-provider openai --judge-model gpt-6.1-sol]
//     grades a saved run's plans again with another judge, without planning again
//
// Needs the provider's API key in the environment (npm run eval:goals
// reads .env). Each run's plans, checks and ratings are saved as JSON in
// --out, to compare runs after changing prompts, the playbook or models.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { synthesizeCreateModelCall } from '#core/discover-agents.js'
import type { ModelCall } from '#core/run-agent.js'
import { runGoalPipeline, type GoalPlan } from '#core/system-agents/goal-planner.js'
import { GOAL_EVAL_SET, type GoalEvalCase } from './goal-eval-set.js'
import { CHECK_NAMES, judgeGoalPlan, scoreGoalPlan, type GoalJudgement, type GoalScore } from './goal-scoring.js'

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? undefined : process.argv[i + 1]
}

interface CaseResult {
  id: string
  goal: string
  plan?: GoalPlan
  score?: GoalScore
  judgement?: GoalJudgement
  error?: string
  seconds: number
}

async function runCase(modelCall: ModelCall, testCase: GoalEvalCase, judgeCall: ModelCall | undefined): Promise<CaseResult> {
  const started = Date.now()
  try {
    const plan = await runGoalPipeline(modelCall, { goal: testCase.goal, context: testCase.context, ...(testCase.saved ? { saved: testCase.saved } : {}) })
    const score = scoreGoalPlan(plan, testCase)
    const judgement = judgeCall ? await judgeGoalPlan(judgeCall, testCase, plan).catch(() => undefined) : undefined
    return { id: testCase.id, goal: testCase.goal, plan, score, ...(judgement ? { judgement } : {}), seconds: (Date.now() - started) / 1000 }
  } catch (err) {
    return { id: testCase.id, goal: testCase.goal, error: err instanceof Error ? err.message : String(err), seconds: (Date.now() - started) / 1000 }
  }
}

async function pool<T, R>(items: T[], size: number, run: (item: T) => Promise<R>, onDone: (r: R) => void): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) {
      const i = next++
      results[i] = await run(items[i]!)
      onDone(results[i]!)
    }
  }))
  return results
}

const pad = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s.padEnd(n))

function printScoreCard(results: CaseResult[], judged: boolean): void {
  const header = `${pad('case', 20)} ${pad('scope', 8)} ${pad('focus', 17)} ${pad('wf', 3)} ${pad('rev', 4)} ${pad('score', 7)}${judged ? ' ' + pad('judge', 6) : ''} failed checks`
  console.log('\n' + header + '\n' + '-'.repeat(header.length + 20))
  for (const r of results) {
    if (r.error || !r.plan || !r.score) {
      console.log(`${pad(r.id, 20)} ERROR ${r.error}`)
      continue
    }
    const failed = r.score.checks.filter((c) => !c.pass).map((c) => c.name).join(', ')
    const judge = r.judgement ? ((r.judgement.specificity + r.judgement.measureFit + r.judgement.usefulness) / 3).toFixed(1) : '-'
    console.log(`${pad(r.id, 20)} ${pad(r.plan.brief.scope, 8)} ${pad(r.plan.brief.focus, 17)} ${pad(String(r.plan.workflows.length), 3)} ${pad(r.plan.critique.revised ? 'yes' : '', 4)} ${pad(`${r.score.passed}/${r.score.total}`, 7)}${judged ? ' ' + pad(judge, 6) : ''} ${failed}`)
  }

  const scored = results.filter((r) => r.score)
  console.log('\nBy check (pass rate where it applies):')
  for (const name of CHECK_NAMES) {
    const applied = scored.flatMap((r) => r.score!.checks.filter((c) => c.name === name))
    if (!applied.length) continue
    const passed = applied.filter((c) => c.pass).length
    console.log(`  ${pad(name, 18)} ${String(passed).padStart(3)}/${String(applied.length).padEnd(3)} ${'█'.repeat(Math.round((passed / applied.length) * 20)).padEnd(20, '·')} ${Math.round((passed / applied.length) * 100)}%`)
  }

  const allChecks = scored.flatMap((r) => r.score!.checks)
  const perfect = scored.filter((r) => r.score!.passed === r.score!.total).length
  console.log(`\nOverall: ${allChecks.filter((c) => c.pass).length}/${allChecks.length} checks (${Math.round((allChecks.filter((c) => c.pass).length / Math.max(1, allChecks.length)) * 100)}%) · ${perfect}/${results.length} plans pass every check · ${results.filter((r) => r.error).length} errors · ${scored.filter((r) => r.plan!.critique.revised).length} revised after critique`)
  if (judged) {
    const js = scored.map((r) => r.judgement).filter((j): j is GoalJudgement => Boolean(j))
    const avg = (f: (j: GoalJudgement) => number) => (js.reduce((s, j) => s + f(j), 0) / Math.max(1, js.length)).toFixed(2)
    console.log(`Judge (1–5): specificity ${avg((j) => j.specificity)} · measure fit ${avg((j) => j.measureFit)} · usefulness ${avg((j) => j.usefulness)}`)
  }
}

/** Grades a saved run's plans again with another judge. Checks are
 * scored again too, with the current scorer. */
async function rejudge(file: string, judgeProvider: string, judgeModel: string, concurrency: number, out: string): Promise<void> {
  const saved = JSON.parse(readFileSync(file, 'utf8')) as { provider: string; model: string; results: CaseResult[] }
  const judgeCall = (await synthesizeCreateModelCall({ provider: judgeProvider, model: judgeModel, maxTokens: 16000 } as Parameters<typeof synthesizeCreateModelCall>[0]))()
  console.log(`Re-judging ${basename(file)} (planned by ${saved.provider} ${saved.model}) · judged by ${judgeProvider} ${judgeModel}`)
  const results = await pool(saved.results, concurrency, async (r): Promise<CaseResult> => {
    const testCase = GOAL_EVAL_SET.find((c) => c.id === r.id)
    if (!r.plan || !testCase) return r
    const score = scoreGoalPlan(r.plan, testCase)
    const judgement = await judgeGoalPlan(judgeCall, testCase, r.plan).catch(() => undefined)
    const { judgement: _old, ...rest } = r
    return { ...rest, score, ...(judgement ? { judgement } : {}) }
  }, (r) => process.stdout.write(`  ${r.judgement ? '✓' : '✗'} ${r.id}\n`))
  printScoreCard(results, true)
  mkdirSync(out, { recursive: true })
  const target = join(out, basename(file).replace(/\.json$/, `.judged-by-${judgeModel}.json`))
  writeFileSync(target, JSON.stringify({ provider: saved.provider, model: saved.model, judged: `${judgeProvider} ${judgeModel}`, results }, null, 2))
  console.log(`\nSaved ${target}`)
}

async function main(): Promise<void> {
  const rejudgeFile = arg('rejudge')
  if (rejudgeFile) return rejudge(rejudgeFile, arg('judge-provider') ?? 'openai', arg('judge-model') ?? 'gpt-6.1-sol', Number(arg('concurrency') ?? 6), arg('out') ?? join('tests', 'evals', 'results'))

  const provider = arg('provider') ?? process.env.GOAL_EVAL_PROVIDER ?? 'deepseek'
  const model = arg('model') ?? process.env.GOAL_EVAL_MODEL ?? 'deepseek-v4-flash'
  const only = arg('only')?.split(',').map((s) => s.trim()).filter(Boolean)
  const judge = process.argv.includes('--judge')
  const concurrency = Number(arg('concurrency') ?? 4)
  const out = arg('out') ?? join('tests', 'evals', 'results')
  const cases = only ? GOAL_EVAL_SET.filter((c) => only.includes(c.id)) : GOAL_EVAL_SET
  if (!cases.length) throw new Error(`No eval cases match ${only?.join(', ')}`)

  const make = async (p: string, m: string) => (await synthesizeCreateModelCall({ provider: p, model: m, maxTokens: 16000 } as Parameters<typeof synthesizeCreateModelCall>[0]))()
  const modelCall = await make(provider, model)
  // The judge stays one model across runs, so runs on different planner
  // models are graded alike.
  const judgeProvider = arg('judge-provider') ?? 'deepseek'
  const judgeModel = arg('judge-model') ?? 'deepseek-v4-flash'
  const judgeCall = judge ? await make(judgeProvider, judgeModel) : undefined
  console.log(`Goal planner evals: ${cases.length} goals · ${provider} ${model}${judge ? ` · judged by ${judgeProvider} ${judgeModel}` : ''}`)
  const results = await pool(cases, concurrency, (c) => runCase(modelCall, c, judgeCall), (r) => {
    process.stdout.write(`  ${r.error ? '✗' : '✓'} ${r.id} (${r.seconds.toFixed(0)}s${r.score ? `, ${r.score.passed}/${r.score.total}` : ''})\n`)
  })
  printScoreCard(results, judge)

  mkdirSync(out, { recursive: true })
  const file = join(out, `goal-evals-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
  writeFileSync(file, JSON.stringify({ provider, model, judged: judge ? `${judgeProvider} ${judgeModel}` : false, results }, null, 2))
  console.log(`\nSaved ${file}`)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
