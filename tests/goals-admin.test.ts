import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ModelCall, ModelResponse } from '#core/run-agent.js'
import {
  acceptJob, addJob, assignJob, chainConditionMet, chainedRuns, checkBuiltWorkflows, createGoal, editAmount, editJob, goalView, MAX_CHAIN_DEPTH, generateMore, getGoal, goalContextFrom, goalPlanning, kindOf, listGoals, markBuilt, migrateGoal, migrateGoalFiles, prepareBuild, readAbout, readGoalSettings, readLeverEvents, setWorkflowState, writeGoalSettings,
  type GoalJob, type GoalsDeps,
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
    expect(goal.jobs.map((w) => [w.title, w.state, w.agent.name, w.agent.isNew])).toEqual([
      ['Answer posts', 'suggested', 'growth-agent', false],
      ['Directory listings', 'suggested', 'listings-agent', true],
    ])
    expect(goal.jobs[1]!.agent.instructions).toBe('Finds directories.')
    expect(goal.setup).toEqual(['Record today’s signups as a baseline'])
    expect(readAbout(deps)).toBe('An agent platform for small teams')
    expect(listGoals(deps).map((g) => g.id)).toEqual([goal.id])
  })

  it('saves, discards and restores, back to where each was', async () => {
    const { deps } = setup([[wf('A'), wf('B')]])
    const { id } = createGoal(deps, { goal: 'Grow users to 100' })
    await goalPlanning(id)
    const [a, b] = getGoal(deps, id).jobs
    setWorkflowState(deps, id, a!.id, 'save')
    setWorkflowState(deps, id, a!.id, 'discard')
    setWorkflowState(deps, id, b!.id, 'discard')
    expect(getGoal(deps, id).jobs.map((w) => w.state)).toEqual(['discarded', 'discarded'])
    setWorkflowState(deps, id, a!.id, 'restore')
    setWorkflowState(deps, id, b!.id, 'restore')
    expect(getGoal(deps, id).jobs.map((w) => w.state)).toEqual(['saved', 'suggested'])
    expect(() => setWorkflowState(deps, id, a!.id, 'save')).toThrow(/Only a suggestion/)
  })

  it('generates more without repeating anything already there, in any state', async () => {
    const { deps, plans } = setup([[wf('A'), wf('B')], [wf('A again', { lever: 'a' }), wf('C'), wf('C', { lever: 'c' })]])
    const { id } = createGoal(deps, { goal: 'Grow users to 100' })
    await goalPlanning(id)
    const [a, b] = getGoal(deps, id).jobs
    setWorkflowState(deps, id, a!.id, 'save')
    setWorkflowState(deps, id, b!.id, 'discard')
    generateMore(deps, id)
    await goalPlanning(id)
    const goal = getGoal(deps, id)
    // The planner was told about both, and its repeat of A (same lever) and
    // its own duplicate C were dropped.
    expect(plans[1]).toContain('- A (lever: a; saved)')
    expect(plans[1]).toContain('- B (lever: b; discarded)')
    expect(goal.jobs.map((w) => [w.title, w.state, w.round])).toEqual([['A', 'saved', 1], ['B', 'discarded', 1], ['C', 'suggested', 2]])
    expect(goal.rounds).toBe(2)
  })

  it('builds a saved workflow: makes its suggested agent when missing, then hands over to Build a workflow', async () => {
    const { deps, created } = setup([[wf('Listings', { agent: 'listings-agent', newAgent: { name: 'listings-agent', instructions: 'Finds directories.' } }), wf('Posts')]], [])
    const { id } = createGoal(deps, { goal: 'Grow users to 100' })
    await goalPlanning(id)
    const [listings, posts] = getGoal(deps, id).jobs
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
    const [posts] = getGoal(deps, id).jobs
    setWorkflowState(deps, id, posts!.id, 'save')
    const goal = markBuilt(deps, id, posts!.id, { agent: 'growth-agent', workflowId: 'answer-posts', title: 'Answer posts' })
    expect(goal.jobs[0]).toMatchObject({ state: 'active', doers: [{ type: 'workflow', agent: 'growth-agent', workflowId: 'answer-posts' }] })
    await expect(prepareBuild(deps, id, posts!.id)).rejects.toThrow(/already does this job/)
    expect(() => setWorkflowState(deps, id, posts!.id, 'discard')).toThrow(/remove it from its agent/)
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
    const [w] = getGoal(deps, id).jobs
    setWorkflowState(deps, id, w!.id, 'save')
    markBuilt(deps, id, w!.id, { agent: 'growth-agent', workflowId: 'answer-posts', ...(description !== undefined ? { description } : {}) })
    return { deps, id, wid: w!.id }
  }

  it('records how much the request was changed at Build, and an event only when it was', async () => {
    const untouched = await built(SUGGESTION)
    expect(getGoal(untouched.deps, untouched.id).jobs[0]!.edited).toBe('none')
    expect(readLeverEvents(untouched.deps).map((e) => e.type)).toEqual(['suggested', 'saved', 'built'])

    const changed = await built(SUGGESTION.replace('Reddit and Hacker News', 'r/AI_Agents and r/nocode'))
    expect(getGoal(changed.deps, changed.id).jobs[0]!.edited).toBe('light')
    const event = readLeverEvents(changed.deps).find((e) => e.type === 'built')
    expect(event).toMatchObject({ type: 'built', detail: { newAgent: false } })
    expect(readLeverEvents(changed.deps).find((e) => e.type === 'edited')).toMatchObject({ detail: { amount: 'light' }, lever: 'answer posts', focus: 'new-signups', job: changed.wid })
    // Never the text itself.
    expect(JSON.stringify(readLeverEvents(changed.deps))).not.toContain('r/AI_Agents')

    // Without the submitted request, nothing is known about edits.
    const unknown = await built()
    expect(getGoal(unknown.deps, unknown.id).jobs[0]!.edited).toBeUndefined()
  })
})

