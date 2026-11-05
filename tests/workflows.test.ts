import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ModelCall, ModelResponse } from '#core/run-agent.js'
import { planParameters, planWorkflowWithModel, validateWorkflowPlan, workflowTemplate, type WorkflowPlannerTools } from '#core/system-agents/workflow-planner.js'
import { clearWorkflowFields, readWorkflow, readWorkflows, setWorkflowFields, validateParams, workflowRunMessage, WorkflowParamsError } from '#core/workflows.js'
import { FileSchedulerStore, cancelScheduledTask, createScheduledTask, getScheduledTask, listScheduledTasks, setSchedulerStore } from '#core/scheduler.js'
import { checkWorkflowForAgent, forgetWorkflow, listAgentWorkflows, planWorkflow, prepareWorkflowRun, updateWorkflow, type WorkflowAgentInfo } from '#web/workflow-admin.js'
import { FileRunStore, WorkflowRunner, setRunStore } from '#core/workflow-runs.js'

const RAW_PLAN = {
  name: 'Weekly blog post',
  id: 'Weekly Blog Post!',
  summary: 'Finds blog ideas, asks which to write, drafts it and asks for review.',
  trigger: { kind: 'schedule', description: 'every Monday at 09:00', every: '7d', at: '09:00', weekday: 1 },
  steps: [
    { title: 'Find timely ideas', kind: 'tool', tool: 'web_search', ability: 'lp-web-search' },
    { title: 'Ask which idea to write', kind: 'ask', tool: 'system_ask_user', detail: 'offer the ideas as options' },
    { title: 'Write the draft', kind: 'other' },
    { title: 'Open the draft for review', kind: 'approval', tool: 'draft_blog_post', ability: 'lp-blog-drafter' },
  ],
  rules: [
    { tool: 'web_search', decision: 'allow' },
    { tool: 'draft_blog_post', decision: 'allow' },
    { tool: 'system_ask_user', decision: 'allow' },
  ],
  keys: ['TAVILY_API_KEY', 'TAVILY_API_KEY'],
  skill: { description: 'The weekly blog post workflow', body: '1. Search with web_search.\n2. Ask with system_ask_user.\n3. Draft with draft_blog_post.' },
  startMessage: 'Run the weekly blog post workflow.',
  target: { kind: 'new', reason: 'No agent writes blog posts yet.' },
  newAgent: { name: 'Blog Writer', systemPrompt: 'You write our blog.' },
}

const agent = (overrides: Partial<WorkflowAgentInfo> = {}): WorkflowAgentInfo => ({
  name: 'web-agent',
  tools: ['web_search'],
  abilities: ['lp-web-search'],
  rules: [{ tool: 'web_search', decision: 'allow', scope: '*/*' }],
  defaultDecision: 'ask',
  messaging: 'slack',
  ...overrides,
})

describe('a workflow plan', () => {
  it('is cleaned up: ids slugified, approval tools always ask, the ask tool needs no rule, abilities gathered from steps', () => {
    const plan = validateWorkflowPlan(RAW_PLAN)!
    expect(plan.id).toBe('weekly-blog-post')
    expect(plan.newAgent.name).toBe('blog-writer')
    expect(plan.rules).toEqual([{ tool: 'web_search', decision: 'allow' }, { tool: 'draft_blog_post', decision: 'ask' }])
    expect(plan.abilities).toEqual(['lp-web-search', 'lp-blog-drafter'])
    expect(plan.keys).toEqual(['TAVILY_API_KEY'])
    expect(plan.needsApprovals).toBe(true)
    expect(plan.trigger).toEqual({ kind: 'schedule', description: 'every Monday at 09:00', every: '7d', at: '09:00', weekday: 1 })
  })

  it('falls back to on request for a schedule it cannot read, and refuses a plan with no steps or skill', () => {
    expect(validateWorkflowPlan({ ...RAW_PLAN, trigger: { kind: 'schedule', every: 'mondays' } })!.trigger.kind).toBe('on_request')
    expect(validateWorkflowPlan({ ...RAW_PLAN, steps: [] })).toBeUndefined()
    expect(validateWorkflowPlan({ ...RAW_PLAN, skill: {} })).toBeUndefined()
  })

  it('becomes a template: its skill, rules, abilities and a schedule with its start', () => {
    const t = workflowTemplate(validateWorkflowPlan(RAW_PLAN)!)
    expect(t.setup.skills).toEqual([{ id: 'weekly-blog-post', description: 'The weekly blog post workflow', body: RAW_PLAN.skill.body }])
    expect(t.setup.rules.map((r) => [r.tool, r.decision])).toEqual([['web_search', 'allow'], ['draft_blog_post', 'ask']])
    expect(t.setup.schedule).toEqual({ every: '7d', at: '09:00', weekday: 1, name: 'Weekly blog post', message: 'Run the weekly blog post workflow.', workflowId: 'weekly-blog-post' })
    expect(t.candidate.agent.name).toBe('blog-writer')
  })
})

