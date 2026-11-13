import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ModelCall, ModelResponse } from '#core/run-agent.js'
import {
  checkBuiltWorkflows, createGoal, editAmount, generateMore, getGoal, goalContextFrom, goalPlanning, kindOf, listGoals, markBuilt, prepareBuild, readAbout, readGoalSettings, readLeverEvents, setWorkflowState, writeGoalSettings,
  type GoalsDeps,
} from '#web/goals-admin.js'

const BRIEF = { scope: 'in', scopeReason: 'ok', reading: 'literal', focus: 'new-signups', measure: 'signups a week', measureSource: 'none', measureSourceConnected: false, qualifiers: [], audience: 'small teams', weeklyHours: 3, approvals: 'approval first' }

const wf = (title: string, over: Record<string, unknown> = {}) => ({
  title, lever: title.toLowerCase(), focus: 'new-signups', mechanism: `Why ${title}`, request: `Do ${title}; nothing goes out without my approval.`,
  agent: 'growth-agent', needs: [{ name: 'Firecrawl', kind: 'web-search', connected: true }], humanMinutesPerWeek: 20, measureLink: 'ref', ...over,
})

/** A model answering the three pipeline steps, one plan per round. */
function model(plans: Record<string, unknown>[][]): { modelCall: ModelCall; plans: string[] } {
  const seen: string[] = []
  let round = -1
  const modelCall: ModelCall = async (messages, _system, tools) => {
    const tool = tools[0]!.name
    let input: Record<string, unknown>
    if (tool === 'save_brief') { round++; input = BRIEF }
    else if (tool === 'save_plan') { seen.push(String(messages[0]!.content)); input = { setup: ['Record today’s signups as a baseline'], workflows: plans[round] ?? [], leftOut: [], assumptions: [], message: '' } }
    else input = { passed: true, issues: [] }
    return { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: `${tool}-${seen.length}`, name: tool, input }] } as ModelResponse
  }
  return { modelCall, plans: seen }
}

function setup(plans: Record<string, unknown>[][], agents: string[] = ['growth-agent']) {
  const dir = mkdtempSync(join(tmpdir(), 'loopengine-goals-'))
  const created: { name: string; instructions: string }[] = []
  const existing = new Set(agents)
  const m = model(plans)
  const deps: GoalsDeps = {
    projectDir: () => dir,
    modelCall: async () => m.modelCall,
    context: async (about) => goalContextFrom({ about, agents: [...existing].map((name) => ({ name, abilities: [], messaging: null })), apps: [] }),
    agentExists: (name) => existing.has(name),
    createAgent: async (name, instructions) => { created.push({ name, instructions }); existing.add(name) },
  }
  return { deps, created, plans: m.plans }
}

