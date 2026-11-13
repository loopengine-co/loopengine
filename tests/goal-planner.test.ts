import { describe, expect, it } from 'vitest'
import type { ModelCall, ModelResponse } from '#core/run-agent.js'
import { GOAL_FOCUSES, LEVERS, PLAYBOOK_VERSION, leversFor, parsePlaybook } from '#core/system-agents/goal-playbooks.js'
import { runGoalPipeline, type GoalPlan, type PlannedGoalWorkflow } from '#core/system-agents/goal-planner.js'
import { GOAL_EVAL_SET } from './evals/goal-eval-set.js'
import { scoreGoalPlan } from './evals/goal-scoring.js'

const caseById = (id: string) => GOAL_EVAL_SET.find((c) => c.id === id)!

/** A model that answers each tool from a queue, recording what it was told. */
function scriptedModel(answers: Record<string, Record<string, unknown>[]>): { modelCall: ModelCall; prompts: { tool: string; user: string }[] } {
  const prompts: { tool: string; user: string }[] = []
  const modelCall: ModelCall = async (messages, _system, tools) => {
    const tool = tools[0]!.name
    prompts.push({ tool, user: String(messages[0]!.content) })
    const input = answers[tool]!.shift()!
    return { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: `${tool}-${prompts.length}`, name: tool, input }] } as ModelResponse
  }
  return { modelCall, prompts }
}

const BRIEF = { scope: 'in', scopeReason: 'Agents can find and draft.', reading: 'literal', focus: 'new-signups', measure: 'Cloud signups per week (unknown)', measureSource: 'Clerk signup webhooks', measureSourceConnected: false, qualifiers: [], audience: 'individuals', weeklyHours: 3, approvals: 'nothing goes out without approval' }

function workflow(over: Partial<PlannedGoalWorkflow> = {}): PlannedGoalWorkflow {
  return {
    title: 'Answer people asking for this', leverId: 'new-signups.answer-intent-posts', lever: 'answer intent posts', focus: 'new-signups',
    mechanism: 'People ask in public.', request: 'Every weekday at 9:00, use Firecrawl to find posts on Reddit asking about agents, and send me drafted replies in Telegram that mention LoopEngine where it fits. Never post anything yourself.',
    agent: 'growth-agent', needs: [{ name: 'Firecrawl', kind: 'web-search', connected: true }, { name: 'Telegram', kind: 'messaging', connected: true }],
    humanMinutesPerWeek: 60, measureLink: 'signups ref=community', covers: [], newIdea: false, ...over,
  }
}

function plan(workflows: PlannedGoalWorkflow[], over: Partial<GoalPlan> = {}): GoalPlan {
  return {
    brief: { scope: 'in', scopeReason: '', reading: 'literal', focus: 'new-signups', measure: 'signups', measureSource: 'Clerk signup webhooks', measureSourceConnected: false, qualifiers: [], audience: '', weeklyHours: 3, approvals: '' },
    setup: ['Connect Clerk’s user.created webhook so signups and their ref are recorded; note today’s count as the baseline', 'Tag links with ref'], workflows, leftOut: [], assumptions: [], message: '', critique: { passed: true, issues: [], revised: false }, playbookVersion: 1, ...over,
  }
}