describe("a plan's notify choice", () => {
  it('comes from the planner with its reason, and is off when it gave none', () => {
    const on = validateWorkflowPlan({ ...RAW_PLAN, notify: { on: true, reason: 'Nothing posts the ideas anywhere, so they are sent to you.' } })!
    expect(on.notify).toEqual({ on: true, reason: 'Nothing posts the ideas anywhere, so they are sent to you.' })
    expect(validateWorkflowPlan(RAW_PLAN)!.notify).toEqual({ on: false, reason: '' })
  })

  it('reaches the schedule a new agent gets', () => {
    expect(workflowTemplate(validateWorkflowPlan({ ...RAW_PLAN, notify: { on: true, reason: 'x' } })!).setup.schedule?.notify).toBe(true)
    expect(workflowTemplate(validateWorkflowPlan(RAW_PLAN)!).setup.schedule).not.toHaveProperty('notify')
  })
})

describe("a plan's parameters", () => {
  const onRequest = { kind: 'on_request', description: 'When a refund request comes in' }

  it('come from the planner, with names tidied and descriptions kept', () => {
    const plan = validateWorkflowPlan({
      ...RAW_PLAN,
      trigger: onRequest,
      startMessage: 'Check the refund request for order $order_number.',
      skill: { description: 'Refund check', body: '1. Look up order $order_number.\n2. Weigh $customer_note.' },
      parameters: { 'Order Number': { description: 'The order to check', required: true }, customer_note: { description: 'What the customer wrote' }, '123': {} },
    })!
    expect(plan.parameters).toEqual({
      order_number: { description: 'The order to check', required: true },
      customer_note: { description: 'What the customer wrote', required: false },
    })
  })

  it('declare a $name the start message or steps use but the planner left out', () => {
    const plan = validateWorkflowPlan({ ...RAW_PLAN, trigger: onRequest, startMessage: 'Triage this alert: $alert', skill: { description: 'Triage', body: 'Find what changed in $service.' } })!
    expect(plan.parameters).toEqual({ alert: { description: '', required: false }, service: { description: '', required: false } })
  })

  it('are none for a job that is the same every run', () => {
    expect(validateWorkflowPlan(RAW_PLAN)!.parameters).toEqual({})
  })

  it('are never required on a scheduled workflow, with a note saying why', () => {
    const plan = validateWorkflowPlan({ ...RAW_PLAN, startMessage: 'Write the digest for $region.', parameters: { region: { description: 'Which region', required: true } } })!
    expect(plan.trigger.kind).toBe('schedule')
    expect(plan.parameters).toEqual({ region: { description: 'Which region', required: false } })
    expect(plan.gaps.at(-1)).toMatch(/A schedule can't fill in region, so it is optional/)
  })

  it('are tidied again when an edited plan is created', () => {
    const { parameters, notes } = planParameters({ order_number: { description: 'Edited', required: true }, 'Bad Name!': {} }, { startMessage: 'Check $order_number.', skillBody: 'Steps.', scheduled: false })
    expect(parameters).toEqual({ order_number: { description: 'Edited', required: true }, bad_name: { description: '', required: false } })
    expect(notes).toEqual([])
  })
})

describe('checking a workflow against an existing agent', () => {
  const plan = validateWorkflowPlan(RAW_PLAN)!
  it('fits when nothing the agent decides would change, listing the abilities to install', () => {
    expect(checkWorkflowForAgent(plan, agent())).toEqual({ conflicts: [], toInstall: ['lp-blog-drafter'], toConnect: [], fits: true })
  })
  it('reports a decision the agent already has differently', () => {
    const check = checkWorkflowForAgent(plan, agent({ rules: [{ tool: 'draft_blog_post', decision: 'allow', scope: '*/*' }] }))
    expect(check).toMatchObject({ fits: false, conflicts: [{ tool: 'draft_blog_post', has: 'allow', wants: 'ask' }] })
  })
  it('recognises an installed ability by its name in any spec form', () => {
    const p = { ...plan, abilities: ['file:/srv/abilities/lp-blog-drafter', '@acme/lp-x@1.2.0', 'github:org/lp-y'] }
    expect(checkWorkflowForAgent(p, agent({ abilities: ['lp-blog-drafter', '@acme/lp-x', 'lp-y'] })).toInstall).toEqual([])
  })
})

/** A fake model that looks around, then saves `plan`. */
function scriptedModel(plan: unknown, seen: string[]): ModelCall {
  let turn = 0
  return (async () => {
    turn++
    const reply: ModelResponse =
      turn === 1
        ? { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 't1', name: 'list_agents', input: {} }, { type: 'tool_use', id: 't2', name: 'search_public_abilities', input: { query: 'web search' } }] }
        : { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 't3', name: 'save_plan', input: plan as Record<string, unknown> }] }
    return reply
  }) as unknown as ModelCall
}

