import OpenAI from 'openai'
import { describe, expect, it } from 'vitest'
import { createOpenAIModelCall, toResponsesInput } from '../core/model-calls/openai-model-call.js'
import { runAgent, type ModelCall } from '#core/run-agent.js'
import type { AgentConfig } from '#core/agent-config.js'

/** Stubbed fetch, not a live call — same approach as
 * anthropic-model-call.test.ts, captures the exact request body sent to
 * the OpenAI API and returns a scripted Responses API response. */
function stubClient(responses: unknown[]): { client: OpenAI; requests: unknown[]; urls: string[] } {
  const requests: unknown[] = []
  const urls: string[] = []
  let call = 0
  const fetchStub = (async (url: unknown, init: RequestInit) => {
    urls.push(String(url))
    requests.push(JSON.parse(init.body as string))
    const body = responses[call]
    call++
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
  }) as typeof fetch

  return { client: new OpenAI({ apiKey: 'test-key', fetch: fetchStub }), requests, urls }
}

function response(output: unknown[], extra: Record<string, unknown> = {}) {
  return {
    id: 'resp_1',
    object: 'response',
    created_at: 0,
    model: 'gpt-test',
    status: 'completed',
    incomplete_details: null,
    output,
    usage: { input_tokens: 12, output_tokens: 5, total_tokens: 17 },
    ...extra,
  }
}

const message = (text: string) => ({ type: 'message', id: 'msg_1', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text, annotations: [] }] })
const reasoning = { type: 'reasoning', id: 'rs_1', summary: [], encrypted_content: 'gAAAA-encrypted' }

describe('createOpenAIModelCall', () => {
  it('calls /v1/responses with the system prompt as instructions, the messages as input and the tools', async () => {
    const { client, requests, urls } = stubClient([response([message('hi')])])
    const modelCall: ModelCall = createOpenAIModelCall({ model: 'gpt-test', client })

    const result = await modelCall(
      [{ role: 'user', content: 'hello' }],
      'You are a test agent.',
      [{ name: 'echo', description: 'Echoes input', input_schema: { type: 'object', properties: {} } }],
    )

    expect(urls[0]).toMatch(/\/v1\/responses$/)
    expect(requests[0]).toMatchObject({
      model: 'gpt-test',
      instructions: 'You are a test agent.',
      input: [{ role: 'user', content: 'hello' }],
      tools: [{ type: 'function', name: 'echo', description: 'Echoes input', parameters: { type: 'object', properties: {} }, strict: false }],
      store: false,
      include: ['reasoning.encrypted_content'],
    })
    expect(result).toEqual({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'hi' }], usage: { input_tokens: 12, output_tokens: 5 } })
  })

  it('sends a reasoning effort only when one is set, tools or not', async () => {
    const { client, requests } = stubClient([response([message('hi')]), response([message('hi')])])
    await createOpenAIModelCall({ model: 'gpt-test', client })([{ role: 'user', content: 'hi' }], 'sys', [])
    await createOpenAIModelCall({ model: 'gpt-test', client, reasoningEffort: 'high' })(
      [{ role: 'user', content: 'hi' }],
      'sys',
      [{ name: 'echo', description: 'Echoes input', input_schema: { type: 'object', properties: {} } }],
    )
    expect(requests[0]).not.toHaveProperty('reasoning')
    expect(requests[1]).toMatchObject({ reasoning: { effort: 'high' } })
    // Reasoning counts toward max_output_tokens, so the default is higher with it on.
    expect(requests[0]).toMatchObject({ max_output_tokens: 4096 })
    expect(requests[1]).toMatchObject({ max_output_tokens: 16000 })
  })

  it('gives a reasoning model with no effort set low, with room to act; an older model none', async () => {
    const { client, requests } = stubClient([response([message('hi')]), response([message('hi')]), response([message('hi')]), response([message('hi')])])
    const ask = (model: string, effort?: 'high') => createOpenAIModelCall({ model, client, ...(effort ? { reasoningEffort: effort } : {}) })([{ role: 'user', content: 'hi' }], 'sys', [])
    await ask('gpt-5.4')
    await ask('o4-mini')
    await ask('gpt-4o')
    await ask('gpt-5.4', 'high')
    expect(requests[0]).toMatchObject({ reasoning: { effort: 'low' }, max_output_tokens: 16000 })
    expect(requests[1]).toMatchObject({ reasoning: { effort: 'low' } })
    expect(requests[2]).not.toHaveProperty('reasoning')
    expect(requests[2]).toMatchObject({ max_output_tokens: 4096 })
    expect(requests[3]).toMatchObject({ reasoning: { effort: 'high' } })
  })

  it('stops with tool_use for a function call, and max_tokens when cut off', async () => {
    const { client } = stubClient([
      response([{ type: 'function_call', id: 'fc_1', call_id: 'call_1', name: 'echo', arguments: '{}', status: 'completed' }]),
      response([message('Half an ans')], { status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' } }),
    ])
    const modelCall = createOpenAIModelCall({ model: 'gpt-test', client })
    expect((await modelCall([{ role: 'user', content: 'hi' }], 'sys', [])).stop_reason).toBe('tool_use')
    expect((await modelCall([{ role: 'user', content: 'hi' }], 'sys', [])).stop_reason).toBe('max_tokens')
  })

  it('round-trips a tool call with its reasoning: the call, then the encrypted reasoning, call and result sent back', async () => {
    const { client, requests } = stubClient([
      response([reasoning, { type: 'function_call', id: 'fc_1', call_id: 'call_1', name: 'lookup_order', arguments: '{"orderId":"A-1001"}', status: 'completed' }]),
      response([message('Order delivered.')]),
    ])
    const modelCall: ModelCall = createOpenAIModelCall({ model: 'gpt-test', client, reasoningEffort: 'low' })

    const config: AgentConfig = {
      name: 'openai-check',
      systemPrompt: 'You are a test agent.',
      tools: [
        {
          name: 'lookup_order',
          description: "Look up an order's status",
          input_schema: { type: 'object', properties: { orderId: { type: 'string' } }, required: ['orderId'] },
          execute: async () => ({ status: 'delivered' }),
        },
      ],
      rules: [{ scopePattern: 'default/production/openai-check', tool: 'lookup_order', decision: 'allow' }],
      defaultDecision: 'deny',
    }

    const result = await runAgent(config, modelCall, 'is order A-1001 delivered?', [])

    expect(result.text).toBe('Order delivered.')
    // The reasoning goes back before the call it led to, and the result is
    // a function_call_output linked by call_id.
    expect((requests[1] as { input: unknown[] }).input).toEqual([
      { role: 'user', content: 'is order A-1001 delivered?' },
      reasoning,
      { type: 'function_call', call_id: 'call_1', name: 'lookup_order', arguments: '{"orderId":"A-1001"}' },
      { type: 'function_call_output', call_id: 'call_1', output: '{"status":"delivered"}' },
    ])
  })

  it('drops reasoning another provider produced, and anything that isn\'t a reasoning item', () => {
    expect(
      toResponsesInput({
        role: 'assistant',
        content: [
          { type: 'thinking', text: 'DeepSeek reasoning' },
          { type: 'openai_reasoning', data: 'not json' },
          { type: 'text', text: 'Hello' },
        ],
      }),
    ).toEqual([{ role: 'assistant', content: 'Hello' }])
  })
})
