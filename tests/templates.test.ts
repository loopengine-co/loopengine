import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FileSchedulerStore, listScheduledTasks, setSchedulerStore } from '#core/scheduler.js'
import { validateCandidate } from '#core/system-agents/interviewer.js'
import { STARTER_TEMPLATES, templateScheduleStart } from '#core/system-agents/templates.js'
import { WORKFLOW_EXAMPLES } from '#core/system-agents/workflow-examples.js'

// Every step is recorded in one list, so the tests can check the order.
const steps: string[] = []
vi.mock('#web/actauth-admin.js', () => {
  class ActauthRuleExistsError extends Error {}
  return {
    ActauthRuleExistsError,
    setDefaultDecision: vi.fn((name: string, decision: string) => void steps.push(`default ${name} ${decision}`)),
    addActauthRule: vi.fn((name: string, rule: { tool: string; decision: string; scope: string }) => void steps.push(`rule ${rule.tool} ${rule.decision} ${rule.scope}`)),
    applyPlannedRules: vi.fn((name: string, rules: { tool: string; decision: string }[]) => {
      for (const rule of rules) steps.push(`rule ${rule.tool} ${rule.decision} */*`)
      return { added: rules.map((r) => r.tool), unchanged: [], kept: [] }
    }),
  }
})
vi.mock('#web/env-admin.js', () => ({ setAgentEnvVar: vi.fn(async (name: string, variable: string, value: string) => void steps.push(`env ${variable}=${value}`)) }))
vi.mock('#web/skills-admin.js', () => ({ writeSkill: vi.fn((name: string, id: string) => void steps.push(`skill ${id}`)) }))
vi.mock('#core/workflows.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('#core/workflows.js')>()),
  setWorkflowFields: vi.fn((agentDir: string, id: string, fields: { title?: string; parameters?: Record<string, unknown> }) => void steps.push(`workflow ${id} "${fields.title}" (${Object.keys(fields.parameters ?? {}).join(',')})`)),
}))

const admin = await import('#web/templates-admin.js')
const { validateWorkflowPlan, workflowTemplate } = await import('#core/system-agents/workflow-planner.js')
type Deps = Parameters<typeof admin.createFromTemplate>[1]

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'templates-'))
  setSchedulerStore(new FileSchedulerStore(join(dir, '.scheduler')))
  steps.length = 0
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

function deps(over: Partial<Deps> = {}, env: Record<string, string> = {}): Deps {
  return {
    agentExists: () => false,
    scaffoldAgent: async (name, prompt) => void steps.push(`scaffold ${name} ${prompt.split('\n')[0]}`),
    registerAgent: async (name) => void steps.push(`register ${name}`),
    installAbility: async (name, spec, options) => void steps.push(`install ${spec}${options?.mcpTools ? ` [${options.mcpTools.join(',')}]` : ''}`),
    envValue: (_name, variable) => env[variable],
    messagingConfigured: () => false,
    ...over,
  }
}