const tools = (agents: WorkflowAgentInfo[], seen: string[]): WorkflowPlannerTools & { agentInfo(): Promise<WorkflowAgentInfo[]> } => ({
  agentInfo: async () => agents,
  listAgents: async () => { seen.push('listAgents'); return agents },
  searchPublicAbilities: async (q) => { seen.push(`search:${q}`); return [{ name: 'lp-web-search' }] },
  listWorkspaceAbilities: async () => [],
  abilityDetails: async () => ({}),
  listConnections: async () => ({}),
})

describe('planning with a model', () => {
  it('looks at the workspace, then returns the saved plan', async () => {
    const seen: string[] = []
    const result = await planWorkflowWithModel(scriptedModel(RAW_PLAN, seen), 'weekly blog post', tools([agent()], seen))
    expect(seen).toEqual(['listAgents', 'search:web search'])
    expect(result.plan?.name).toBe('Weekly blog post')
  })

  it('switches a suggested agent that would have a decision changed to a new agent, saying why', async () => {
    const seen: string[] = []
    const plan = { ...RAW_PLAN, target: { kind: 'existing', agent: 'web-agent', reason: 'It already searches the web.' } }
    const planned = await planWorkflow('Every Monday find blog ideas, ask me, draft it.', scriptedModel(plan, seen), tools([agent({ rules: [{ tool: 'draft_blog_post', decision: 'allow', scope: '*/*' }] })], seen))
    expect(planned.plan.target.kind).toBe('new')
    expect(planned.note).toMatch(/draft_blog_post \(allow there, ask here\)/)
  })

  it('keeps a suggested agent that fits, with its check', async () => {
    const seen: string[] = []
    const plan = { ...RAW_PLAN, target: { kind: 'existing', agent: 'web-agent', reason: 'It already searches the web.' } }
    const planned = await planWorkflow('Every Monday find blog ideas, ask me, draft it.', scriptedModel(plan, seen), tools([agent()], seen))
    expect(planned.plan.target).toMatchObject({ kind: 'existing', agent: 'web-agent' })
    expect(planned.check?.toInstall).toEqual(['lp-blog-drafter'])
  })

  it('refuses a description too short to plan', async () => {
    await expect(planWorkflow('blog', scriptedModel(RAW_PLAN, []), tools([], []))).rejects.toThrow(/sentence or two/)
  })
})

// A skill file, as the planner or the Skills tab writes one.
function writeSkill(agentDir: string, id: string, frontmatter: string, body: string): void {
  mkdirSync(join(agentDir, 'skills', id), { recursive: true })
  writeFileSync(join(agentDir, 'skills', id, 'SKILL.md'), `---\nname: ${id}\ndescription: ${id} steps\n${frontmatter}---\n\n${body}\n`)
}

const REFUND = [
  'start_message: Check the refund request for order $order_number.',
  'title: Refund check',
  'trigger: When a refund request comes in',
  'parameters:',
  '  order_number: { description: The order to check, required: true }',
  '  customer_note: { description: What the customer wrote }',
  '',
].join('\n')

