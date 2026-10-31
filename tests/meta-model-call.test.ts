import OpenAI from 'openai'
import { describe, expect, it } from 'vitest'
import { createMetaModelCall } from '../core/model-calls/meta-model-call.js'
import { runAgent, type ModelCall } from '#core/run-agent.js'
import type { AgentConfig } from '#core/agent-config.js'

/** Stubbed fetch, not a live call — same approach as
 * deepseek-model-call.test.ts. Meta's Chat Completions API is
 * OpenAI-compatible, so createMetaModelCall is built on the real
 * `openai` SDK client, just pointed at https://api.meta.ai/v1. */
function stubClient(responses: unknown[]): { client: OpenAI; requests: unknown[] } {
  const requests: unknown[] = []
  let call = 0
  const fetchStub = (async (_url: unknown, init: RequestInit) => {
    requests.push(JSON.parse(init.body as string))
    const body = responses[call]
    call++
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
  }) as typeof fetch

  return { client: new OpenAI({ apiKey: 'test-key', baseURL: 'https://api.meta.ai/v1', fetch: fetchStub }), requests }
}

function chatCompletion(finishReason: string, message: Record<string, unknown>) {
  return {
    id: 'chatcmpl-1',
    object: 'chat.completion',
    model: 'meta-test',
    choices: [{ index: 0, finish_reason: finishReason, message: { role: 'assistant', ...message } }],
  }
}

describe('createMetaModelCall', () => {
  it('throws a Meta-specific error rather than silently falling back to OPENAI_API_KEY', () => {
    const originalOpenAIKey = process.env.OPENAI_API_KEY
    const originalProviderKey = process.env.META_API_KEY
    process.env.OPENAI_API_KEY = 'sk-openai-should-not-leak-into-meta'
    delete process.env.META_API_KEY

    try {
      expect(() => createMetaModelCall({ model: 'meta-test' })).toThrow(/META_API_KEY/)
    } finally {
      if (originalOpenAIKey === undefined) delete process.env.OPENAI_API_KEY
      else process.env.OPENAI_API_KEY = originalOpenAIKey
      if (originalProviderKey === undefined) delete process.env.META_API_KEY
      else process.env.META_API_KEY = originalProviderKey
    }
  })

  it('translates system prompt, messages, and tool schemas into the request, using max_completion_tokens not max_tokens', async () => {
    const { client, requests } = stubClient([chatCompletion('stop', { content: 'hi' })])
    const modelCall: ModelCall = createMetaModelCall({ model: 'meta-test', client })

    await modelCall(
      [{ role: 'user', content: 'hello' }],
      'You are a test agent.',
      [{ name: 'echo', description: 'Echoes input', input_schema: { type: 'object', properties: {} } }],
    )

    const request = requests[0] as Record<string, unknown>
    expect(request).toMatchObject({
      model: 'meta-test',
      max_completion_tokens: 4096,
      messages: [
        { role: 'system', content: 'You are a test agent.' },
        { role: 'user', content: 'hello' },
      ],
      tools: [{ type: 'function', function: { name: 'echo', description: 'Echoes input', parameters: { type: 'object', properties: {} } } }],
    })
    expect(request.max_tokens).toBeUndefined()
  })

  it('normalizes stop_reason: tool_calls -> tool_use, stop -> end_turn (shared with createOpenAIModelCall)', async () => {
    const { client } = stubClient([chatCompletion('tool_calls', { content: null, tool_calls: [] })])
    const modelCall: ModelCall = createMetaModelCall({ model: 'meta-test', client })
    const response = await modelCall([{ role: 'user', content: 'hi' }], 'sys', [])
    expect(response.stop_reason).toBe('tool_use')
  })

  it('round-trips a tool call end to end through runAgent', async () => {
    const { client, requests } = stubClient([
      chatCompletion('tool_calls', {
        content: null,
        tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'lookup_order', arguments: '{"orderId":"A-1001"}' } }],
      }),
      chatCompletion('stop', { content: 'Order delivered.' }),
    ])
    const modelCall: ModelCall = createMetaModelCall({ model: 'meta-test', client })

    const config: AgentConfig = {
      name: 'meta-check',
      systemPrompt: 'You are a test agent.',
      tools: [
        {
          name: 'lookup_order',
          description: "Look up an order's status",
          input_schema: { type: 'object', properties: { orderId: { type: 'string' } }, required: ['orderId'] },
          execute: async () => ({ status: 'delivered' }),
        },
      ],
      rules: [{ scopePattern: 'default/production/meta-check', tool: 'lookup_order', decision: 'allow' }],
      defaultDecision: 'deny',
    }

    const result = await runAgent(config, modelCall, 'is order A-1001 delivered?', [])

    expect(result.text).toBe('Order delivered.')
    expect(requests[1]).toMatchObject({
      messages: [
        {
          role: 'system',
          content:
            "You are a test agent.\n\nAvailable skills:\n- composio-large-outputs: How to retrieve a gateway tool's real output when its result says storedInFile is true instead of returning the data inline.",
        },
        { role: 'user', content: 'is order A-1001 delivered?' },
        {
          role: 'assistant',
          content: null,
          tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'lookup_order', arguments: '{"orderId":"A-1001"}' } }],
        },
        { role: 'tool', tool_call_id: 'call_1', content: '{"status":"delivered"}' },
      ],
    })
  })
})