describe('a goal and its workflows', () => {
  it('plans in the background and saves the suggestions, each with its agent', async () => {
    const { deps } = setup([[wf('Answer posts'), wf('Directory listings', { agent: 'listings-agent', newAgent: { name: 'Listings Agent', instructions: 'Finds directories.' } })]])
    const started = createGoal(deps, { goal: 'Grow LoopEngine Cloud users to 100', about: 'An agent platform for small teams' })
    expect(started.status).toBe('planning')
    await goalPlanning(started.id)
    const goal = getGoal(deps, started.id)
    expect(goal.status).toBe('ready')
    expect(goal.workflows.map((w) => [w.title, w.state, w.agent.name, w.agent.isNew])).toEqual([
      ['Answer posts', 'suggested', 'growth-agent', false],
      ['Directory listings', 'suggested', 'listings-agent', true],
    ])
    expect(goal.workflows[1]!.agent.instructions).toBe('Finds directories.')
    expect(goal.setup).toEqual(['Record today’s signups as a baseline'])
    expect(readAbout(deps)).toBe('An agent platform for small teams')
    expect(listGoals(deps).map((g) => g.id)).toEqual([goal.id])
  })

  it('saves, discards and restores, back to where each was', async () => {
    const { deps } = setup([[wf('A'), wf('B')]])
    const { id } = createGoal(deps, { goal: 'Grow users to 100' })
    await goalPlanning(id)
    const [a, b] = getGoal(deps, id).workflows
    setWorkflowState(deps, id, a!.id, 'save')
    setWorkflowState(deps, id, a!.id, 'discard')
    setWorkflowState(deps, id, b!.id, 'discard')
    expect(getGoal(deps, id).workflows.map((w) => w.state)).toEqual(['discarded', 'discarded'])
    setWorkflowState(deps, id, a!.id, 'restore')
    setWorkflowState(deps, id, b!.id, 'restore')
    expect(getGoal(deps, id).workflows.map((w) => w.state)).toEqual(['saved', 'suggested'])
    expect(() => setWorkflowState(deps, id, a!.id, 'save')).toThrow(/Only a suggestion/)
  })

  it('generates more without repeating anything already there, in any state', async () => {
    const { deps, plans } = setup([[wf('A'), wf('B')], [wf('A again', { lever: 'a' }), wf('C'), wf('C', { lever: 'c' })]])
    const { id } = createGoal(deps, { goal: 'Grow users to 100' })
    await goalPlanning(id)
    const [a, b] = getGoal(deps, id).workflows
    setWorkflowState(deps, id, a!.id, 'save')
    setWorkflowState(deps, id, b!.id, 'discard')
    generateMore(deps, id)
    await goalPlanning(id)
    const goal = getGoal(deps, id)
    // The planner was told about both, and its repeat of A (same lever) and
    // its own duplicate C were dropped.
    expect(plans[1]).toContain('- A (lever: a; saved)')
    expect(plans[1]).toContain('- B (lever: b; discarded)')
    expect(goal.workflows.map((w) => [w.title, w.state, w.round])).toEqual([['A', 'saved', 1], ['B', 'discarded', 1], ['C', 'suggested', 2]])
    expect(goal.rounds).toBe(2)
  })

  it('builds a saved workflow: makes its suggested agent when missing, then hands over to Build a workflow', async () => {
    const { deps, created } = setup([[wf('Listings', { agent: 'listings-agent', newAgent: { name: 'listings-agent', instructions: 'Finds directories.' } }), wf('Posts')]], [])
    const { id } = createGoal(deps, { goal: 'Grow users to 100' })
    await goalPlanning(id)
    const [listings, posts] = getGoal(deps, id).workflows
    await expect(prepareBuild(deps, id, listings!.id)).rejects.toThrow(/Save it first/)
    setWorkflowState(deps, id, listings!.id, 'save')
    const built = await prepareBuild(deps, id, listings!.id)
    expect(created).toEqual([{ name: 'listings-agent', instructions: 'Finds directories.' }])
    expect(built.createdAgent).toBe(true)
    expect(built.url).toContain('/workflows/new?agent=listings-agent&description=')
    expect(built.url).toContain(`goal=${id}`)
    // A workflow for an agent that now exists doesn't make it again.
    expect(posts!.agent).toMatchObject({ name: 'growth-agent', isNew: true })
    setWorkflowState(deps, id, posts!.id, 'save')
    expect((await prepareBuild(deps, id, posts!.id)).createdAgent).toBe(true)
    expect((await prepareBuild(deps, id, listings!.id)).createdAgent).toBe(false)
  })

  it('links the created workflow back, and won’t build or discard it again', async () => {
    const { deps } = setup([[wf('Posts')]])
    const { id } = createGoal(deps, { goal: 'Grow users to 100' })
    await goalPlanning(id)
    const [posts] = getGoal(deps, id).workflows
    setWorkflowState(deps, id, posts!.id, 'save')
    const goal = markBuilt(deps, id, posts!.id, { agent: 'growth-agent', workflowId: 'answer-posts', title: 'Answer posts' })
    expect(goal.workflows[0]).toMatchObject({ state: 'built', built: { agent: 'growth-agent', workflowId: 'answer-posts' } })
    await expect(prepareBuild(deps, id, posts!.id)).rejects.toThrow(/already built/)
    expect(() => setWorkflowState(deps, id, posts!.id, 'discard')).toThrow(/built/)
  })

  it('records a planning failure on the goal', async () => {
    const { deps } = setup([])
    deps.modelCall = async () => { throw new Error('No model is ready to plan with') }
    const { id } = createGoal(deps, { goal: 'Grow users to 100' })
    await goalPlanning(id)
    expect(getGoal(deps, id)).toMatchObject({ status: 'failed', error: 'No model is ready to plan with' })
  })

  it('asks for a goal worth planning', () => {
    const { deps } = setup([])
    expect(() => createGoal(deps, { goal: 'hi' })).toThrow(/what you want to achieve/)
    expect(() => getGoal(deps, '../etc')).toThrow(/No such goal/)
  })
})

