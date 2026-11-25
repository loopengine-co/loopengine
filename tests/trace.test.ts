import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { listTraceSpans, openAuditDb, setAuditDb } from '#core/audit-store.js'
import { runAgent, type Message, type ModelCall, type ModelResponse } from '#core/run-agent.js'
import { startTurnTrace } from '#core/trace.js'
import type { AgentConfig, ToolDefinition } from '#core/agent-config.js'

let dir: string
let db: DatabaseSync

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'le-trace-'))
  db = openAuditDb(dir)!
  setAuditDb(db)
})
afterEach(() => {
  setAuditDb(undefined)
  db.close()
  rmSync(dir, { recursive: true, force: true })
})

const echo: ToolDefinition = {
  name: 'echo',
  description: 'Echoes input',
  input_schema: { type: 'object', properties: { msg: { type: 'string' } } },
  execute: async (input) => `echo:${input.msg}`,
}

const config: AgentConfig = {
  name: 'test-agent',
  systemPrompt: 'You are a test agent.',
  rules: [{ scopePattern: 'default/production/test-agent', tool: 'echo', decision: 'allow' }],
  defaultDecision: 'deny',
  tools: [echo],
  model: { provider: 'openai', model: 'gpt-6' },
}

function model(): ModelCall {
  let call = 0
  return async () => {
    call++
    if (call === 1) return { stop_reason: 'tool_use', content: [{ type: 'text', text: 'Checking.' }, { type: 'tool_use', id: 't1', name: 'echo', input: { msg: 'hi' } }], usage: { input_tokens: 120, output_tokens: 8 } } as ModelResponse
    return { stop_reason: 'end_turn', content: [{ type: 'text', text: 'done' }], usage: { input_tokens: 140, output_tokens: 2 } } as ModelResponse
  }
}

describe('a turn’s trace', () => {
  it('records the prompt, each model call’s new input and output, and each tool call', async () => {
    await runAgent(config, model(), 'Order 42: check it.', [], { sessionId: 's-1' })
    const spans = listTraceSpans('s-1')
    expect(spans.map((s) => [s.kind, s.name])).toEqual([['prompt', undefined], ['llm', 'gpt-6'], ['tool', 'echo'], ['llm', 'gpt-6']])
    const [prompt, first, tool, second] = spans
    // The prompt: the system prompt (kept once, by hash), tools, model and the message it starts with.
    expect(prompt!.input).toMatchObject({ tools: expect.arrayContaining(['echo']), model: { provider: 'openai', model: 'gpt-6' }, start: 'Order 42: check it.', priorMessages: 0 })
    expect((prompt!.input as { system: string }).system).toContain('You are a test agent.')
    // The first call adds nothing the prompt didn't show; its output is the reply.
    expect(first!.input).toEqual([])
    expect(first!.output).toEqual([{ type: 'text', text: 'Checking.' }, { type: 'tool_use', id: 't1', name: 'echo', input: { msg: 'hi' } }])
    expect(first!.meta).toMatchObject({ sent: 1, inputTokens: 120, outputTokens: 8, stopReason: 'tool_use' })
    expect(tool).toMatchObject({ input: { msg: 'hi' }, output: '"echo:hi"', meta: { toolUseId: 't1' } })
    expect(tool!.durationMs).toBeGreaterThanOrEqual(0)
    // The second call's new input is the tool result only, not the whole conversation again.
    expect(second!.input).toEqual([expect.objectContaining({ role: 'user', content: [expect.objectContaining({ type: 'tool_result', tool_use_id: 't1' })] })])
    expect(second!.meta).toMatchObject({ sent: 3 })
    expect(second!.output).toEqual([{ type: 'text', text: 'done' }])
  })

  it('keeps one copy of a system prompt used by many turns, and shows earlier messages only as a count', async () => {
    const first = await runAgent(config, model(), 'one', [], { sessionId: 's-2' })
    await runAgent(config, model(), 'two', first.history, { sessionId: 's-2' })
    expect((db.prepare('SELECT COUNT(*) AS n FROM trace_prompts').get() as { n: number }).n).toBe(1)
    const prompts = listTraceSpans('s-2').filter((s) => s.kind === 'prompt')
    expect(prompts.map((p) => (p.input as { priorMessages: number }).priorMessages)).toEqual([0, 4])
  })

  it('records a failed model call with its error', async () => {
    const failing: ModelCall = async () => { throw new Error('rate limited') }
    await expect(runAgent(config, failing, 'x', [], { sessionId: 's-3' })).rejects.toThrow()
    expect(listTraceSpans('s-3').filter((s) => s.kind === 'llm').every((s) => s.error?.includes('rate limited'))).toBe(true)
  })

  it('records nothing without a session or a database', async () => {
    await runAgent(config, model(), 'x')
    setAuditDb(undefined)
    await runAgent(config, model(), 'x', [], { sessionId: 's-4' })
    setAuditDb(db)
    expect((db.prepare('SELECT COUNT(*) AS n FROM trace_spans').get() as { n: number }).n).toBe(0)
  })

  it('names a tool call that sends no start event (a built-in like Skill) from the reply that asked for it', () => {
    const trace = startTurnTrace('s-5')
    const starter: Message = { role: 'user', content: 'go' }
    trace.start({ system: 'sys', tools: ['Skill'], model: {}, history: [], starter, resumed: false })
    trace.llm({ sent: [starter], response: { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'k1', name: 'Skill', input: { skill: 'refunds' } }] } as ModelResponse, durationMs: 10, model: {} })
    trace.message({ role: 'user', content: [{ type: 'tool_result', tool_use_id: 'k1', content: 'The skill text' }] } as Message)
    trace.flush()
    expect(listTraceSpans('s-5').find((s) => s.kind === 'tool')).toMatchObject({ name: 'Skill', input: { skill: 'refunds' }, output: 'The skill text', meta: { status: 'Done.' } })
  })
})