describe('playbook v1', () => {
  it('has stable, unique lever ids under each focus, with what the planner needs', () => {
    const ids = LEVERS.map((l) => l.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const l of LEVERS) {
      expect(l.id.startsWith(`${l.focus}.`)).toBe(true)
      expect(l.mechanism && l.template && l.measureLink).toBeTruthy()
      expect(l.fitsWhen.length).toBeGreaterThan(0)
    }
    for (const focus of GOAL_FOCUSES) expect(leversFor(focus).length).toBeGreaterThanOrEqual(3)
  })

  it('loads from playbook.json, versioned', () => {
    expect(PLAYBOOK_VERSION).toBe(1)
    expect(LEVERS.length).toBeGreaterThanOrEqual(20)
  })

  it('names the lever at fault when playbook.json is malformed', () => {
    const lever = (over: Record<string, unknown> = {}) => ({ ...LEVERS[0], ...over })
    expect(() => parsePlaybook({})).toThrow(/expected \{ "levers"/)
    expect(() => parsePlaybook({ levers: [lever({ focus: 'growth' })] })).toThrow(/new-signups.answer-intent-posts: focus must be one of/)
    expect(() => parsePlaybook({ levers: [lever({ id: 'activation.x' })] })).toThrow(/must start with "new-signups."/)
    expect(() => parsePlaybook({ levers: [lever(), lever()] })).toThrow(/used twice/)
    expect(() => parsePlaybook({ levers: [lever({ template: '' })] })).toThrow(/"template" must be non-empty text/)
    expect(() => parsePlaybook({ levers: [lever({ needs: { anyOf: 'email' } })] })).toThrow(/needs.anyOf/)
    expect(parsePlaybook({ version: 2, levers: [lever()] })).toMatchObject({ version: 2, levers: [{ id: 'new-signups.answer-intent-posts' }] })
  })
})

describe('the eval set', () => {
  it('has 30 goals with unique ids, and preferred levers that exist', () => {
    expect(GOAL_EVAL_SET).toHaveLength(30)
    expect(new Set(GOAL_EVAL_SET.map((c) => c.id)).size).toBe(30)
    const known = new Set(LEVERS.map((l) => l.id))
    for (const c of GOAL_EVAL_SET) for (const id of c.expect.preferLevers ?? []) expect(known.has(id), `${c.id}: ${id}`).toBe(true)
  })
})

describe('the goal pipeline', () => {
  const input = { goal: caseById('le-grow-100').goal, context: caseById('le-grow-100').context }

  it('reads the brief, plans from the focus’s levers, and keeps a plan the critique passes', async () => {
    const { modelCall, prompts } = scriptedModel({
      save_brief: [BRIEF],
      save_plan: [{ setup: ['Tag links'], workflows: [workflow()], leftOut: ['Onboarding emails: activation, not new signups'], assumptions: [], message: '' }],
      save_review: [{ passed: true, issues: [] }],
    })
    const result = await runGoalPipeline(modelCall, input)
    expect(result.brief.focus).toBe('new-signups')
    expect(result.workflows[0]).toMatchObject({ leverId: 'new-signups.answer-intent-posts', newIdea: false })
    expect(result.critique).toEqual({ passed: true, issues: [], revised: false })
    expect(prompts.map((p) => p.tool)).toEqual(['save_brief', 'save_plan', 'save_review'])
    // The plan step sees this focus's levers, and no other focus's.
    expect(prompts[1]!.user).toContain('new-signups.directory-listings')
    expect(prompts[1]!.user).not.toContain('activation.personal-welcome')
  })

  it('plans once more with the critique’s issues when it fails', async () => {
    const { modelCall, prompts } = scriptedModel({
      save_brief: [BRIEF],
      save_plan: [
        { setup: [], workflows: [workflow(), workflow({ title: 'Weekly report', leverId: '', lever: 'weekly report', focus: 'other' })], leftOut: [], assumptions: [], message: '' },
        { setup: [], workflows: [workflow()], leftOut: ['Weekly report: doesn’t bring new people'], assumptions: [], message: '' },
      ],
      save_review: [{ passed: false, issues: ['Weekly report does not move signups'] }, { passed: true, issues: [] }],
    })
    const result = await runGoalPipeline(modelCall, input)
    expect(result.workflows).toHaveLength(1)
    expect(result.critique.revised).toBe(true)
    expect(prompts[3]!.tool).toBe('save_plan')
    expect(prompts[3]!.user).toContain('Weekly report does not move signups')
  })

  it('tells the plan step what is already saved under the goal', async () => {
    const generateMore = caseById('le-generate-more')
    const { modelCall, prompts } = scriptedModel({
      save_brief: [BRIEF],
      save_plan: [{ setup: [], workflows: [], leftOut: [], assumptions: [], message: '' }],
      save_review: [{ passed: true, issues: [] }],
    })
    await runGoalPipeline(modelCall, { goal: generateMore.goal, context: generateMore.context, saved: generateMore.saved! })
    expect(prompts[1]!.user).toContain('never propose these levers again')
    expect(prompts[1]!.user).toContain('new-signups.creator-outreach; dismissed')
  })
})

describe('scoring a plan', () => {
  const growth = caseById('le-grow-100')
  const failed = (p: GoalPlan, c = growth) => scoreGoalPlan(p, c).checks.filter((x) => !x.pass).map((x) => x.name)

  const good = plan([
    workflow(),
    workflow({ title: 'Get listed', leverId: 'new-signups.directory-listings', lever: 'directory listings', request: 'Every Monday, find directories for AI agent tools that miss LoopEngine and draft submissions for me to submit.', humanMinutesPerWeek: 30, needs: [{ name: 'Firecrawl', kind: 'web-search', connected: true }] }),
    workflow({ title: 'Help n8n switchers', leverId: 'new-signups.competitor-switchers', lever: 'competitor switchers', request: 'Daily, find posts complaining about n8n and Zapier and send me in Telegram helpful replies mentioning LoopEngine; never post yourself.', humanMinutesPerWeek: 45 }),
  ])

  it('passes a focused, specific, honest plan on every check', () => {
    expect(failed(good)).toEqual([])
  })

  it('fails a padded plan: off focus, over time', () => {
    const padded = plan([...good.workflows, workflow({ title: 'Weekly growth report', leverId: '', lever: 'weekly report', focus: 'other', request: 'Every Monday send me LoopEngine signups in Telegram.', humanMinutesPerWeek: 120 })])
    expect(failed(padded)).toEqual(expect.arrayContaining(['on focus', 'time budget']))
  })

  it('fails a need claimed as connected that isn’t, and a send without approval', () => {
    const p = plan([...good.workflows.slice(0, 2), workflow({ title: 'Pitch creators', leverId: 'new-signups.creator-outreach', lever: 'creator outreach', request: 'Every Thursday, email each creator a LoopEngine pitch.', needs: [{ name: 'Gmail', kind: 'email', connected: true }], humanMinutesPerWeek: 30 })])
    expect(failed(p)).toEqual(expect.arrayContaining(['needs honest', 'approval wording']))
  })

  it('fails a generic request, and a repeated lever', () => {
    const p = plan([good.workflows[0]!, workflow({ title: 'Again', request: 'Find posts and draft replies for me to approve.' }), good.workflows[1]!])
    expect(failed(p)).toEqual(expect.arrayContaining(['specific', 'no duplicates']))
  })

  it('fails a measure nobody can read: source not connected, no step to read it, no baseline', () => {
    expect(failed(plan(good.workflows, { setup: ['Tag links with ref=<channel>'] }))).toContain('measure readable')
    // The brief must describe the source as the context has it.
    expect(failed(plan(good.workflows, { brief: { ...good.brief, measureSourceConnected: true } }))).toContain('measure source honest')
  })

  it('fails a plan that ignores what the goal singles out', () => {
    const generateMore = caseById('le-generate-more')
    const withShops = workflow({ title: 'Shopify merchants', leverId: 'new-signups.marketplace-listings', lever: 'marketplace listings', request: 'List LoopEngine in the Shopify App Store for merchants; I submit the listing.', humanMinutesPerWeek: 20, needs: [{ name: 'Firecrawl', kind: 'web-search', connected: true }] })
    const others = good.workflows.filter((w) => !['new-signups.answer-intent-posts', 'new-signups.directory-listings'].includes(w.leverId!))
    expect(failed(plan(others), generateMore)).toContain('qualifiers covered')
    expect(failed(plan([...others, withShops]), generateMore)).not.toContain('qualifiers covered')
  })

  it('fails proposing a lever already saved under the goal', () => {
    const generateMore = caseById('le-generate-more')
    expect(failed(plan([workflow()]), generateMore)).toContain('not saved before')
  })

  it('wants no workflows for an out-of-scope goal, and an honest message', () => {
    const moon = caseById('moon')
    const outPlan = plan([], { brief: { ...good.brief, scope: 'out', focus: 'other' }, message: 'LoopEngine can’t land anyone on the moon; I can help you follow lunar missions instead.' })
    expect(failed(outPlan, moon)).toEqual([])
    expect(failed(plan([workflow()], { brief: { ...good.brief, scope: 'out', focus: 'other' }, message: '' }), moon)).toEqual(expect.arrayContaining(['count', 'honest scope']))
  })
})