describe('workflows are skills with a start message', () => {
  let dir: string
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'le-workflows-')) })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('lists only skills that have a start message, with their parameters and steps', () => {
    writeSkill(dir, 'refund-check', REFUND, '1. Look up order $order_number.\n2. Weigh this: $customer_note')
    writeSkill(dir, 'plain-skill', '', 'Just guidance, not a job.')

    expect(readWorkflows(dir)).toEqual([{
      id: 'refund-check',
      title: 'Refund check',
      description: 'refund-check steps',
      startMessage: 'Check the refund request for order $order_number.',
      trigger: 'When a refund request comes in',
      parameters: { order_number: { description: 'The order to check', required: true }, customer_note: { description: 'What the customer wrote', required: false } },
      steps: '1. Look up order $order_number.\n2. Weigh this: $customer_note',
    }])
    expect(readWorkflow(dir, 'plain-skill')).toBeUndefined()
    expect(readWorkflow(dir, '../escape')).toBeUndefined()
  })

  it('becomes a workflow and stops being one by its front matter, keeping the skill', () => {
    writeSkill(dir, 'digest', 'paths: ["reports/**"]\n', 'Write the digest.')
    setWorkflowFields(dir, 'digest', { title: 'Weekly digest', startMessage: 'Write this week\'s digest.', trigger: 'Mondays at 9' })
    expect(readWorkflow(dir, 'digest')).toMatchObject({ title: 'Weekly digest', startMessage: 'Write this week\'s digest.', steps: 'Write the digest.' })
    expect(readFileSync(join(dir, 'skills', 'digest', 'SKILL.md'), 'utf8')).toContain('paths:')

    clearWorkflowFields(dir, 'digest')
    expect(readWorkflow(dir, 'digest')).toBeUndefined()
    const file = readFileSync(join(dir, 'skills', 'digest', 'SKILL.md'), 'utf8')
    expect(file).not.toContain('start_message')
    expect(file).toContain('Write the digest.')
    expect(() => setWorkflowFields(dir, 'nope', { startMessage: 'x' })).toThrow(/No skill "nope"/)
    expect(() => setWorkflowFields(dir, 'digest', { startMessage: 'x', parameters: { 'Bad-Name': { description: '', required: false } } })).toThrow(/lowercase/)
  })

  it('checks parameters: required ones given, no unknown ones, values as text', () => {
    writeSkill(dir, 'refund-check', REFUND, 'Steps.')
    const w = readWorkflow(dir, 'refund-check')!
    expect(validateParams(w, { order_number: 4821, customer_note: '' })).toEqual({ order_number: '4821' })
    expect(() => validateParams(w, {})).toThrow(/"order_number" is required/)
    expect(() => validateParams(w, { order_number: '1', coupon: 'x' })).toThrow(/unknown parameter "coupon".*its parameters: order_number, customer_note/)
    expect(() => validateParams(w, { order_number: { id: 1 } })).toThrow(/must be text/)
    expect(() => validateParams(w, 'order 1')).toThrow(WorkflowParamsError)
  })

  it('starts a run with its start message and steps, parameters filled in', () => {
    writeSkill(dir, 'refund-check', REFUND, '1. Look up order $order_number.\n2. Weigh this: $customer_note\n3. Refund at most $50 without asking.')
    const w = readWorkflow(dir, 'refund-check')!

    expect(workflowRunMessage(w, { order_number: 'EM20-1' })).toBe(
      'Check the refund request for order EM20-1.\n\nThese are the steps, from your "refund-check" skill:\n\n' +
        '1. Look up order EM20-1.\n2. Weigh this: \n3. Refund at most $50 without asking.',
    )
  })

  it('lists values no placeholder uses as inputs, so the agent still gets them', () => {
    writeSkill(dir, 'triage', 'start_message: Triage this alert.\nparameters:\n  alert: { required: true }\n', 'Find what changed.')
    expect(workflowRunMessage(readWorkflow(dir, 'triage')!, { alert: 'checkout 18% errors' })).toBe(
      'Triage this alert.\n\nInputs:\n- alert: checkout 18% errors\n\nThese are the steps, from your "triage" skill:\n\nFind what changed.',
    )
  })
})

