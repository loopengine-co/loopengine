import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ModelCall, ModelResponse } from '#core/run-agent.js'
import { planWorkflowWithModel, validateWorkflowPlan, workflowTemplate, type WorkflowPlannerTools } from '#core/system-agents/workflow-planner.js'
import { readWorkflows, removeWorkflow, saveWorkflow } from '#core/workflows.js'
import { checkWorkflowForAgent, planWorkflow, type WorkflowAgentInfo } from '#web/workflow-admin.js'

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
    expect(t.setup.schedule).toEqual({ every: '7d', at: '09:00', weekday: 1, name: 'Weekly blog post', message: 'Run the weekly blog post workflow.' })
    expect(t.candidate.agent.name).toBe('blog-writer')
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

describe("an agent's workflows.yml", () => {
  let dir: string
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'le-workflows-')) })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('records, replaces by id, and forgets workflows', () => {
    const plan = validateWorkflowPlan(RAW_PLAN)!
    const record = { id: plan.id, name: plan.name, summary: plan.summary, trigger: { kind: plan.trigger.kind, description: plan.trigger.description }, steps: plan.steps, startMessage: plan.startMessage, scheduleName: plan.name, createdAt: '2026-10-31T00:00:00Z' }
    saveWorkflow(dir, record)
    saveWorkflow(dir, { ...record, summary: 'Updated' })
    expect(readWorkflows(dir)).toHaveLength(1)
    expect(readWorkflows(dir)[0]).toMatchObject({ id: 'weekly-blog-post', summary: 'Updated', steps: plan.steps })
    removeWorkflow(dir, 'weekly-blog-post')
    expect(readWorkflows(dir)).toEqual([])
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
