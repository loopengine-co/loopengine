import Anthropic from '@anthropic-ai/sdk'
import { describe, expect, it } from 'vitest'
import { createAnthropicModelCall } from '../core/model-calls/anthropic-model-call.js'
import { runAgent, type ModelCall } from '#core/run-agent.js'
import type { AgentConfig } from '#core/agent-config.js'

/** Stubbed fetch, not a live call — captures the exact request body sent to
 * the Anthropic API and returns a scripted response, so the translation in
 * both directions can be asserted without a real network call or API key. */
function stubClient(responses: unknown[]): { client: Anthropic; requests: unknown[] } {
  const requests: unknown[] = []
  let call = 0
  const fetchStub = (async (_url: unknown, init: RequestInit) => {
    requests.push(JSON.parse(init.body as string))
    const body = responses[call]
    call++
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
  }) as typeof fetch

  return { client: new Anthropic({ apiKey: 'test-key', fetch: fetchStub }), requests }
}

function anthropicMessage(overrides: Record<string, unknown>) {
  return { id: 'msg_1', type: 'message', role: 'assistant', model: 'test', ...overrides }
}

describe('createAnthropicModelCall', () => {
  it('translates system prompt, messages, and tool schemas into the request', async () => {
    const { client, requests } = stubClient([
      anthropicMessage({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'hi' }] }),
    ])
    const modelCall: ModelCall = createAnthropicModelCall({ model: 'claude-test', client })

    await modelCall(
      [{ role: 'user', content: 'hello' }],
      'You are a test agent.',
      [{ name: 'echo', description: 'Echoes input', input_schema: { type: 'object', properties: {} } }],
    )

    expect(requests[0]).toMatchObject({
      model: 'claude-test',
      system: 'You are a test agent.',
      messages: [{ role: 'user', content: 'hello' }],
      tools: [{ name: 'echo', description: 'Echoes input', input_schema: { type: 'object', properties: {} } }],
    })
  })

  it('translates tool_use/tool_result blocks in both directions', async () => {
    const { client, requests } = stubClient([
      anthropicMessage({
        stop_reason: 'tool_use',
        content: [{ type: 'tool_use', id: 'call_1', name: 'lookup_order', input: { orderId: 'A-1001' } }],
      }),
      anthropicMessage({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'Order delivered.' }] }),
    ])
    const modelCall: ModelCall = createAnthropicModelCall({ model: 'claude-test', client })

    const config: AgentConfig = {
      name: 'anthropic-check',
      systemPrompt: 'You are a test agent.',
      tools: [
        {
          name: 'lookup_order',
          description: "Look up an order's status",
          input_schema: { type: 'object', properties: { orderId: { type: 'string' } }, required: ['orderId'] },
          execute: async () => ({ status: 'delivered' }),
        },
      ],
      rules: [{ scopePattern: 'default/production/anthropic-check', tool: 'lookup_order', decision: 'allow' }],
      defaultDecision: 'deny',
    }

    const result = await runAgent(config, modelCall, 'is order A-1001 delivered?', [])

    expect(result.text).toBe('Order delivered.')

    // The tool_result loopengine fed back on the second call must bundle
    // into one message, matching the block content: tool_use_id links back
    // to the exact call, is_error is present and false on success.
    expect(requests[1]).toMatchObject({
      messages: [
        { role: 'user', content: 'is order A-1001 delivered?' },
        {
          role: 'assistant',
          content: [{ type: 'tool_use', id: 'call_1', name: 'lookup_order', input: { orderId: 'A-1001' } }],
        },
        {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: 'call_1', content: '{"status":"delivered"}', is_error: false }],
        },
      ],
    })
  })
  it('sends no thinking settings unless a reasoning effort is set', async () => {
    const reply = anthropicMessage({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'hi' }] })
    const { client, requests } = stubClient([reply, reply, reply, reply])
    const ask = (reasoningEffort?: 'none' | 'minimal' | 'high') =>
      createAnthropicModelCall({ model: 'claude-test', client, reasoningEffort })([{ role: 'user', content: 'hi' }], 'sys', [])

    await ask()
    await ask('none')
    await ask('high')
    await ask('minimal')

    expect(requests[0]).not.toHaveProperty('thinking')
    expect(requests[0]).not.toHaveProperty('output_config')
    expect(requests[0]).toMatchObject({ max_tokens: 4096 })
    expect(requests[1]).toMatchObject({ thinking: { type: 'disabled' } })
    expect(requests[1]).not.toHaveProperty('output_config')
    expect(requests[2]).toMatchObject({ thinking: { type: 'adaptive' }, output_config: { effort: 'high' }, max_tokens: 16000 })
    // Claude has no 'minimal'.
    expect(requests[3]).toMatchObject({ output_config: { effort: 'low' } })
  })

  it('sends signed thinking back unchanged with the tool results it led to', async () => {
    const thinking = { type: 'thinking', thinking: 'I should look the order up.', signature: 'sig-abc' }
    const redacted = { type: 'redacted_thinking', data: 'opaque' }
    const { client, requests } = stubClient([
      anthropicMessage({
        stop_reason: 'tool_use',
        content: [thinking, redacted, { type: 'tool_use', id: 'call_1', name: 'lookup_order', input: { orderId: 'A-1001' } }],
      }),
      anthropicMessage({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'Order delivered.' }] }),
    ])
    const modelCall: ModelCall = createAnthropicModelCall({ model: 'claude-test', client, reasoningEffort: 'medium' })

    const config: AgentConfig = {
      name: 'anthropic-thinking-check',
      systemPrompt: 'You are a test agent.',
      tools: [
        {
          name: 'lookup_order',
          description: "Look up an order's status",
          input_schema: { type: 'object', properties: { orderId: { type: 'string' } }, required: ['orderId'] },
          execute: async () => ({ status: 'delivered' }),
        },
      ],
      rules: [{ scopePattern: 'default/production/anthropic-thinking-check', tool: 'lookup_order', decision: 'allow' }],
      defaultDecision: 'deny',
    }

    const result = await runAgent(config, modelCall, 'is order A-1001 delivered?', [])

    expect(result.text).toBe('Order delivered.')
    expect((requests[1] as { messages: unknown[] }).messages[1]).toEqual({
      role: 'assistant',
      content: [thinking, redacted, { type: 'tool_use', id: 'call_1', name: 'lookup_order', input: { orderId: 'A-1001' } }],
    })
  })

  it("leaves out other providers' reasoning", async () => {
    const { client, requests } = stubClient([anthropicMessage({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'ok' }] })])
    await createAnthropicModelCall({ model: 'claude-test', client })(
      [
        { role: 'user', content: 'hi' },
        {
          role: 'assistant',
          content: [
            { type: 'thinking', text: 'DeepSeek reasoning' },
            { type: 'openai_reasoning', data: '{"type":"reasoning","id":"rs_1","summary":[]}' },
            { type: 'text', text: 'Hello' },
          ],
        },
        { role: 'user', content: 'and?' },
      ],
      'sys',
      [],
    )
    expect((requests[0] as { messages: unknown[] }).messages[1]).toEqual({ role: 'assistant', content: [{ type: 'text', text: 'Hello' }] })
  })
})