describe('lever events', () => {
  it('records a workflow’s life: suggested with its place, saved, discarded with why, restored, built', async () => {
    const { deps } = setup([[wf('A'), wf('B'), wf('C', { agent: 'new-agent', newAgent: { name: 'new-agent', instructions: 'Does C.' } })]])
    const { id } = createGoal(deps, { goal: 'Grow users to 100' })
    await goalPlanning(id)
    const [a, b, c] = getGoal(deps, id).jobs
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
    const [a] = getGoal(deps, id).jobs
    setWorkflowState(deps, id, a!.id, 'save')
    markBuilt(deps, id, a!.id, { agent: 'growth-agent', workflowId: 'a' })
    const builtAt = Date.parse(getGoal(deps, id).jobs[0]!.doers[0]!.at)
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

describe('jobs under a goal', () => {
  it('gives each job a kind and its own measure', async () => {
    const { deps } = setup([[wf('Answer posts', { kind: 'recurring', measure: 'replies per week' }), wf('List in directories', { kind: 'once', measure: 'done when: listed in 15 directories' })]])
    const { id } = createGoal(deps, { goal: 'Grow signups to 100' })
    await goalPlanning(id)
    expect(getGoal(deps, id).jobs.map((j) => [j.title, j.kind, j.measure, j.doers])).toEqual([
      ['Answer posts', 'recurring', 'replies per week', []],
      ['List in directories', 'once', 'done when: listed in 15 directories', []],
    ])
  })

  it('does a one-off job with its agent in Chat, then marks it done or reopens it', async () => {
    const { deps } = setup([[wf('List in directories', { kind: 'once', measure: 'done when: listed' })]])
    const { id } = createGoal(deps, { goal: 'Grow signups to 100' })
    await goalPlanning(id)
    const [job] = getGoal(deps, id).jobs
    expect(() => setWorkflowState(deps, id, job!.id, 'done')).toThrow(/Save it first/)
    setWorkflowState(deps, id, job!.id, 'save')
    const { url } = await prepareBuild(deps, id, job!.id)
    expect(url).toMatch(/^\/playground\?agent=growth-agent&message=Do\+List\+in\+directories/)
    expect(setWorkflowState(deps, id, job!.id, 'done').jobs[0]).toMatchObject({ state: 'done', doneAt: expect.any(String) })
    expect(readLeverEvents(deps).map((e) => e.type)).toEqual(['suggested', 'saved', 'done'])
    expect(setWorkflowState(deps, id, job!.id, 'undone').jobs[0]!.state).toBe('saved')
  })

  it('reads a goal saved before jobs: its workflows become recurring jobs, a built one active with its workflow', () => {
    const goal = migrateGoal({
      id: 'g-1', goal: 'Grow', setup: [], message: '', status: 'ready', rounds: 1, createdAt: '', updatedAt: '',
      workflows: [
        { id: 'w-1', title: 'Answer posts', state: 'built', built: { agent: 'growth-agent', workflowId: 'answer-posts', title: 'Answer posts', at: '2026-11-01T00:00:00Z' } },
        { id: 'w-2', title: 'List', state: 'saved' },
      ],
    })
    expect(goal.jobs.map((j) => [j.id, j.kind, j.state, j.doers.map((d) => d.workflowId)])).toEqual([['w-1', 'recurring', 'active', ['answer-posts']], ['w-2', 'recurring', 'saved', []]])
    expect((goal as unknown as Record<string, unknown>).workflows).toBeUndefined()
  })
})

describe('a one-off job assigned to its agent', () => {
  function withRuns(plans: Record<string, unknown>[][], agents?: string[]) {
    const s = setup(plans, agents)
    const runs = new Map<string, { status: 'running' | 'awaiting_approval' | 'done' | 'error'; result?: string; message: string }>()
    s.deps.startAssignment = async (_agent, message) => {
      const runId = `r-${runs.size + 1}`
      runs.set(runId, { status: 'running', message })
      return { runId }
    }
    s.deps.assignmentRun = async (_agent, runId) => runs.get(runId)
    return { ...s, runs }
  }

  it('assigns it, keeps each try, sends it back with a note and the previous result, and accepts the latest', async () => {
    const { deps, runs } = withRuns([[wf('List in directories', { kind: 'once', measure: 'done when: listed in 15 directories' })]])
    const { id } = createGoal(deps, { goal: 'Grow signups to 100' })
    await goalPlanning(id)
    const [job] = getGoal(deps, id).jobs
    await expect(assignJob(deps, id, job!.id)).rejects.toThrow(/Save it first/)
    setWorkflowState(deps, id, job!.id, 'save')

    let goal = await assignJob(deps, id, job!.id)
    expect(goal.jobs[0]).toMatchObject({ state: 'active', doers: [{ type: 'assignment', agent: 'growth-agent', runId: 'r-1' }] })
    expect(runs.get('r-1')!.message).toContain('This is a one-off job for the goal "Grow signups to 100".')
    expect(runs.get('r-1')!.message).toContain('Done when: listed in 15 directories')
    await expect(assignJob(deps, id, job!.id, { note: 'more' })).rejects.toThrow(/still going/)
    await expect(acceptJob(deps, id, job!.id)).rejects.toThrow(/finished/)

    runs.set('r-1', { ...runs.get('r-1')!, status: 'done', result: '1. Product Hunt\n2. BetaList' })
    goal = await assignJob(deps, id, job!.id, { note: 'Add 5 more, skip paid ones.' })
    const again = runs.get('r-2')!.message
    expect(again).toContain('<previous_result>\n1. Product Hunt\n2. BetaList\n</previous_result>')
    expect(again).toContain('Add 5 more, skip paid ones.')

    runs.set('r-2', { ...runs.get('r-2')!, status: 'done', result: '7 directories' })
    const view = await goalView(deps, getGoal(deps, id))
    expect(view.jobs[0]!.tries!.map((t) => [t.runId, t.status, t.note ?? ''])).toEqual([['r-1', 'done', ''], ['r-2', 'done', 'Add 5 more, skip paid ones.']])

    goal = await acceptJob(deps, id, job!.id)
    expect(goal.jobs[0]).toMatchObject({ state: 'done', result: '7 directories', doneAt: expect.any(String) })
    expect(readLeverEvents(deps).map((e) => [e.type, e.detail])).toEqual([
      ['suggested', { position: 1, round: 1 }], ['saved', {}], ['built', { newAgent: false }], ['done', { tries: 2 }],
    ])
  })

  it('makes its suggested agent first when there is none, and refuses a recurring job', async () => {
    const { deps, created } = withRuns([[wf('List in directories', { kind: 'once', agent: 'listings-agent', newAgent: { name: 'listings-agent', instructions: 'Finds directories.' } }), wf('Answer posts')]], [])
    const { id } = createGoal(deps, { goal: 'Grow signups to 100' })
    await goalPlanning(id)
    const [once, recurring] = getGoal(deps, id).jobs
    setWorkflowState(deps, id, once!.id, 'save')
    setWorkflowState(deps, id, recurring!.id, 'save')
    await assignJob(deps, id, once!.id)
    expect(created.map((c) => c.name)).toEqual(['listings-agent'])
    await expect(assignJob(deps, id, recurring!.id)).rejects.toThrow(/Only a one-off job/)
  })
})

describe("a recurring job's workflows and chain", () => {
  const FLOWS: Record<string, { title: string; parameters: Record<string, { required: boolean }> }> = {
    'growth-agent/lead-scan': { title: 'Lead scan', parameters: { week: { required: false } } },
    'sales-agent/outreach-draft': { title: 'Outreach draft', parameters: { lead: { required: true }, week: { required: false } } },
    'sales-agent/follow-up': { title: 'Follow-up', parameters: { lead: { required: true } } },
  }
  async function activeJob() {
    const s = setup([[wf('Reach leads')]], ['growth-agent', 'sales-agent'])
    s.deps.workflowInfo = (agent, workflowId) => FLOWS[`${agent}/${workflowId}`]
    const { id } = createGoal(s.deps, { goal: 'Grow signups to 100' })
    await goalPlanning(id)
    const job = getGoal(s.deps, id).jobs[0]!
    setWorkflowState(s.deps, id, job.id, 'save')
    markBuilt(s.deps, id, job.id, { agent: 'growth-agent', workflowId: 'lead-scan', title: 'Lead scan' })
    return { ...s, id, jobId: job.id }
  }
  const lead = { after: { agent: 'growth-agent', workflowId: 'lead-scan' }, when: { kind: 'line_starts', text: 'Lead:' }, run: { agent: 'sales-agent', workflowId: 'outreach-draft' }, with: { lead: 'result', week: 'input:week' } }

  it('adds workflows on other agents to the job, and builds another one', async () => {
    const { deps, id, jobId } = await activeJob()
    const goal = editJob(deps, id, jobId, { action: 'link', agent: 'sales-agent', workflowId: 'outreach-draft' })
    expect(goal.jobs[0]!.doers.map((d) => d.type === 'workflow' && d.workflowId)).toEqual(['lead-scan', 'outreach-draft'])
    expect(() => editJob(deps, id, jobId, { action: 'link', agent: 'sales-agent', workflowId: 'nope' })).toThrow(/has no workflow/)
    await expect(prepareBuild(deps, id, jobId)).rejects.toThrow(/add another workflow/)
    expect((await prepareBuild(deps, id, jobId, { another: true })).url).toContain('description=&')
    expect(readLeverEvents(deps).filter((e) => e.type === 'built')).toHaveLength(1)
  })

  it('checks a chain: both workflows on the job, required inputs filled, no loops', async () => {
    const { deps, id, jobId } = await activeJob()
    expect(() => editJob(deps, id, jobId, { action: 'chain', chain: [lead] })).toThrow(/must do this job/)
    editJob(deps, id, jobId, { action: 'link', agent: 'sales-agent', workflowId: 'outreach-draft' })
    expect(() => editJob(deps, id, jobId, { action: 'chain', chain: [{ ...lead, with: {} }] })).toThrow(/Outreach draft's lead comes from/)
    expect(() => editJob(deps, id, jobId, { action: 'chain', chain: [{ ...lead, with: { lead: 'input:nope' } }] })).toThrow(/comes from "result"/)
    const back = { after: lead.run, when: { kind: 'always' }, run: lead.after, with: {} }
    expect(() => editJob(deps, id, jobId, { action: 'chain', chain: [lead, back] })).toThrow(/loops/)
    const goal = editJob(deps, id, jobId, { action: 'chain', chain: [lead] })
    expect(goal.jobs[0]!.chain).toMatchObject([{ id: expect.stringMatching(/^c-/), when: { kind: 'line_starts', text: 'Lead:' }, with: { lead: 'result', week: 'input:week' } }])
  })

  it('says what runs next when a run finishes: only when its result meets the step, inputs filled, not too deep', async () => {
    const { deps, id, jobId } = await activeJob()
    editJob(deps, id, jobId, { action: 'link', agent: 'sales-agent', workflowId: 'outreach-draft' })
    editJob(deps, id, jobId, { action: 'chain', chain: [lead] })
    const run = { run_id: 'r1', agent: 'growth-agent', workflow_id: 'lead-scan', status: 'done', params: { week: '46' } }
    expect(chainedRuns(deps, { ...run, result: 'Nothing new this week.' })).toEqual([])
    expect(chainedRuns(deps, { ...run, result: 'Found one.\nLead: Ann at Acme' })).toEqual([
      { goal: id, job: jobId, step: expect.any(String), agent: 'sales-agent', workflowId: 'outreach-draft', params: { lead: 'Found one.\nLead: Ann at Acme', week: '46' }, depth: 1 },
    ])
    expect(chainedRuns(deps, { ...run, status: 'error', result: 'Lead: x' })).toEqual([])
    expect(chainedRuns(deps, { ...run, result: 'Lead: x', chain_depth: MAX_CHAIN_DEPTH })).toEqual([])
    expect(chainConditionMet({ kind: 'contains', text: 'URGENT' }, 'this is urgent')).toBe(true)
  })

  it('removes a workflow and its steps; with none left the job is saved again', async () => {
    const { deps, id, jobId } = await activeJob()
    editJob(deps, id, jobId, { action: 'link', agent: 'sales-agent', workflowId: 'outreach-draft' })
    editJob(deps, id, jobId, { action: 'chain', chain: [lead] })
    let goal = editJob(deps, id, jobId, { action: 'unlink', agent: 'sales-agent', workflowId: 'outreach-draft' })
    expect(goal.jobs[0]!.chain).toBeUndefined()
    goal = editJob(deps, id, jobId, { action: 'unlink', agent: 'growth-agent', workflowId: 'lead-scan' })
    expect(goal.jobs[0]).toMatchObject({ state: 'saved', doers: [] })
  })
})

describe('goals saved before jobs', () => {
  it('rewrites their files once: built ones active with their workflow, the rest taking their lever kind and measure', async () => {
    const { deps } = setup([])
    const { writeFileSync, readFileSync, mkdirSync } = await import('node:fs')
    mkdirSync(join(deps.projectDir(), 'goals'), { recursive: true })
    const file = join(deps.projectDir(), 'goals', 'g-old-1.json')
    writeFileSync(file, JSON.stringify({
      id: 'g-old-1', goal: 'Grow', setup: [], message: '', status: 'ready', rounds: 1, createdAt: '2026-11-01T00:00:00Z', updatedAt: '2026-11-01T00:00:00Z',
      workflows: [
        { id: 'w-1', title: 'Answer posts', leverId: 'new-signups.answer-intent-posts', lever: 'answer intent posts', focus: 'new-signups', measureLink: 'ref', state: 'built', built: { agent: 'growth-agent', workflowId: 'answer-posts', title: 'Answer posts', at: '2026-11-02T00:00:00Z' } },
        { id: 'w-2', title: 'List in directories', leverId: 'new-signups.directory-listings', lever: 'directory listings', focus: 'new-signups', measureLink: 'ref', state: 'saved' },
      ],
    }))
    expect(migrateGoalFiles(deps)).toBe(1)
    const saved = JSON.parse(readFileSync(file, 'utf8'))
    expect(saved.workflows).toBeUndefined()
    expect(saved.jobs.map((j: GoalJob) => [j.id, j.kind, j.state, j.doers.length, j.measure])).toEqual([
      ['w-1', 'recurring', 'active', 1, 'signups tagged ref=community'],
      ['w-2', 'once', 'saved', 0, 'signups tagged ref=directory'],
    ])
    expect(migrateGoalFiles(deps)).toBe(0)
  })
})

describe('a job the person adds', () => {
  async function plannedGoal(answer: Record<string, unknown>) {
    const s = setup([[wf('Answer posts')]])
    const { id } = createGoal(s.deps, { goal: 'Grow signups to 100' })
    await goalPlanning(id)
    s.deps.modelCall = async () => (async (_m, _s, tools) => ({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'j1', name: tools[0]!.name, input: answer }] }) as ModelResponse)
    return { ...s, id }
  }

  it('shapes it into a saved job, with the person’s words and how it was judged', async () => {
    const { deps, id } = await plannedGoal({ verdict: 'changed', note: 'I added approval before anything is sent.', job: wf('Thank new customers', { kind: 'recurring', measure: 'repeat orders from thanked customers', leverId: 'thank-new-customers' }), newLever: {
      key: 'thank-new-customers', name: 'Thank new customers soon after purchase', kind: 'recurring', mechanism: 'A quick personal thank-you makes a second purchase more likely.', fitsWhen: ['customers buy online'], notWhen: [], needs: ['email'],
      humanMinutesPerWeek: 15, firstResultDays: 14, measureLink: 'repeat orders from thanked customers', guardrails: ['Nothing is sent without approval.'], template: 'Each day, draft a thank-you to every new customer of {product}.',
    } })
    const added = await addJob(deps, id, { idea: 'email every new customer a thank you' })
    expect(added.verdict).toBe('changed')
    const job = added.goal.jobs.find((j) => j.id === added.jobId)!
    expect(job).toMatchObject({ state: 'saved', title: 'Thank new customers', leverId: 'new-signups.x-thank-new-customers', added: { idea: 'email every new customer a thank you', verdict: 'changed' } })
    expect(readLeverEvents(deps).at(-1)).toMatchObject({ type: 'added', job: job.id })
  })

  it('keeps a job to the workspace when asked: its lever events are marked private', async () => {
    const { deps, id } = await plannedGoal({ verdict: 'added', job: wf('Thank new customers') })
    const added = await addJob(deps, id, { idea: 'email every new customer a thank you', private: true })
    expect(added.goal.jobs.find((j) => j.id === added.jobId)).toMatchObject({ keepPrivate: true })
    expect(readLeverEvents(deps).at(-1)).toMatchObject({ type: 'added', private: true })
  })

  it('refuses a deceptive one and adds nothing', async () => {
    const { deps, id } = await plannedGoal({ verdict: 'refused', note: 'Fake reviews break store rules.', alternative: 'Ask happy customers for honest reviews.' })
    const before = getGoal(deps, id).jobs.length
    const result = await addJob(deps, id, { idea: 'post fake 5 star reviews' })
    expect(result).toMatchObject({ verdict: 'refused', alternative: 'Ask happy customers for honest reviews.' })
    expect(getGoal(deps, id).jobs).toHaveLength(before)
  })
})
