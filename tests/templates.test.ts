import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FileSchedulerStore, listScheduledTasks, setSchedulerStore } from '#core/scheduler.js'
import { validateCandidate } from '#core/system-agents/interviewer.js'
import { STARTER_TEMPLATES } from '#core/system-agents/templates.js'

vi.mock('#web/actauth-admin.js', () => ({ setDefaultDecision: vi.fn() }))
const { setDefaultDecision } = await import('#web/actauth-admin.js')
const admin = await import('#web/templates-admin.js')

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'templates-'))
  setSchedulerStore(new FileSchedulerStore(join(dir, '.scheduler')))
  vi.mocked(setDefaultDecision).mockClear()
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('templates', () => {
  it('are each a valid candidate, with unique ids and agent names', () => {
    for (const t of STARTER_TEMPLATES) {
      expect(t.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
      // Hand-written, so validation must leave them exactly as they are.
      expect(validateCandidate(t.candidate)).toEqual(t.candidate)
    }
    expect(new Set(STARTER_TEMPLATES.map((t) => t.id)).size).toBe(STARTER_TEMPLATES.length)
    expect(new Set(STARTER_TEMPLATES.map((t) => t.candidate.agent.name)).size).toBe(STARTER_TEMPLATES.length)
  })

  it('lists what each card shows', () => {
    const list = admin.listTemplates()
    expect(list.map((t) => t.id)).toEqual(STARTER_TEMPLATES.map((t) => t.id))
    expect(list.find((t) => t.id === 'customer-email-replies')).toMatchObject({
      category: 'Customer service',
      title: 'Answer customer emails',
      asksFirst: ['sending a reply', 'refunds', 'discounts'],
      needs: ['Email', 'lp-docs-search', 'Slack'],
      schedule: false,
    })
    expect(list.find((t) => t.id === 'weekly-research-digest')?.schedule).toBe(true)
  })

  it('previews under the first free name, with the setup checklist', () => {
    const preview = admin.previewTemplate('customer-email-replies', { agentExists: (n) => n === 'customer-email-replies' })
    expect(preview.name).toBe('customer-email-replies-2')
    expect(preview.permissions).toMatch(/asks you first.*sending a reply, refunds, discounts/)
    expect(preview.checklist).toEqual([
      { label: 'Connect your support inbox (an HTTP tool, or an MCP server)', href: '/agents/config?agent=customer-email-replies-2&tab=tools' },
      { label: 'Install the lp-docs-search ability', href: '/agents/config?agent=customer-email-replies-2&tab=abilities' },
      { label: 'Connect Slack so it can ask you before acting', href: '/agents/config?agent=customer-email-replies-2&tab=messaging' },
    ])
  })

  it('creates an agent that asks first, and can be used again under a new name', async () => {
    const made: string[] = []
    const prompts: string[] = []
    const deps = {
      agentExists: (n: string) => made.includes(n),
      createAgent: async (name: string, prompt: string) => {
        made.push(name)
        prompts.push(prompt)
      },
    }
    const first = await admin.createFromTemplate('customer-email-replies', deps)
    const second = await admin.createFromTemplate('customer-email-replies', deps)
    expect([first.name, second.name]).toEqual(['customer-email-replies', 'customer-email-replies-2'])
    expect(prompts[0]).toMatch(/^You answer customer emails/)
    expect(setDefaultDecision).toHaveBeenCalledWith('customer-email-replies', 'ask')
    expect(first.exampleMessage).toMatch(/order #1042/)
    expect(await listScheduledTasks({ agent: 'customer-email-replies' })).toEqual([])
  })

  it('adds a paused schedule for a timed template', async () => {
    const created = await admin.createFromTemplate('weekly-research-digest', { agentExists: () => false, createAgent: async () => {} })
    const tasks = await listScheduledTasks({ agent: 'weekly-research-digest' })
    expect(tasks.map((t) => [t.status, t.message, t.schedule])).toEqual([['paused', "Write this week's research digest.", expect.objectContaining({ every: '7d' })]])
    expect(created.scheduleError).toBeUndefined()
    expect(created.checklist.at(-1)?.label).toMatch(/turn its schedule on/)
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
    expect(() => admin.previewTemplate('nope', { agentExists: () => false })).toThrow(admin.TemplateError)
    await expect(admin.createFromTemplate('nope', { agentExists: () => false, createAgent: async () => {} })).rejects.toThrow(/No such template/)
  })
})
