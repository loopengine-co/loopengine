import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FileSchedulerStore, listScheduledTasks, setSchedulerStore } from '#core/scheduler.js'
import { WORKFLOW_EXAMPLES, workflowExample } from '#core/system-agents/workflow-examples.js'
import { WORKFLOW_EXAMPLE_MESSAGES } from '#core/system-agents/workflow-example-messages.js'
import { WORKFLOW_PLANNER_PROMPT, validateWorkflowPlan, workflowTemplate, type WorkflowPlan } from '#core/system-agents/workflow-planner.js'
import { readWorkflow, writeSkillFile } from '#core/workflows.js'

// Agents live in a scratch folder; the steps that touch the rest of the
// project are recorded instead.
const scratch = vi.hoisted(() => ({ root: '', steps: [] as string[] }))
vi.mock('#web/actauth-admin.js', () => {
  class ActauthRuleExistsError extends Error {}
  return {
    ActauthRuleExistsError,
    setDefaultDecision: vi.fn(),
    addActauthRule: vi.fn(),
    applyPlannedRules: vi.fn((_name: string, rules: { tool: string }[]) => ({ added: rules.map((r) => r.tool), unchanged: [], kept: [] })),
  }
})
vi.mock('#web/env-admin.js', () => ({ setAgentEnvVar: vi.fn(async (name: string, variable: string, value: string) => void scratch.steps.push(`env ${name} ${variable}=${value}`)) }))
vi.mock('#web/skills-admin.js', () => ({
  writeSkill: vi.fn((name: string, id: string, content: { description: string; body: string }) => {
    scratch.steps.push(`skill ${name} ${id}`)
    const dir = join(scratch.root, name, 'skills', id)
    mkdirSync(dir, { recursive: true })
    writeSkillFile(join(dir, 'SKILL.md'), { name: id, description: content.description }, content.body)
  }),
}))

const { createWorkflow } = await import('#web/workflow-admin.js')
type Deps = Parameters<typeof createWorkflow>[1]

beforeEach(() => {
  scratch.root = mkdtempSync(join(tmpdir(), 'workflow-examples-'))
  scratch.steps.length = 0
  setSchedulerStore(new FileSchedulerStore(join(scratch.root, '.scheduler')))
})
afterEach(() => rmSync(scratch.root, { recursive: true, force: true }))

function deps(over: Partial<Deps> = {}, env: Record<string, string> = {}): Deps {
  return {
    appStatus: async () => ({ state: 'ready' }),
    reloadAgent: async () => {},
    installAbility: async (name, spec) => void scratch.steps.push(`install ${name} ${spec}`),
    envValue: (_name, variable) => env[variable],
    messagingConfigured: () => false,
    agentDir: (name) => join(scratch.root, name),
    agentInfo: async () => [],
    ...over,
  }
}