describe('how much a built workflow was edited', () => {
  const SUGGESTION = 'Every weekday at 9:00, find up to 5 posts on Reddit and Hacker News where someone asks how to automate customer emails, and send me drafted replies in Telegram. Never post anything yourself.'

  it('tells no edit, a light one and a heavy one apart, by the words they share', () => {
    expect(editAmount(SUGGESTION, SUGGESTION)).toBe('none')
    expect(editAmount(SUGGESTION, SUGGESTION.replace('Reddit and Hacker News', 'r/AI_Agents').replace('9:00', '8:00'))).toBe('light')
    expect(editAmount(SUGGESTION, 'Each Friday, write a newsletter about our product updates and email it to all subscribers.')).toBe('heavy')
  })

  async function built(description?: string) {
    const { deps } = setup([[wf('Answer posts', { request: SUGGESTION })]])
    const { id } = createGoal(deps, { goal: 'Grow users to 100' })
    await goalPlanning(id)
    const [w] = getGoal(deps, id).workflows
    setWorkflowState(deps, id, w!.id, 'save')
    markBuilt(deps, id, w!.id, { agent: 'growth-agent', workflowId: 'answer-posts', ...(description !== undefined ? { description } : {}) })
    return { deps, id, wid: w!.id }
  }

  it('records how much the request was changed at Build, and an event only when it was', async () => {
    const untouched = await built(SUGGESTION)
    expect(getGoal(untouched.deps, untouched.id).workflows[0]!.edited).toBe('none')
    expect(readLeverEvents(untouched.deps).map((e) => e.type)).toEqual(['suggested', 'saved', 'built'])

    const changed = await built(SUGGESTION.replace('Reddit and Hacker News', 'r/AI_Agents and r/nocode'))
    expect(getGoal(changed.deps, changed.id).workflows[0]!.edited).toBe('light')
    const event = readLeverEvents(changed.deps).find((e) => e.type === 'built')
    expect(event).toMatchObject({ type: 'built', detail: { newAgent: false } })
    expect(readLeverEvents(changed.deps).find((e) => e.type === 'edited')).toMatchObject({ detail: { amount: 'light' }, lever: 'answer posts', focus: 'new-signups', goalWorkflow: changed.wid })
    // Never the text itself.
    expect(JSON.stringify(readLeverEvents(changed.deps))).not.toContain('r/AI_Agents')

    // Without the submitted request, nothing is known about edits.
    const unknown = await built()
    expect(getGoal(unknown.deps, unknown.id).workflows[0]!.edited).toBeUndefined()
  })
})

