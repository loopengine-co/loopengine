import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { runAgent, type Message, type ModelCall, type ModelResponse } from '#core/run-agent.js'
import type { AgentConfig, ToolDefinition } from '#core/agent-config.js'
import type { LoopEvent } from '#core/loop-events.js'
import { setAgentDir } from '#core/agent-env.js'
import { SKILL_ATTACH_MAX_CHARS, skillsForResult, toolSkillsFor } from '#core/ability-skills.js'

/** An agent folder with abilities' records and their skills. */
function agentFolder(records: Record<string, unknown>, skills: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'loopengine-ability-skills-'))
  writeFileSync(join(dir, '.loopengine-abilities.json'), JSON.stringify(records))
  for (const [name, body] of Object.entries(skills)) {
    mkdirSync(join(dir, 'skills', name), { recursive: true })
    writeFileSync(join(dir, 'skills', name, 'SKILL.md'), `---\nname: ${name}\ndescription: About ${name}\n---\n\n${body}\n`)
  }
  return dir
}

const textOf = (skills: Record<string, string>) => (name: string) => skills[name]

describe("which abilities' skills go with which tools", () => {
  it("gives an ability's one skill to all its tools, apps' tools included", () => {
    const skills = { 'em-order-shipment-flow': 'What an order status means.', linear: 'How to use Linear.' }
    const dir = agentFolder({
      'lp-em-orders': { tools: ['lookup_order_details', 'lookup_order_refunds'], skills: ['em-order-shipment-flow'] },
      'mcp-linear': { tools: [], mcp: { tools: [{ name: 'linear_list_issues', remote: 'list_issues' }] }, skills: ['linear'] },
      'no-skills': { tools: ['other_tool'], skills: [] },
    }, skills)
    const found = toolSkillsFor(dir, textOf(skills))
    expect(found.attach.get('lookup_order_details')).toEqual(['em-order-shipment-flow'])
    expect(found.attach.get('lookup_order_refunds')).toEqual(['em-order-shipment-flow'])
    expect(found.attach.get('linear_list_issues')).toEqual(['linear'])
    expect(found.attach.has('other_tool')).toBe(false)
  })

  it('with several skills, gives each the tools its text names, and points to them for the rest', () => {
    const skills = {
      'refund-rules': 'Before shop_refund, check the order with shop_get_order.',
      'catalog-care': 'Use shop_update_product only for typos.',
    }
    const dir = agentFolder({ shop: { tools: ['shop_refund', 'shop_get_order', 'shop_update_product', 'shop_list_collections'], skills: ['refund-rules', 'catalog-care'] } }, skills)
    const found = toolSkillsFor(dir, textOf(skills))
    expect(found.attach.get('shop_refund')).toEqual(['refund-rules'])
    expect(found.attach.get('shop_get_order')).toEqual(['refund-rules'])
    expect(found.attach.get('shop_update_product')).toEqual(['catalog-care'])
    expect(found.attach.has('shop_list_collections')).toBe(false)
    expect(found.point.get('shop_list_collections')).toEqual(['refund-rules', 'catalog-care'])
  })

  it("only points to a skill too long to attach, or one the agent doesn't have", () => {
    const skills = { huge: 'x'.repeat(SKILL_ATTACH_MAX_CHARS + 1) }
    const dir = agentFolder({ big: { tools: ['big_tool'], skills: ['huge'] }, gone: { tools: ['gone_tool'], skills: ['missing'] } }, skills)
    const found = toolSkillsFor(dir, textOf(skills))
    expect(found.attach.has('big_tool')).toBe(false)
    expect(found.point.get('big_tool')).toEqual(['huge'])
    expect(found.attach.has('gone_tool') || found.point.has('gone_tool')).toBe(false)
  })

  it('attaches each skill once, and points once', () => {
    const toolSkills = { attach: new Map([['a', ['s1']]]), point: new Map([['a', ['s2']]]) }
    const seen = new Set<string>()
    const first = skillsForResult('a', toolSkills, seen, () => 'Body.')
    expect(first.attached).toEqual(['s1'])
    expect(first.text).toContain('[skill attached: s1]')
    expect(first.text).toContain('Related skills: s2.')
    expect(skillsForResult('a', toolSkills, seen, () => 'Body.')).toEqual({ text: '', attached: [] })
  })
})

describe("attaching an ability's skill to its tool's first result", () => {
  const SKILL = 'Shipped means it left our warehouse; on its way means the carrier has it.'

  function setup() {
    const dir = agentFolder({ 'lp-em-orders': { tools: ['lookup_order_details'], skills: ['em-order-shipment-flow'] } }, { 'em-order-shipment-flow': SKILL })
    const lookup: ToolDefinition = {
      name: 'lookup_order_details',
      description: 'Look up an order',
      input_schema: { type: 'object', properties: {} },
      execute: async () => ({ status: 'shipped' }),
    }
    const config: AgentConfig = {
      name: 'skill-agent',
      systemPrompt: 'You are a test agent.',
      tools: [lookup],
      rules: [{ scopePattern: '*/*/*', tool: 'lookup_order_details', decision: 'allow' }],
      defaultDecision: 'deny',
      skillsDirs: [join(dir, 'skills')],
    }
    setAgentDir(config, dir)
    return config
  }

  const results = (history: Message[]) =>
    history.flatMap((m) => (Array.isArray(m.content) ? m.content : [])).filter((b) => b.type === 'tool_result').map((b) => String((b as { content?: unknown }).content))

  it('adds the skill to the first result only, and not again later in the conversation', async () => {
    const config = setup()
    let call = 0
    const model: ModelCall = vi.fn(async (): Promise<ModelResponse> => {
      call++
      if (call <= 2) return { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: `t${call}`, name: 'lookup_order_details', input: {} }] }
      return { stop_reason: 'end_turn', content: [{ type: 'text', text: 'done' }] }
    })
    const events: LoopEvent[] = []
    const first = await runAgent(config, model, 'where is EM1001?', [], { onEvent: (e) => events.push(e) })
    const [one, two] = results(first.history)
    expect(one).toContain('"status":"shipped"')
    expect(one).toContain('[skill attached: em-order-shipment-flow]')
    expect(one).toContain(SKILL)
    expect(two).not.toContain(SKILL)
    expect(events.filter((e) => e.type === 'skill:loaded')).toEqual([{ type: 'skill:loaded', skill: 'em-order-shipment-flow' }])

    // The same conversation, a message later: it already has the skill.
    call = 1
    const again = await runAgent(config, model, 'and EM1002?', first.history)
    expect(results(again.history).slice(2).some((r) => r.includes(SKILL))).toBe(false)
  })

  it("doesn't attach a skill the model already opened", async () => {
    const config = setup()
    let call = 0
    const model: ModelCall = vi.fn(async (): Promise<ModelResponse> => {
      call++
      if (call === 1) return { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 's1', name: 'Skill', input: { skill: 'em-order-shipment-flow' } }] }
      if (call === 2) return { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 't1', name: 'lookup_order_details', input: {} }] }
      return { stop_reason: 'end_turn', content: [{ type: 'text', text: 'done' }] }
    })
    const result = await runAgent(config, model, 'where is EM1001?')
    const [opened, lookup] = results(result.history)
    expect(opened).toContain(SKILL)
    expect(lookup).not.toContain('[skill attached')
  })
})