describe("a workflow's runs and schedules", () => {
  let dir: string
  let schedulerDir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'le-workflow-schedules-'))
    schedulerDir = mkdtempSync(join(tmpdir(), 'le-workflow-scheduler-'))
    setSchedulerStore(new FileSchedulerStore(schedulerDir))
    setRunStore(new FileRunStore(schedulerDir))
    writeSkill(dir, 'refund-check', REFUND, 'Steps.')
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    rmSync(schedulerDir, { recursive: true, force: true })
  })

  it('are the tasks carrying its id, repeating ones first, whatever they are called', async () => {
    const once = await createScheduledTask({ agent: 'cs', workflow_id: 'refund-check', params: { order_number: '1' }, schedule: { run_at: new Date(Date.now() + 3_600_000).toISOString() }, task_name: 'One more' })
    const daily = await createScheduledTask({ agent: 'cs', workflow_id: 'refund-check', params: { order_number: '2' }, schedule: { every: '1d' }, task_name: 'Renamed later' })
    await createScheduledTask({ agent: 'cs', message: 'something else', schedule: { every: '1d' }, task_name: 'Refund check' })

    const [w] = await listAgentWorkflows('cs', dir)
    expect(w.schedules.map((s) => s.taskId)).toEqual([daily.task_id, once.task_id])
    expect(w.schedule).toMatchObject({ taskId: daily.task_id, repeating: true, params: { order_number: '2' } })
  })

  it('a run is prepared with its parameters checked and its first message worked out', async () => {
    const prepared = await prepareWorkflowRun('cs', dir, 'refund-check', { order_number: 'EM20-1' })
    expect(prepared.params).toEqual({ order_number: 'EM20-1' })
    expect(prepared.message).toBe('Check the refund request for order EM20-1.\n\nThese are the steps, from your "refund-check" skill:\n\nSteps.')
    await expect(prepareWorkflowRun('cs', dir, 'refund-check', {})).rejects.toThrow(/"order_number" is required/)
    await expect(prepareWorkflowRun('cs', dir, 'no-such-workflow')).rejects.toThrow(/No workflow no-such-workflow/)
  })

  it('a run with the same parameters as one under way is refused; others go ahead, and show as recent runs', async () => {
    const runner = new WorkflowRunner({ execute: async () => ({ kind: 'pending', pendingIds: ['p1'] }) })
    const prepared = await prepareWorkflowRun('cs', dir, 'refund-check', { order_number: 'EM20-1' })
    const run = await runner.start({ agent: 'cs', workflow_id: 'refund-check', params: prepared.params, source: 'console', message: prepared.message })
    await runner.idle()

    await expect(prepareWorkflowRun('cs', dir, 'refund-check', { order_number: 'EM20-1' })).rejects.toThrow(/already running with these parameters/)
    await expect(prepareWorkflowRun('cs', dir, 'refund-check', { order_number: 'EM20-2' })).resolves.toMatchObject({ params: { order_number: 'EM20-2' } })

    const [w] = await listAgentWorkflows('cs', dir)
    expect(w.recentRuns.map((r) => [r.run_id, r.status])).toEqual([[run.run_id, 'awaiting_approval']])
    expect(w.schedules).toEqual([])
  })

  it('is edited from the console: title, start message, trigger and parameters, keeping its steps and other front matter', () => {
    const path = join(dir, 'skills', 'refund-check', 'SKILL.md')
    writeFileSync(path, readFileSync(path, 'utf8').replace('name: refund-check\n', 'name: refund-check\npaths: ["orders/**"]\n'))

    const w = updateWorkflow(dir, 'refund-check', {
      title: 'Refund review',
      start_message: '  Review the refund for order $order_number in $currency. ',
      trigger: 'When support asks',
      parameters: { order_number: { description: 'The order', required: true }, currency: { description: 'Its currency' } },
    })

    expect(w).toMatchObject({
      title: 'Refund review',
      startMessage: 'Review the refund for order $order_number in $currency.',
      trigger: 'When support asks',
      parameters: { order_number: { description: 'The order', required: true }, currency: { description: 'Its currency', required: false } },
      steps: 'Steps.',
    })
    expect(readFileSync(path, 'utf8')).toContain('paths:')
    expect(readFileSync(path, 'utf8')).not.toContain('customer_note')
  })

  it('refuses an edit it cannot save, saying why', () => {
    expect(() => updateWorkflow(dir, 'refund-check', { start_message: '  ' })).toThrow(/Write the start message/)
    expect(() => updateWorkflow(dir, 'refund-check', { start_message: 'Go.', parameters: { 'Order-Number': {} } })).toThrow(/lowercase letters/)
    expect(() => updateWorkflow(dir, 'refund-check', { start_message: 'Go.', parameters: ['order_number'] })).toThrow(/parameters must be an object/)
    expect(() => updateWorkflow(dir, 'refund-check', { start_message: 'x'.repeat(4001) })).toThrow(/too long/)
    expect(() => updateWorkflow(dir, 'no-such-workflow', { start_message: 'Go.' })).toThrow(/No workflow no-such-workflow/)
    expect(readWorkflow(dir, 'refund-check')?.title).toBe('Refund check')
  })

  it('forgetting it cancels its schedules and keeps the skill', async () => {
    await createScheduledTask({ agent: 'cs', workflow_id: 'refund-check', params: { order_number: '3' }, schedule: { every: '1d' } })
    expect(await forgetWorkflow('cs', dir, 'refund-check')).toEqual({ cancelled: 1 })
    expect(readWorkflow(dir, 'refund-check')).toBeUndefined()
    expect(existsSync(join(dir, 'skills', 'refund-check', 'SKILL.md'))).toBe(true)
    expect((await listScheduledTasks({ agent: 'cs' })).map((t) => t.status)).toEqual(['cancelled'])
  })

  it("moves a workflows.yml from before into its skills, and points its named schedule at the workflow", async () => {
    writeSkill(dir, 'weekly-blog-post', '', 'Draft the post.')
    writeFileSync(join(dir, 'workflows.yml'), [
      'workflows:',
      '  - id: weekly-blog-post',
      '    name: Weekly blog post',
      '    trigger: { kind: schedule, description: Every Monday at 9 }',
      '    startMessage: Run the weekly blog post workflow.',
      '    scheduleName: Weekly blog post',
      '',
    ].join('\n'))
    const legacy = await createScheduledTask({ agent: 'blog', message: 'Run the weekly blog post workflow.', schedule: { every: '7d' }, task_name: 'Weekly blog post' })
    const unrelated = await createScheduledTask({ agent: 'blog', message: 'Something else', schedule: { every: '1d' }, task_name: 'Other' })

    const [w] = (await listAgentWorkflows('blog', dir)).filter((x) => x.id === 'weekly-blog-post')
    expect(w).toMatchObject({ title: 'Weekly blog post', startMessage: 'Run the weekly blog post workflow.', trigger: 'Every Monday at 9', steps: 'Draft the post.' })
    expect(w.schedule?.taskId).toBe(legacy.task_id)
    expect(await getScheduledTask(legacy.task_id)).toMatchObject({ workflow_id: 'weekly-blog-post', message: '' })
    expect(await getScheduledTask(unrelated.task_id)).toMatchObject({ message: 'Something else' })
    expect(existsSync(join(dir, 'workflows.yml'))).toBe(false)
    expect(existsSync(join(dir, 'workflows.migrated.yml'))).toBe(true)
  })
})

