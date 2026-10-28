import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FileSchedulerStore, listScheduledTasks, setSchedulerStore } from '#core/scheduler.js'
import { validateCandidate } from '#core/system-agents/interviewer.js'
import { STARTER_TEMPLATES, templateScheduleStart } from '#core/system-agents/templates.js'

// Every step is recorded in one list, so the tests can check the order.
const steps: string[] = []
vi.mock('#web/actauth-admin.js', () => {
  class ActauthRuleExistsError extends Error {}
  return {
    ActauthRuleExistsError,
    setDefaultDecision: vi.fn((name: string, decision: string) => void steps.push(`default ${name} ${decision}`)),
    addActauthRule: vi.fn((name: string, rule: { tool: string; decision: string; scope: string }) => void steps.push(`rule ${rule.tool} ${rule.decision} ${rule.scope}`)),
  }
})
vi.mock('#web/env-admin.js', () => ({ setAgentEnvVar: vi.fn(async (name: string, variable: string, value: string) => void steps.push(`env ${variable}=${value}`)) }))
vi.mock('#web/skills-admin.js', () => ({ writeSkill: vi.fn((name: string, id: string) => void steps.push(`skill ${id}`)) }))

const admin = await import('#web/templates-admin.js')
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
    installAbility: async (name, spec) => void steps.push(`install ${spec}`),
    envValue: (_name, variable) => env[variable],
    messagingConfigured: () => false,
    ...over,
  }
}