describe('workflow examples', () => {
  it('are complete plans the console can create as they are', () => {
    expect(new Set(WORKFLOW_EXAMPLES.map((e) => e.id)).size).toBe(WORKFLOW_EXAMPLES.length)
    expect(new Set(WORKFLOW_EXAMPLES.map((e) => e.plan.newAgent.name)).size).toBe(WORKFLOW_EXAMPLES.length)
    for (const { id, plan } of WORKFLOW_EXAMPLES) {
      expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
      expect(plan.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
      // Accepted as a plan, as one the planner made would be.
      expect(validateWorkflowPlan(plan), id).toBeDefined()
      // Official abilities only: anything else can't be installed.
      for (const spec of plan.abilities) expect(spec).toMatch(/^@loopengine-co\//)
      if (plan.trigger.kind === 'schedule') expect(plan.trigger.every, id).toBeTruthy()
      // The steps name every tool they're allowed to use (a "never" rule
      // needn't be mentioned), and every input they're given.
      for (const rule of plan.rules.filter((r) => r.decision !== 'deny')) expect(plan.skill.body, `${id}: ${rule.tool}`).toContain(rule.tool)
      for (const name of Object.keys(plan.parameters)) expect(plan.skill.body).toContain(`$${name}`)
      // A skill it comes with is named where the agent would look for it.
      for (const skill of plan.skills ?? []) expect(`${plan.newAgent.systemPrompt}\n${plan.skill.body}`).toContain(skill.id)
      // The agent's instructions are its role, not the steps.
      expect(plan.newAgent.systemPrompt).not.toMatch(/^1\. /m)
    }
  })

  it('have a card each, as do the examples that are only messages', () => {
    const all = [...WORKFLOW_EXAMPLES, ...WORKFLOW_EXAMPLE_MESSAGES]
    // One list on the page: ids never clash.
    expect(new Set(all.map((e) => e.id)).size).toBe(all.length)
    expect(WORKFLOW_EXAMPLE_MESSAGES.length).toBeGreaterThanOrEqual(100)
    for (const e of all) {
      expect(e.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
      expect(e.category, e.id).toBeTruthy()
      expect(e.message.length, e.id).toBeGreaterThan(40)
      expect(Array.isArray(e.apps) && Array.isArray(e.asksFirst), e.id).toBe(true)
    }
    // Several areas, as the page's filter shows them.
    expect(new Set(all.map((e) => e.category)).size).toBeGreaterThanOrEqual(15)
  })

  it('split a plan the way the planner is told to', () => {
    // The planner writes a brief, not a script: the job, its rules, and
    // the policies and special cases it was told (none made up, no
    // placeholders), all in the skill (context stays empty).
    expect(WORKFLOW_PLANNER_PROMPT).toMatch(/written as a brief to a capable colleague, not a script/)
    expect(WORKFLOW_PLANNER_PROMPT).toMatch(/"Rules:" lines/)
    expect(WORKFLOW_PLANNER_PROMPT).toMatch(/Numbered steps only where the order truly matters/)
    expect(WORKFLOW_PLANNER_PROMPT).toMatch(/context: leave it empty/)
    expect(WORKFLOW_PLANNER_PROMPT).toMatch(/Never make one up, and write no placeholders/)
    // An approval is the tool call itself, never a question in the reply.
    expect(WORKFLOW_PLANNER_PROMPT).toMatch(/So an approval is the call itself/)
    expect(WORKFLOW_PLANNER_PROMPT).toMatch(/asked with system_ask_user, and the work carries on after the answer/)
  })

  it('becomes a template with its skills, settings and notes', () => {
    const plan = { ...workflowExample('expense-approvals')!.plan, env: { EXPENSE_APPROVER_EMAIL: 'boss@example.com' } }
    const template = workflowTemplate(plan)
    expect(template.setup.skills!.map((s) => s.id)).toEqual(['check-expense-claims', 'expense-policy'])
    expect(template.setup.env).toEqual({ EXPENSE_APPROVER_EMAIL: 'boss@example.com' })
    expect(template.setup.notes).toEqual(plan.notes)
  })

  it('creates it in the agent: the workflow, the skills it comes with, and a paused schedule that runs the workflow', async () => {
    const plan = structuredClone(workflowExample('customer-email-replies')!.plan) as WorkflowPlan
    const agent = { name: 'support', tools: [], abilities: [], rules: [], defaultDecision: 'ask' as const, messaging: 'slack' }
    const created = await createWorkflow({ plan, agent: 'support' }, deps({ agentInfo: async () => [agent] }))
    expect(created).toMatchObject({ agent: 'support', workflow: 'Answer customer emails' })
    expect(scratch.steps).toEqual(expect.arrayContaining(['install support @loopengine-co/gmail', 'skill support support-policies']))
    expect(readWorkflow(join(scratch.root, 'support'), 'answer-customer-emails')).toMatchObject({ title: 'Answer customer emails' })
    const [task] = await listScheduledTasks({ agent: 'support' })
    expect([task.status, task.workflow_id]).toEqual(['paused', 'answer-customer-emails'])
  })

  it("isn't created until its apps are connected and the agent has messaging", async () => {
    const plan = structuredClone(workflowExample('inbox-to-tasks')!.plan) as WorkflowPlan
    const agent = { name: 'ops', tools: [], abilities: [], rules: [], defaultDecision: 'ask' as const, messaging: null }
    await expect(createWorkflow({ plan, agent: 'ops' }, deps({ agentInfo: async () => [agent], appStatus: async () => ({ state: 'missing', title: 'GitHub' }) })))
      .rejects.toThrow(/Before creating it: Connect GitHub on the Apps page; it's added to ops when you create it, with search_issues, issue_write and add_issue_comment; Set up ops's Messaging/)
    expect(scratch.steps).toEqual([])
    expect(readWorkflow(join(scratch.root, 'ops'), 'inbox-to-tasks')).toBeUndefined()
    await expect(createWorkflow({ plan }, deps({ agentInfo: async () => [agent] }))).rejects.toThrow(/Choose the agent/)
  })

  it('adds a connected app to the agent with just the tools its steps use', async () => {
    const plan = structuredClone(workflowExample('inbox-to-tasks')!.plan) as WorkflowPlan
    const agent = { name: 'ops', tools: [], abilities: [], rules: [], defaultDecision: 'ask' as const, messaging: 'slack' }
    const added: string[] = []
    await createWorkflow({ plan, agent: 'ops' }, deps({
      agentInfo: async () => [agent],
      appStatus: async () => ({ state: 'connected', title: 'GitHub' }),
      prepareApp: async () => 'file:/ws/abilities/mcp-github',
      installAbility: async (name, spec, options) => void added.push(`${name} ${spec} ${(options?.mcpTools ?? ['(defaults)']).join(',')}`),
    }))
    // Its Gmail ability is installed as usual; the app gets only its steps' tools.
    expect(added.filter((a) => a.includes('mcp-github'))).toEqual(['ops file:/ws/abilities/mcp-github search_issues,issue_write,add_issue_comment'])
  })

  it("turns on just the missing tools when the agent has the app", async () => {
    const plan = structuredClone(workflowExample('inbox-to-tasks')!.plan) as WorkflowPlan
    const github = { id: 'io.github.github/github-mcp-server', title: 'GitHub', url: 'https://api.githubcopilot.com/mcp/', tools: ['search_issues'], all: ['search_issues', 'issue_write', 'add_issue_comment'].map((name) => ({ name, remote: name })) }
    const agent = { name: 'ops', tools: ['search_issues'], abilities: [], rules: [], defaultDecision: 'ask' as const, messaging: 'slack', apps: [github] }
    const added: string[] = []
    await createWorkflow({ plan, agent: 'ops' }, deps({
      agentInfo: async () => [agent],
      prepareApp: async () => 'file:/ws/abilities/mcp-github',
      addAppTools: async (name, spec, tools) => void added.push(`${name} ${spec} ${tools.join(',')}`),
    }))
    expect(added).toEqual(['ops file:/ws/abilities/mcp-github issue_write,add_issue_comment'])
  })

  it('adds to an agent you have without replacing its own skills or settings', async () => {
    const own = join(scratch.root, 'support', 'skills', 'return-policy')
    mkdirSync(own, { recursive: true })
    writeSkillFile(join(own, 'SKILL.md'), { name: 'return-policy', description: 'Ours' }, 'Our real policy.')
    const plan = { ...structuredClone(workflowExample('refund-approvals')!.plan), env: { REFUND_LIMIT: '100', REFUND_CURRENCY: 'EUR' } } as WorkflowPlan
    const agent = { name: 'support', tools: [], abilities: [], rules: [], defaultDecision: 'ask' as const, messaging: 'slack' }
    const created = await createWorkflow({ plan, agent: 'support' }, deps({ agentInfo: async () => [agent] }, { REFUND_LIMIT: '250' }))
    expect(created).toMatchObject({ agent: 'support' })
    expect(readFileSync(join(own, 'SKILL.md'), 'utf8')).toContain('Our real policy.')
    expect(scratch.steps).not.toContain('skill support return-policy')
    expect(scratch.steps).toContain('env support REFUND_CURRENCY=EUR')
    expect(scratch.steps.some((s) => s.startsWith('env support REFUND_LIMIT'))).toBe(false)
    expect(readWorkflow(join(scratch.root, 'support'), 'refund-approvals')).toMatchObject({ title: 'Refund approvals' })
  })

  it("carries its rules and facts into the workflow's own instructions on an agent you have", async () => {
    const plan = structuredClone(workflowExample('inbox-to-tasks')!.plan) as WorkflowPlan
    const context = 'Tasks live in this GitHub repository: acme/ops.\n\nRules:\n- Never promise a fix.'
    const agent = { name: 'ops', tools: [], abilities: [], rules: [], defaultDecision: 'ask' as const, messaging: 'slack' }
    const created = await createWorkflow({ plan, agent: 'ops', workflowContext: context }, deps({ agentInfo: async () => [agent] }))
    const instructions = readWorkflow(join(scratch.root, 'ops'), 'inbox-to-tasks')!.instructions
    // The start line, then the rules and facts, then the steps.
    expect(instructions.startsWith(`${plan.startMessage}\n\nRules and facts for this workflow:\n${context}\n\n1. `)).toBe(true)
    expect(created.checklist.map((c) => c.label)).toContain(`Edit "Who handles what" and the repository in the workflow's instructions (its Edit, on the Workflows tab)`)
  })
})

describe('app tools that need an account', () => {
  const stripeTools = [
    { remote: 'stripe_api_execute', description: 'Calls a Stripe API operation', readOnly: false, required: ['stripe_context', 'operation'] },
    { remote: 'stripe_api_details', description: 'Describes an operation', readOnly: true, required: ['operation'] },
    { remote: 'stripe_list_available_accounts_or_orgs', description: 'Lists the accounts you can use', readOnly: true, required: [] },
    { remote: 'stripe_delete_account_link', description: 'Removes an account link', readOnly: false, required: [] },
  ]

  it('come with the read-only tool that lists the accounts', async () => {
    const { contextToolsFor } = await import('#core/mcp-apps.js')
    expect(contextToolsFor(['stripe_api_execute'], stripeTools)).toEqual(['stripe_list_available_accounts_or_orgs'])
    // Nothing needs an account: nothing added; already chosen: not again.
    expect(contextToolsFor(['stripe_api_details'], stripeTools)).toEqual([])
    expect(contextToolsFor(['stripe_api_execute', 'stripe_list_available_accounts_or_orgs'], stripeTools)).toEqual([])
    // Unmarked counts; one marked as changing things never does.
    expect(contextToolsFor(['stripe_api_execute'], stripeTools.map((t) => ({ ...t, readOnly: undefined })))).toEqual(['stripe_list_available_accounts_or_orgs'])
    expect(contextToolsFor(['stripe_api_execute'], stripeTools.map((t) => ({ ...t, readOnly: false })))).toEqual([])
    expect(contextToolsFor(['create_page'], [
      { remote: 'create_page', description: '', required: ['workspace_id', 'title'] },
      { remote: 'list_workspaces', description: '', readOnly: true, required: [] },
      { remote: 'list_pages', description: '', readOnly: true, required: [] },
    ])).toEqual(['list_workspaces'])
  })

  it('are turned on with it when the workflow is created', async () => {
    const plan = structuredClone(workflowExample('customer-email-replies')!.plan) as WorkflowPlan
    plan.apps = [{ id: 'stripe', title: 'Stripe', tools: ['stripe_api_execute'] }]
    const added: string[][] = []
    const agent = {
      name: 'support', tools: [], abilities: [], rules: [], defaultDecision: 'ask' as const, messaging: 'slack',
      apps: [{ id: 'stripe', title: 'Stripe', url: 'https://mcp.stripe.com', tools: [], all: stripeTools.map((t) => ({ name: `stripe_${t.remote}`, remote: t.remote })) }],
    }
    await createWorkflow({ plan, agent: 'support' }, deps({
      agentInfo: async () => [agent],
      prepareApp: async () => 'file:/apps/stripe',
      addAppTools: async (_agent, _spec, tools) => void added.push(tools),
      appToolInputs: async () => stripeTools,
    }))
    expect(added).toEqual([['stripe_api_execute', 'stripe_list_available_accounts_or_orgs']])
  })

  it('tells the planner to plan that tool', () => {
    expect(WORKFLOW_PLANNER_PROMPT).toMatch(/also plan the app's read-only tool that lists them/)
    expect(WORKFLOW_PLANNER_PROMPT).toMatch(/call mcp_server_tools with its id: it says what each tool does and the inputs it needs/)
  })
})