describe('tool arguments with something after the JSON', () => {
  it('uses the first complete object, and still throws on a cut-off one', async () => {
    const { parseToolArguments } = await import('#core/model-calls/openai-model-call.js')
    expect(parseToolArguments('{"a":"x}{\\"y","b":{"c":1}}{"a":2}')).toEqual({ a: 'x}{"y', b: { c: 1 } })
    expect(parseToolArguments('{"a":1} ]')).toEqual({ a: 1 })
    expect(parseToolArguments('')).toEqual({})
    expect(() => parseToolArguments('{"a":"cut')).toThrow()
  })
})

describe('a tool from a connected service', () => {
  it('is marked as a connection, not an ability to install, and is copied to an agent without it', async () => {
    const { resolveConnections } = await import('#web/workflow-admin.js')
    const plan = validateWorkflowPlan({ ...RAW_PLAN, steps: [{ title: 'Search', kind: 'tool', tool: 'firecrawl_FIRECRAWL_SEARCH', ability: 'firecrawl' }, ...RAW_PLAN.steps.slice(1)] })!
    expect(plan.abilities).toContain('firecrawl')
    const web = agent({ tools: ['firecrawl_FIRECRAWL_SEARCH'], connected: [{ source: 'firecrawl', tools: ['firecrawl_FIRECRAWL_SEARCH'] }] })
    resolveConnections(plan, [web])
    expect(plan.steps[0]).toMatchObject({ tool: 'firecrawl_FIRECRAWL_SEARCH', connection: 'firecrawl' })
    expect(plan.steps[0].ability).toBeUndefined()
    expect(plan.abilities).toEqual(['lp-blog-drafter'])
    expect(checkWorkflowForAgent(plan, agent({ name: 'other', tools: [] })).toConnect).toEqual(['firecrawl_FIRECRAWL_SEARCH'])
    expect(checkWorkflowForAgent(plan, web).toConnect).toEqual([])
  })
})