describe('templates', () => {
  it('are each a valid candidate with a complete setup', () => {
    for (const t of STARTER_TEMPLATES) {
      expect(t.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
      // Hand-written, so validation must leave them exactly as they are.
      expect(validateCandidate(t.candidate)).toEqual(t.candidate)
      expect(t.setup.abilities.length).toBeGreaterThan(0)
      expect(t.setup.keys.length).toBeGreaterThan(0)
      expect(new Set(t.setup.rules.map((r) => r.name)).size).toBe(t.setup.rules.length)
      // A timed template's runs say exactly what its instructions expect.
      if (t.setup.schedule) expect(t.setup.schedule.message).toBe(t.candidate.agent.scheduleMessage)
      // Instructions name the tools they're allowed to use (a "never"
      // rule needn't be mentioned).
      for (const rule of t.setup.rules.filter((r) => r.decision !== 'deny')) expect(t.candidate.agent.systemPrompt).toContain(rule.tool)
    }
    expect(new Set(STARTER_TEMPLATES.map((t) => t.id)).size).toBe(STARTER_TEMPLATES.length)
    expect(new Set(STARTER_TEMPLATES.map((t) => t.candidate.agent.name)).size).toBe(STARTER_TEMPLATES.length)
  })

  it('lists what each card shows', () => {
    const list = admin.listTemplates()
    expect(list.map((t) => t.id)).toEqual(STARTER_TEMPLATES.map((t) => t.id))
    expect(list.find((t) => t.id === 'customer-email-replies')).toMatchObject({
      category: 'Customer service',
      abilities: ['lp-gmail', 'lp-shopify', 'lp-docs-search'],
      schedule: 'every 10 minutes',
      trigger: 'every 10 minutes',
    })
    expect(list.find((t) => t.id === 'weekly-research-digest')?.schedule).toBe('Mondays at 09:00')
    expect(list.find((t) => t.id === 'incident-triage')?.schedule).toBeNull()
  })

  it('previews the whole setup under the first free name, marking keys already set', () => {
    const preview = admin.previewTemplate('weekly-research-digest', { agentExists: (n) => n === 'weekly-research-digest', envValue: (_n, v) => (v === 'BRAVE_API_KEY' ? 'set' : undefined) })
    expect(preview.name).toBe('weekly-research-digest-2')
    expect(preview.abilities).toEqual(['lp-web-search', 'lp-slack-notifier'])
    expect(preview.rules).toContainEqual({ tool: 'post_to_slack', decision: 'allow' })
    expect(preview.keys).toEqual([
      { names: ['TAVILY_API_KEY', 'BRAVE_API_KEY', 'FIRECRAWL_API_KEY'], set: true },
      { names: ['SLACK_BOT_TOKEN'], set: false },
      { names: ['SLACK_DEFAULT_CHANNEL'], set: false },
    ])
    expect(preview.schedule).toBe('Mondays at 09:00 (created paused)')
    expect(preview.needsApprovals).toBe(false)
  })

  it('creates the agent with its whole setup: rules before abilities, loaded last, schedule paused', async () => {
    const created = await admin.createFromTemplate('customer-email-replies', deps())
    expect(steps).toEqual([
      'scaffold customer-email-replies You answer customer emails for our business, from our support inbox.',
      'default customer-email-replies ask',
      'rule gmail_search allow */*',
      'rule gmail_get_thread allow */*',
      'rule gmail_create_draft allow */*',
      'rule gmail_modify_labels allow */*',
      'rule gmail_send ask */*',
      'rule shopify_create_refund deny */*',
      'install lp-gmail',
      'install lp-shopify',
      'install lp-docs-search',
      'env DOCS_SEARCH_PATH=docs',
      'register customer-email-replies',
    ])
    expect(created.abilities).toEqual({ installed: ['lp-gmail', 'lp-shopify', 'lp-docs-search'], failed: [] })
    const tasks = await listScheduledTasks({ agent: 'customer-email-replies' })
    expect(tasks.map((t) => [t.status, t.task_name, t.message, (t.schedule as { every: string }).every])).toEqual([
      ['paused', 'Check the support inbox', 'Handle new customer emails in the support inbox.', '10m'],
    ])
    expect(created.schedule).toEqual({ description: 'every 10 minutes', timeZone: expect.any(String) })
    const tab = (t: string) => `/agents/config?agent=customer-email-replies&tab=${t}`
    expect(created.checklist).toEqual([
      { label: 'Add its keys: GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN, SHOPIFY_STORE_DOMAIN, SHOPIFY_ADMIN_TOKEN', href: tab('env') },
      { label: 'Choose where approval requests go: Slack, email, Lark or a webhook', href: tab('messaging') },
      { label: expect.stringMatching(/^Put your policies and help articles in the project's docs folder/) },
      { label: 'Turn on its schedule (every 10 minutes) once it works in Chat', href: tab('schedules') },
    ])
    expect(created.exampleMessage).toBe('Handle new customer emails in the support inbox.')
  })

  it('leaves out what is already done: keys set, approvals connected', async () => {
    const env = { GMAIL_CLIENT_ID: 'x', GMAIL_CLIENT_SECRET: 'x', GMAIL_REFRESH_TOKEN: 'x', GITHUB_TOKEN: 'x', GITHUB_DEFAULT_REPO: 'a/b', SLACK_BOT_TOKEN: 'x' }
    const created = await admin.createFromTemplate('incident-triage', deps({ messagingConfigured: () => true }, env))
    expect(created.checklist.map((c) => c.label)).toEqual([
      'Add its key: SLACK_DEFAULT_CHANNEL',
      'Send it alerts: paste one into Chat, have your alerting tool call it over HTTP, or reply to it in Slack',
    ])
    expect(created.schedule).toBeUndefined()
  })

  it('keeps going when an ability fails to install, and says so first', async () => {
    const created = await admin.createFromTemplate('weekly-research-digest', deps({
      installAbility: async (_name, spec) => {
        if (spec === 'lp-slack-notifier') throw new Error('npm pack failed: 404 Not Found')
        steps.push(`install ${spec}`)
      },
    }))
    expect(created.abilities).toEqual({ installed: ['lp-web-search'], failed: [{ name: 'lp-slack-notifier', error: "it isn't published on npm yet" }] })
    expect(created.checklist[0]).toEqual({ label: "Install the lp-slack-notifier ability (it couldn't be installed: it isn't published on npm yet)", href: '/agents/config?agent=weekly-research-digest&tab=abilities' })
    expect(created.checklist.map((c) => c.label)).toContain('Add one of TAVILY_API_KEY, BRAVE_API_KEY or FIRECRAWL_API_KEY')
    expect(steps.at(-1)).toBe('register weekly-research-digest')
  })

  it('turns npm\'s install output into one plain line', () => {
    const npm404 = new Error('Command failed: npm pack lp-gmail --pack-destination /tmp/x\nnpm error code E404\nnpm error 404 Not Found - GET https://registry.npmjs.org/lp-gmail - Not found')
    expect(admin.installFailureReason(npm404)).toBe("it isn't published on npm yet")
    expect(admin.installFailureReason(new Error('Command failed: npm pack x\nnpm error code EAI_AGAIN'))).toBe('npm could not be reached; try again from the Abilities tab')
    expect(admin.installFailureReason(new Error('Command failed: npm pack x\nlp-x needs loopengine ^0.2.0'))).toBe('lp-x needs loopengine ^0.2.0')
  })

  it('creates the agent without installing anything where installs need the admin login', async () => {
    const { installAbility: _skip, ...noInstall } = deps()
    const created = await admin.createFromTemplate('incident-triage', noInstall)
    expect(created.abilities.installed).toEqual([])
    expect(created.abilities.failed.map((f) => f.error)).toEqual(['installing abilities needs LOOPENGINE_ADMIN_AUTH set on the server', 'installing abilities needs LOOPENGINE_ADMIN_AUTH set on the server'])
    expect(steps.some((s) => s.startsWith('install'))).toBe(false)
    expect(steps).toContain('register incident-triage')
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
    expect(created.checklist[0].label).toMatch(/^Install the lp-gmail ability .*update it from Settings → Upgrade/)
    expect((await listScheduledTasks({ agent: 'refund-approvals' }))[0].status).toBe('paused')
    // Its preview call passes no envValue either.
    expect(admin.previewTemplate('refund-approvals', { agentExists: () => false }).keys.every((k) => !k.set)).toBe(true)
  })
})