describe('templates', () => {
  it('are the workflow examples, each as the new agent it creates', () => {
    expect(STARTER_TEMPLATES.map((t) => t.id)).toEqual(WORKFLOW_EXAMPLES.map((e) => e.id))
    for (const t of STARTER_TEMPLATES) {
      const example = WORKFLOW_EXAMPLES.find((e) => e.id === t.id)!
      expect(t.category).toBe(example.category)
      expect(t.candidate.agent.systemPrompt).toBe(example.plan.newAgent.systemPrompt)
      // Its own skill is the workflow its schedule runs.
      expect(t.setup.skills![0]).toMatchObject({ id: example.plan.id, workflow: { title: example.plan.name } })
      if (t.setup.schedule) expect(t.setup.schedule.workflowId).toBe(example.plan.id)
    }
  })

  it('lists what each card shows', () => {
    const list = admin.listTemplates()
    expect(list.map((t) => t.id)).toEqual(STARTER_TEMPLATES.map((t) => t.id))
    expect(list.find((t) => t.id === 'customer-email-replies')).toMatchObject({
      category: 'Customer service',
      abilities: ['@loopengine-co/gmail', '@loopengine-co/shopify'],
      schedule: 'every 10 minutes',
      trigger: 'every 10 minutes',
    })
    expect(list.find((t) => t.id === 'weekly-research-digest')?.schedule).toBe('Mondays at 09:00')
    expect(list.find((t) => t.id === 'incident-triage')?.schedule).toBeNull()
    expect(list.find((t) => t.id === 'lead-follow-up')).toMatchObject({ abilities: ['@loopengine-co/hubspot', '@loopengine-co/gmail'], apps: ['Firecrawl'] })
  })

  it('previews the whole setup under the first free name, marking keys already set', () => {
    const preview = admin.previewTemplate('weekly-research-digest', { agentExists: (n) => n === 'weekly-research-digest' })
    expect(preview.name).toBe('weekly-research-digest-2')
    expect(preview.abilities).toEqual([])
    expect(preview.apps).toEqual(['Firecrawl'])
    expect(preview.rules).toEqual([{ tool: 'firecrawl_search', decision: 'allow' }, { tool: 'firecrawl_scrape', decision: 'allow' }])
    expect(preview.keys).toEqual([])
    expect(preview.schedule).toBe('Mondays at 09:00 (created paused); it messages you the result when it finishes, through its Messaging tab: Slack, email, Lark or a webhook')
    expect(preview.needsApprovals).toBe(false)

    const lead = admin.previewTemplate('lead-follow-up', { agentExists: () => false, envValue: (_n, v) => (v === 'HUBSPOT_ACCESS_TOKEN' ? 'set' : undefined) })
    expect(lead.keys[0]).toEqual({ names: ['HUBSPOT_ACCESS_TOKEN'], set: true })
    expect(admin.previewTemplate('customer-email-replies', { agentExists: () => false }).skills).toEqual(['answer-customer-emails', 'support-policies'])
  })

  it('creates the agent with its whole setup: abilities, then the rules they leave to set, loaded last, schedule paused', async () => {
    const created = await admin.createFromTemplate('customer-email-replies', deps())
    expect(steps).toEqual([
      'scaffold customer-email-replies You answer customer emails for our business, from our support inbox.',
      'default customer-email-replies ask',
      'install @loopengine-co/gmail',
      'install @loopengine-co/shopify',
      'rule gmail_search allow */*',
      'rule gmail_get_thread allow */*',
      'rule gmail_create_draft allow */*',
      'rule gmail_modify_labels allow */*',
      'rule gmail_send ask */*',
      'rule shopify_create_refund deny */*',
      'skill answer-customer-emails',
      'workflow answer-customer-emails "Answer customer emails" ()',
      'skill support-policies',
      'register customer-email-replies',
    ])
    expect(created.abilities).toEqual({ installed: ['@loopengine-co/gmail', '@loopengine-co/shopify'], failed: [] })
    const tasks = await listScheduledTasks({ agent: 'customer-email-replies' })
    expect(tasks.map((t) => [t.status, t.task_name, t.workflow_id, (t.schedule as { every: string }).every])).toEqual([
      ['paused', 'Answer customer emails', 'answer-customer-emails', '10m'],
    ])
    expect(created.schedule).toEqual({ description: 'every 10 minutes', timeZone: expect.any(String) })
    const tab = (t: string) => `/agents/config?agent=customer-email-replies&tab=${t}`
    expect(created.checklist).toEqual([
      { label: 'Add its keys: GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN, SHOPIFY_STORE_DOMAIN, SHOPIFY_ADMIN_TOKEN', href: tab('env') },
      { label: 'Choose where approval requests go: Slack, email, Lark or a webhook', href: tab('messaging') },
      { label: 'Write your policies into its support-policies skill (Advanced → Skills): the agent answers from it and nothing else' },
      { label: 'Turn on its schedule (every 10 minutes) once it works in Chat', href: tab('schedules') },
    ])
    expect(created.exampleMessage).toBe('Handle new customer emails in the support inbox.')
  })

  it('leaves out what is already done: keys set, approvals connected', async () => {
    const created = await admin.createFromTemplate('incident-triage', deps({ messagingConfigured: () => true }))
    expect(created.checklist.map((c) => c.label)).toEqual([
      'Connect GitHub on the Apps page, then add it to incident-triage from its Apps tab',
      expect.stringMatching(/^Send it alerts: add a webhook to this workflow/),
    ])
    expect(created.schedule).toBeUndefined()
  })

  it('makes a template\'s workflow skill a workflow, and asks where its results go', async () => {
    const created = await admin.createFromTemplate('incident-triage', deps())
    expect(steps).toContain('skill triage-incident')
    expect(steps).toContain('workflow triage-incident "Triage an incident" (alert)')
    expect(steps.indexOf('workflow triage-incident "Triage an incident" (alert)')).toBeLessThan(steps.indexOf('register incident-triage'))
    expect(created.checklist).toContainEqual({ label: 'Choose where approval requests go: Slack, email, Lark or a webhook', href: '/agents/config?agent=incident-triage&tab=messaging' })
  })

  it('sends a digest\'s each result through messaging, and asks where they go', async () => {
    const created = await admin.createFromTemplate('weekly-research-digest', deps())
    const [task] = await listScheduledTasks({ agent: 'weekly-research-digest' })
    expect(task.notify).toBe(true)
    expect(created.checklist).toContainEqual({ label: 'Choose where its results go: Slack, email, Lark or a webhook', href: '/agents/config?agent=weekly-research-digest&tab=messaging' })
    const connected = await admin.createFromTemplate('weekly-research-digest', deps({ agentExists: (n) => n === 'weekly-research-digest', messagingConfigured: () => true }))
    expect(connected.checklist.map((c) => c.label).some((l) => l.startsWith('Choose where'))).toBe(false)
  })

  it('keeps going when an ability fails to install, and says so first', async () => {
    const created = await admin.createFromTemplate('lead-follow-up', deps({
      installAbility: async (_name, spec) => {
        if (spec === '@loopengine-co/hubspot') throw new Error('npm pack failed: 404 Not Found')
        steps.push(`install ${spec}`)
      },
    }))
    expect(created.abilities).toEqual({ installed: ['@loopengine-co/gmail'], failed: [{ name: '@loopengine-co/hubspot', error: "it isn't published on npm yet" }] })
    expect(created.checklist[0]).toEqual({ label: 'Connect Firecrawl on the Apps page, then add it to lead-follow-up from its Apps tab', href: '/config?section=apps' })
    expect(created.checklist[1]).toEqual({ label: "Install the @loopengine-co/hubspot ability (it couldn't be installed: it isn't published on npm yet)", href: '/agents/config?agent=lead-follow-up&tab=abilities' })
    expect(steps.at(-1)).toBe('register lead-follow-up')
  })

  it('turns npm\'s install output into one plain line', () => {
    const npm404 = new Error('Command failed: npm pack lp-gmail --pack-destination /tmp/x\nnpm error code E404\nnpm error 404 Not Found - GET https://registry.npmjs.org/lp-gmail - Not found')
    expect(admin.installFailureReason(npm404)).toBe("it isn't published on npm yet")
    expect(admin.installFailureReason(new Error('Command failed: npm pack x\nnpm error code EAI_AGAIN'))).toBe('npm could not be reached; try again from the Apps tab')
    expect(admin.installFailureReason(new Error('Command failed: npm pack x\nlp-x needs loopengine ^0.2.0'))).toBe('lp-x needs loopengine ^0.2.0')
  })

  it('creates the agent without installing anything where installs need the admin login', async () => {
    const { installAbility: _skip, ...noInstall } = deps()
    const created = await admin.createFromTemplate('lead-follow-up', { ...noInstall, prepareApp: async () => 'file:/ws/mcp-firecrawl' })
    expect(created.abilities.installed).toEqual([])
    expect(created.abilities.failed.map((f) => f.error)).toEqual([
      'installing abilities needs LOOPENGINE_ADMIN_AUTH set on the server',
      'installing abilities needs LOOPENGINE_ADMIN_AUTH set on the server',
      'adding apps needs LOOPENGINE_ADMIN_AUTH set on the server',
    ])
    expect(steps.some((s) => s.startsWith('install'))).toBe(false)
    expect(steps).toContain('register lead-follow-up')
  })

  it('adds a connected app with the tools the template relies on, and asks to connect one that isn\'t', async () => {
    const prepared: string[] = []
    const connected = await admin.createFromTemplate('incident-triage', deps({
      prepareApp: async (id) => {
        prepared.push(id)
        return 'file:/ws/mcp-github'
      },
    }))
    expect(prepared).toEqual(['io.github.github/github-mcp-server'])
    expect(steps).toContain('install file:/ws/mcp-github [list_commits,list_pull_requests,actions_list,search_issues,issue_read,issue_write,add_issue_comment]')
    expect(connected.abilities.installed).toEqual(['GitHub'])
    expect(connected.checklist.map((c) => c.label)).not.toContain('Connect GitHub on the Apps page, then add it to incident-triage from its Apps tab')

    const notConnected = await admin.createFromTemplate('incident-triage', deps({ agentExists: (n) => n === 'incident-triage', prepareApp: async () => undefined }))
    expect(notConnected.checklist[0]).toEqual({ label: 'Connect GitHub on the Apps page, then add it to incident-triage-2 from its Apps tab', href: '/config?section=apps' })
  })

  it('still returns the agent, with the reason, when it can\'t be loaded', async () => {
    const created = await admin.createFromTemplate('incident-triage', deps({ registerAgent: async () => { throw new Error('index.ts: Unexpected token') } }))
    expect(created.loadError).toBe('index.ts: Unexpected token')
  })

  it('puts a weekly schedule on its weekday and time, paused', async () => {
    const created = await admin.createFromTemplate('weekly-research-digest', deps())
    const [task] = await listScheduledTasks({ agent: 'weekly-research-digest' })
    expect(task.status).toBe('paused')
    expect((task.schedule as { every: string }).every).toBe('7d')
    const first = new Date(created.schedule!.next_run_at!)
    expect([first.getDay(), first.getHours(), first.getMinutes()]).toEqual([1, 9, 0])
    expect(first.getTime()).toBeGreaterThan(Date.now())
    expect(created.schedule!.description).toBe('Mondays at 09:00')
  })

  it('works out the next start at a time of day and weekday, in the server\'s time zone', () => {
    // Wednesday 28 Oct 2026, 15:30 local.
    const now = new Date(2026, 9, 28, 15, 30).getTime()
    const monday = new Date(templateScheduleStart({ every: '7d', at: '09:00', weekday: 1, name: 'x', message: 'x' }, now)!)
    expect([monday.getFullYear(), monday.getMonth(), monday.getDate(), monday.getHours()]).toEqual([2026, 10, 2, 9])
    const daily = new Date(templateScheduleStart({ every: '1d', at: '09:00', name: 'x', message: 'x' }, now)!)
    expect([daily.getDate(), daily.getHours()]).toEqual([29, 9])
    // Earlier the same day: today.
    const morning = new Date(templateScheduleStart({ every: '1d', at: '16:00', name: 'x', message: 'x' }, now)!)
    expect([morning.getDate(), morning.getHours()]).toEqual([28, 16])
    expect(templateScheduleStart({ every: '10m', name: 'x', message: 'x' }, now)).toBeUndefined()
  })

  it("takes a working agent's model without building a model call, so a missing key can't block it", async () => {
    const { pickAgentModel } = await import('#web/interview-admin.js')
    const createModelCall = vi.fn(() => {
      throw new Error('no apiKey given')
    })
    const agents = [{ name: 'example', config: { model: { provider: 'deepseek', model: 'deepseek-chat' } }, createModelCall }] as never
    expect(pickAgentModel(agents)).toEqual({ provider: 'deepseek', model: 'deepseek-chat' })
    expect(pickAgentModel([])).toBeUndefined()
    expect(createModelCall).not.toHaveBeenCalled()
  })

  it('refuses an unknown template', async () => {
    expect(() => admin.previewTemplate('nope', { agentExists: () => false, envValue: () => undefined })).toThrow(admin.TemplateError)
    await expect(admin.createFromTemplate('nope', deps())).rejects.toThrow(/No such template/)
  })
})