describe('the planner and webhooks', () => {
  const base = {
    name: 'Handle dispute', summary: 'Answers disputes', steps: [{ title: 'Read the dispute', kind: 'tool', tool: 'get_dispute' }],
    skill: { description: 'd', body: 'Handle dispute $dispute_id.' }, startMessage: 'Handle dispute $dispute_id.', rules: [], target: { kind: 'new', reason: '' },
    newAgent: { name: 'disputes', systemPrompt: 'You handle disputes.' }, parameters: { dispute_id: { description: 'The dispute', required: true } },
  }

  it('plans a webhook start with its sender, events and the parameters it fills', () => {
    const plan = validateWorkflowPlan({
      ...base,
      trigger: { kind: 'webhook', description: 'When a Stripe dispute comes in' },
      webhook: { sender: 'stripe', name: 'Stripe: new disputes', filter: { path: 'type', values: ['charge.dispute.created'] }, mapping: { dispute_id: 'data.object.id', nope: 'x' }, setup: 'Listen for charge.dispute.created.' },
    })!
    expect(plan.trigger.kind).toBe('webhook')
    expect(plan.webhook).toEqual({ sender: 'stripe', name: 'Stripe: new disputes', filter: { path: 'type', values: ['charge.dispute.created'] }, mapping: { dispute_id: 'data.object.id' }, setup: 'Listen for charge.dispute.created.' })
    // A webhook start keeps its required parameters required.
    expect(plan.parameters.dispute_id!.required).toBe(true)
    expect(plan.gaps).toEqual([])
  })

  it('says when nothing in the payload fills a required parameter', () => {
    const plan = validateWorkflowPlan({ ...base, trigger: { kind: 'webhook', description: 'x' }, webhook: { sender: 'github', name: 'Issues' } })!
    expect(plan.gaps.join(' ')).toContain("Nothing in the webhook's payload fills dispute_id")
  })

  it('treats a described webhook as the start, and a webhook start with none as started by hand', () => {
    expect(validateWorkflowPlan({ ...base, trigger: { kind: 'on_request', description: 'x' }, webhook: { sender: 'shopify', name: 'Orders paid', mapping: { dispute_id: 'id' } } })!.trigger.kind).toBe('webhook')
    const none = validateWorkflowPlan({ ...base, trigger: { kind: 'webhook', description: 'x' }, webhook: { sender: 'carrier-pigeon' } })!
    expect(none.trigger.kind).toBe('on_request')
    expect(none).not.toHaveProperty('webhook')
  })

  it('keeps a webhook next to a schedule, and a custom sender\'s header', () => {
    const plan = validateWorkflowPlan({ ...base, trigger: { kind: 'schedule', description: 'daily', every: '24h' }, webhook: { sender: 'custom', name: 'Our app', header: 'X-EM-Signature', mapping: { dispute_id: 'id' } } })!
    expect(plan.trigger.kind).toBe('schedule')
    expect(plan.webhook).toMatchObject({ sender: 'custom', header: 'X-EM-Signature' })
    expect(validateWorkflowPlan({ ...base, trigger: { kind: 'webhook', description: 'x' }, webhook: { sender: 'custom', name: 'a', header: 'bad header!' } })!.webhook).not.toHaveProperty('header')
  })
})
