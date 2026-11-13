// Scores a goal plan against its eval case: deterministic checks that
// follow the planning rules (core/system-agents/goal-planner.ts), so a
// score card means the same thing on every run. An optional judge
// (judgeGoalPlan) adds a model's 1-5 ratings for what checks can't see.
import type { GoalPlan, GoalContext } from '#core/system-agents/goal-planner.js'
import type { Message, ModelCall } from '#core/run-agent.js'
import { LEVERS } from '#core/system-agents/goal-playbooks.js'
import type { GoalEvalCase } from './goal-eval-set.js'

export interface GoalCheck {
  name: string
  pass: boolean
  detail?: string
}

export interface GoalScore {
  checks: GoalCheck[]
  passed: number
  total: number
  /** passed / total, 0–1. */
  score: number
}

export const CHECK_NAMES = [
  'scope', 'focus', 'count', 'on focus', 'labelled', 'needs honest', 'time budget',
  'preferred lever', 'no duplicates', 'not saved before', 'approval wording', 'specific', 'honest scope',
  'measure readable', 'measure source honest', 'qualifiers covered',
] as const

const lower = (s: string) => s.toLowerCase()
const KNOWN_LEVERS = new Set(LEVERS.map((l) => l.id))

/** A need marked connected must match something connected in the
 * context, by kind or by name. */
function needConnected(need: { name: string; kind: string }, context: GoalContext): boolean {
  return context.systems.some((s) => s.connected && (lower(s.kind) === lower(need.kind) || lower(s.name).includes(lower(need.name)) || lower(need.name).includes(lower(s.name))))
}

/** Words that make a request specific to this context: system names, and
 * capitalised names from what the person does. */