describe('an older project adapter', () => {
  it('still creates the agent (rules and paused schedule included) and says how to get abilities installed', async () => {
    const created = await admin.createFromTemplate('refund-approvals', {
      agentExists: () => false,
      createAgent: async (name: string) => void steps.push(`create ${name}`),
    })
    expect(steps[0]).toBe('create refund-approvals')
    expect(steps).toContain('rule shopify_create_refund ask */*')
    expect(created.abilities.installed).toEqual([])
    expect(created.checklist[0].label).toMatch(/^Install the @loopengine-co\/gmail ability .*update it from Settings → Upgrade/)
    expect((await listScheduledTasks({ agent: 'refund-approvals' }))[0].status).toBe('paused')
    // Its preview call passes no envValue either.
    expect(admin.previewTemplate('refund-approvals', { agentExists: () => false }).keys.every((k) => !k.set)).toBe(true)
  })
})

describe("a workflow's template", () => {
  it('gives its new agent a schedule that runs the workflow, sending each result when the plan says so', async () => {
    const plan = validateWorkflowPlan({
      name: 'Pricing watch', id: 'pricing-watch', summary: 'Checks competitors\' pricing pages and reports changes.',
      trigger: { kind: 'schedule', description: 'Every weekday at 9', every: '1d', at: '09:00' },
      steps: [{ title: 'Read the pages', kind: 'other' }], rules: [], abilities: [], keys: [],
      skill: { description: 'Pricing watch', body: '1. Read the pages.\n2. Report what changed.' },
      startMessage: 'Check the pricing pages.', notify: { on: true, reason: 'Nothing else sends the changes to you.' },
      target: { kind: 'new', reason: 'New job.' }, newAgent: { name: 'pricing-agent', systemPrompt: 'You watch prices.' }, gaps: [],
    })!
    await admin.createFromTemplateObject(workflowTemplate(plan), deps())

    const [task] = await listScheduledTasks({ agent: 'pricing-agent' })
    expect(task).toMatchObject({ workflow_id: 'pricing-watch', message: '', notify: true, status: 'paused' })
  })
})