describe('lever events', () => {
  it('records a workflow’s life: suggested with its place, saved, discarded with why, restored, built', async () => {
    const { deps } = setup([[wf('A'), wf('B'), wf('C', { agent: 'new-agent', newAgent: { name: 'new-agent', instructions: 'Does C.' } })]])
    const { id } = createGoal(deps, { goal: 'Grow users to 100' })
    await goalPlanning(id)
    const [a, b, c] = getGoal(deps, id).workflows
    setWorkflowState(deps, id, a!.id, 'discard')
    setWorkflowState(deps, id, a!.id, 'reason', 'too-much-work')
    expect(() => setWorkflowState(deps, id, a!.id, 'reason', 'boring')).toThrow(/reason must be one of/)
    setWorkflowState(deps, id, a!.id, 'restore')
    setWorkflowState(deps, id, c!.id, 'save')
    await prepareBuild(deps, id, c!.id)
    markBuilt(deps, id, c!.id, { agent: 'new-agent', workflowId: 'c' })
    const events = readLeverEvents(deps)
    expect(events.filter((e) => e.type === 'suggested').map((e) => [e.lever, e.detail])).toEqual([['a', { position: 1, round: 1 }], ['b', { position: 2, round: 1 }], ['c', { position: 3, round: 1 }]])
    expect(events.filter((e) => e.type !== 'suggested').map((e) => [e.type, e.lever, e.detail])).toEqual([
      ['discarded', 'a', {}], ['discard_reason', 'a', { reason: 'too-much-work' }], ['restored', 'a', {}],
      ['saved', 'c', {}], ['built', 'c', { newAgent: true }],
    ])
    expect(b).toBeDefined()
  })

  it('checks built workflows daily: kept after 14 days, used weekly, removed once', async () => {
    const { deps } = setup([[wf('A')]])
    const { id } = createGoal(deps, { goal: 'Grow users to 100' })
    await goalPlanning(id)
    const [a] = getGoal(deps, id).workflows
    setWorkflowState(deps, id, a!.id, 'save')
    markBuilt(deps, id, a!.id, { agent: 'growth-agent', workflowId: 'a' })
    const builtAt = Date.parse(getGoal(deps, id).workflows[0]!.built!.at)
    const day = 24 * 60 * 60 * 1000
    let exists = true
    deps.workflowActivity = async () => ({ exists, runs: 6, done: 5 })
    const types = () => readLeverEvents(deps).filter((e) => ['kept_14d', 'used', 'removed'].includes(e.type)).map((e) => `${e.type}${e.detail.runs !== undefined ? `:${e.detail.runs}/${e.detail.done}` : ''}${e.detail.days !== undefined ? `:${e.detail.days}d` : ''}`)
    await checkBuiltWorkflows(deps, builtAt + 3 * day)
    expect(types()).toEqual([])
    await checkBuiltWorkflows(deps, builtAt + 8 * day)
    expect(types()).toEqual(['used:6/5'])
    await checkBuiltWorkflows(deps, builtAt + 10 * day)
    await checkBuiltWorkflows(deps, builtAt + 15 * day)
    expect(types()).toEqual(['used:6/5', 'kept_14d', 'used:6/5'])
    exists = false
    await checkBuiltWorkflows(deps, builtAt + 20 * day)
    await checkBuiltWorkflows(deps, builtAt + 21 * day)
    expect(types()).toEqual(['used:6/5', 'kept_14d', 'used:6/5', 'removed:20d'])
  })

  it('keeps the business’s kind and the sharing choice with what it says about itself', () => {
    const { deps } = setup([])
    writeGoalSettings(deps, { about: 'A candle shop', businessKind: 'ecommerce' })
    writeGoalSettings(deps, { shareLeverStats: false })
    expect(readGoalSettings(deps)).toEqual({ about: 'A candle shop', businessKind: 'ecommerce', shareLeverStats: false })
    expect(readAbout(deps)).toBe('A candle shop')
    expect(() => writeGoalSettings(deps, { businessKind: 'spaceships' })).toThrow(/businessKind must be one of/)
    writeGoalSettings(deps, { businessKind: null })
    expect(readGoalSettings(deps).businessKind).toBeUndefined()
  })
})

describe('the workspace as the goal planner sees it', () => {
  it('works with an empty workspace', () => {
    const context = goalContextFrom({ about: '', agents: [], apps: [] })
    expect(context.systems).toEqual([])
    expect(context.agents).toEqual([])
    expect(context.about).toMatch(/Not described yet/)
  })

  it('lists connected apps, abilities and messaging, by kind', () => {
    const context = goalContextFrom({
      about: 'A candle shop',
      agents: [{ name: 'shop-agent', description: 'Store tasks', abilities: ['@loopengine-co/gmail', 'lp-em-orders'], messaging: 'telegram' }],
      apps: [{ id: 'shopify', title: 'Shopify', connected: true }, { id: 'stripe', title: 'Stripe', connected: false }],
    })
    expect(context.systems).toEqual([
      { name: 'Shopify', kind: 'shopify', connected: true },
      { name: 'gmail', kind: 'email', connected: true },
      { name: 'lp-em-orders', kind: 'orders-or-crm', connected: true },
      { name: 'Telegram', kind: 'messaging', connected: true },
    ])
    expect(kindOf('Firecrawl')).toBe('web-search')
  })
})