function contextTerms(context: GoalContext): string[] {
  const names = context.systems.map((s) => s.name.split(/[\s(]/)[0])
  const proper = `${context.about} ${context.audience ?? ''}`.match(/\b[A-Z][A-Za-z0-9&.'-]{3,}\b/g) ?? []
  const common = new Set(['Website', 'Mostly', 'Customers', 'Customer', 'People', 'Many', 'Local', 'Founders', 'Agency', 'Gift'])
  return [...new Set([...names, ...proper])].filter((t) => t.length >= 4 && !common.has(t))
}

// What goes out to customers or the public needs approval; a report
// posted to the person's own Slack or Telegram doesn't.
const OUTWARD = /\b(reply to|replies to|email (the |each |every )?(customer|user|donor|patient|creator|author|lead|prospect|volunteer|shop)|send (it |them |a |the )?(to (the |each |every )?)?(customer|user|donor|patient|creator|author|lead|prospect|volunteer)s?|text (the )?(patient|customer)s?|publish|submit|post (on|to|in) (reddit|x|twitter|hacker news|the forum|forums|communit|instagram|facebook|linkedin|tiktok|product hunt|github))/i
const APPROVAL = /approv|never (post|send|publish|submit)|without (my|the person|a person)|i (submit|publish|post|send)|for (a person|me|someone) to (send|post|publish|submit|review)|a person sends|person to send|nothing (goes out|is sent|is posted)|after i (ok|review)/i

export function scoreGoalPlan(plan: GoalPlan, testCase: GoalEvalCase): GoalScore {
  const { expect, context } = testCase
  const checks: GoalCheck[] = []
  const add = (name: string, pass: boolean, detail?: string) => checks.push({ name, pass, ...(detail && !pass ? { detail } : {}) })
  const wfs = plan.workflows
  const scope = plan.brief.scope

  add('scope', expect.scope.includes(scope), `read as ${scope}, expected ${expect.scope.join(' or ')}`)
  if (expect.focus) add('focus', expect.focus.includes(plan.brief.focus), `focus ${plan.brief.focus}, expected ${expect.focus.join(' or ')}`)

  const min = expect.minWorkflows ?? (scope === 'in' ? 3 : 0)
  // Out of scope means no workflows, whatever the case allows for a partial reading.
  const max = scope === 'out' ? 0 : expect.maxWorkflows ?? 5
  add('count', wfs.length >= min && wfs.length <= max, `${wfs.length} workflows, expected ${min}–${max}`)

  if (scope === 'in' && wfs.length) {
    const off = wfs.filter((w) => w.focus !== plan.brief.focus)
    add('on focus', off.length === 0, `off the brief's focus (${plan.brief.focus}): ${off.map((w) => `${w.title} (${w.focus})`).join('; ')}`)
  }

  if (wfs.length) {
    const unlabelled = wfs.filter((w) => !w.lever || !w.mechanism || !w.measureLink)
    add('labelled', unlabelled.length === 0, `missing lever, why or measure link: ${unlabelled.map((w) => w.title).join('; ')}`)
    const badIds = wfs.filter((w) => w.leverId && !KNOWN_LEVERS.has(w.leverId))
    if (badIds.length) add('labelled', false, `unknown lever ids: ${badIds.map((w) => w.leverId).join(', ')}`)

    const falseClaims = wfs.flatMap((w) => w.needs.filter((n) => n.connected && !needConnected(n, context)).map((n) => `${w.title}: ${n.name}`))
    add('needs honest', falseClaims.length === 0, `marked connected but not: ${falseClaims.join('; ')}`)

    // The plan aims at three quarters of the weekly time; a little over
    // that still passes.
    const minutes = wfs.reduce((sum, w) => sum + (w.humanMinutesPerWeek || 0), 0)
    const budget = plan.brief.weeklyHours * 60
    add('time budget', minutes <= budget * 0.8, `${minutes} min/week against ${Math.round(budget * 0.8)} (80% of ${budget})`)

    const levers = wfs.map((w) => lower(w.leverId || w.lever))
    const dupes = levers.filter((l, i) => levers.indexOf(l) !== i)
    add('no duplicates', dupes.length === 0, `repeated levers: ${[...new Set(dupes)].join(', ')}`)

    const outwardWithoutApproval = wfs.filter((w) => OUTWARD.test(w.request) && !APPROVAL.test(w.request))
    add('approval wording', outwardWithoutApproval.length === 0, `sends or posts without saying it waits for approval: ${outwardWithoutApproval.map((w) => w.title).join('; ')}`)

    const terms = contextTerms(context).map(lower)
    const generic = wfs.filter((w) => !terms.some((t) => lower(w.request).includes(t)))
    add('specific', generic.length === 0, `names nothing from this context: ${generic.map((w) => w.title).join('; ')}`)
  }

  if (scope === 'in') {
    // The source the brief names must be described as the context has it…
    const source = lower(plan.brief.measureSource)
    const system = source && source !== 'none' ? context.systems.find((s) => lower(s.name).includes(source) || source.includes(lower(s.name).split(/[\s(]/)[0]!)) : undefined
    if (system) add('measure source honest', system.connected === plan.brief.measureSourceConnected, `${system.name} is ${system.connected ? 'connected' : 'not connected'}, the brief says otherwise`)
    // …and when it isn't connected, setup says how the number is read, from when.
    if (!plan.brief.measureSourceConnected) {
      const setup = plan.setup.join(' ')
      const readable = /connect|webhook|integrat|record|log |tally|by hand|manual|spreadsheet|count .* weekly|weekly count/i.test(setup)
      const baseline = /baseline|today|current (count|number|value|total)|starting (number|point|count)|as of/i.test(setup)
      add('measure readable', readable && baseline, `${readable ? '' : 'no step that connects the source or records the number; '}${baseline ? '' : 'no baseline'}`)
    }
  }

  if (expect.qualifiers?.length && wfs.length) {
    const text = lower(wfs.map((w) => `${w.request} ${w.covers.join(' ')} ${w.title}`).join(' '))
    const missed = expect.qualifiers.filter((q) => !q.anyOf.some((word) => text.includes(lower(word))))
    add('qualifiers covered', missed.length === 0, `nothing addresses: ${missed.map((q) => q.name).join(', ')}`)
  }

  if (expect.preferLevers) {
    const used = new Set(wfs.map((w) => w.leverId).filter(Boolean))
    add('preferred lever', expect.preferLevers.some((id) => used.has(id)), `none of ${expect.preferLevers.join(', ')}`)
  }

  if (testCase.saved?.length) {
    const savedIds = new Set(testCase.saved.map((s) => s.leverId).filter(Boolean))
    const savedLabels = new Set(testCase.saved.map((s) => lower(s.lever)))
    const repeats = wfs.filter((w) => (w.leverId && savedIds.has(w.leverId)) || savedLabels.has(lower(w.lever)))
    add('not saved before', repeats.length === 0, `repeats a saved lever: ${repeats.map((w) => w.title).join('; ')}`)
  }

  if (scope === 'out') add('honest scope', wfs.length === 0 && plan.message.length > 0, 'out of scope but planned workflows, or said nothing')
  if (scope === 'partial') add('honest scope', !/\bachiev/i.test(plan.message) || /help(s)? (you )?pursue/i.test(plan.message), 'claims to achieve a goal that is only partly in scope')

  const passed = checks.filter((c) => c.pass).length
  return { checks, passed, total: checks.length, score: checks.length ? passed / checks.length : 0 }
}

export interface GoalJudgement {
  /** 1–5 each. */
  specificity: number
  measureFit: number
  usefulness: number
  note: string
}

const JUDGE_PROMPT = `You grade a plan of AI-agent workflows for a goal, as a demanding growth and operations lead. Rate 1–5 (5 best):
- specificity: does each workflow use this business's own audience, channels and systems, or could it fit anyone?
- measureFit: does each workflow directly move the goal's measure?
- usefulness: would a busy owner build these and keep them running?
When the brief's scope is "partial" (agents can only do the information work around a goal a person pursues), rate measureFit by how well each workflow helps that person pursue it, not by whether it moves the end goal; the plan is right not to promise that.
Call save_grade once, with a one-sentence note on the biggest weakness.`

/** A model's ratings, for what the deterministic checks can't judge. */
export async function judgeGoalPlan(modelCall: ModelCall, testCase: GoalEvalCase, plan: GoalPlan): Promise<GoalJudgement> {
  const tool = {
    name: 'save_grade',
    description: 'Save the grade.',
    input_schema: { type: 'object', properties: { specificity: { type: 'number' }, measureFit: { type: 'number' }, usefulness: { type: 'number' }, note: { type: 'string' } }, required: ['specificity', 'measureFit', 'usefulness', 'note'] },
  }
  const messages: Message[] = [{ role: 'user', content: `Goal: ${testCase.goal}\n\nContext: ${JSON.stringify(testCase.context)}\n\nPlan: ${JSON.stringify({ brief: plan.brief, setup: plan.setup, workflows: plan.workflows, leftOut: plan.leftOut, message: plan.message })}` }]
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await modelCall(messages, JUDGE_PROMPT, [tool])
    const call = response.content.find((b) => b.type === 'tool_use' && b.name === 'save_grade')
    if (call && call.type === 'tool_use') {
      const x = (call.input ?? {}) as Record<string, unknown>
      const n = (v: unknown) => (typeof v === 'number' ? Math.max(1, Math.min(5, v)) : 1)
      return { specificity: n(x.specificity), measureFit: n(x.measureFit), usefulness: n(x.usefulness), note: typeof x.note === 'string' ? x.note : '' }
    }
    if (response.content.length) messages.push({ role: 'assistant', content: response.content })
    messages.push({ role: 'user', content: 'Call save_grade now.' })
  }
  throw new Error('The judge did not grade.')
}
