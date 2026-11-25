import { describe, expect, it } from 'vitest'
import type { AuditEvent, TraceSpan } from '#core/audit-store.js'
import type { UsageRow } from '#core/usage.js'
import type { WorkflowRun } from '#core/workflow-runs.js'
import { buildRunTrace } from '#web/run-trace.js'

const run: WorkflowRun = {
  run_id: 'r-1', agent: 'cs', workflow_id: 'refund-check', source: 'api', status: 'done',
  started_at: '2026-11-25T10:00:00.000Z', finished_at: '2026-11-25T10:00:09.500Z',
  message: 'Run the "Refund check" workflow. order_id: 42', session_id: 's-1', params: { order_id: '42' },
  result: 'Refund of $20 issued.', versions: { workflow: 3, policies: 1 },
  decisions: [{ tool: 'issue_refund', approved: true, edited: true, at: '2026-11-25T10:00:05.000Z', by: 'ana@shop.com', reason: 'Lower amount' }],
  feedback: { verdict: 'good', edit: 'light', final: 'Refund of $20 issued, sorry!', at: '2026-11-25T11:00:00.000Z' },
}

const span = (id: number, at: string, over: Partial<TraceSpan>): TraceSpan => ({ id, sessionId: 's-1', at, kind: 'llm', ...over })
const spans: TraceSpan[] = [
  span(1, '2026-11-25T10:00:00.100Z', { kind: 'prompt', input: { system: 'You are cs.', tools: ['issue_refund'], model: { provider: 'openai', model: 'gpt-6' }, start: run.message, priorMessages: 0 }, meta: { resumed: false } }),
  span(2, '2026-11-25T10:00:00.200Z', { name: 'gpt-6', durationMs: 1200, input: [], output: [{ type: 'tool_use', id: 't1', name: 'issue_refund', input: { amount: 25 } }], meta: { provider: 'openai', model: 'gpt-6', sent: 1, inputTokens: 900, outputTokens: 30, stopReason: 'tool_use' } }),
  span(3, '2026-11-25T10:00:06.000Z', { kind: 'tool', name: 'issue_refund', durationMs: 300, input: { amount: 20 }, output: '{"ok":true}', meta: { toolUseId: 't1', status: 'Approved.' } }),
  span(4, '2026-11-25T10:00:06.400Z', { name: 'gpt-6', durationMs: 800, input: [{ role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: '{"ok":true}' }] }], output: [{ type: 'text', text: 'Refund of $20 issued.' }], meta: { sent: 3, inputTokens: 950, outputTokens: 10, stopReason: 'end_turn' } }),
]
const usage = [
  { id: 1, at: '', agent: 'cs', tenant: 'default', provider: 'openai', model: 'gpt-6', inputTokens: 900, outputTokens: 30, durationMs: 1200, costUsd: 0.01 },
  { id: 2, at: '', agent: 'cs', tenant: 'default', provider: 'openai', model: 'gpt-6', inputTokens: 950, outputTokens: 10, durationMs: 800, costUsd: 0.005 },
] as UsageRow[]
const events = [{ id: 9, at: '2026-11-25T11:00:00.000Z', agent: 'cs', run_id: 'r-1', kind: 'feedback', by: 'app', data: { verdict: 'good', edit: 'light' } }] as AuditEvent[]

describe('a run’s trace record', () => {
  it('has the run, its workflow version, input, output, model, tool calls, error, duration, cost and feedback', () => {
    const t = buildRunTrace({ run, spans, usage, events })
    expect(t).toMatchObject({
      execution_id: 'r-1',
      workflow_id: 'refund-check',
      workflow_version: 3,
      workflow_version_id: 'refund-check@v3',
      input: { params: { order_id: '42' }, message: run.message },
      final_output: 'Refund of $20 issued.',
      model: { provider: 'openai', model: 'gpt-6' },
      error: null,
      duration_ms: 9500,
      feedback: { verdict: 'good', edit: 'light', final_output_used: 'Refund of $20 issued, sorry!' },
    })
    expect(t.cost).toEqual({ usd: 0.015, input_tokens: 1850, output_tokens: 40, model_calls: 2, model_ms: 2000 })
    expect(t.tool_calls).toEqual([{ id: 't1', name: 'issue_refund', input: { amount: 20 }, output: '{"ok":true}', status: 'Approved.', error: null, started_at: '2026-11-25T10:00:06.000Z', duration_ms: 300 }])
  })

  it('puts every step in time order: prompt, model calls, the decision, the tool call, feedback', () => {
    const t = buildRunTrace({ run, spans, usage, events })
    expect(t.step_events.map((s) => s.type)).toEqual(['prompt', 'model_call', 'decision', 'tool_call', 'model_call', 'feedback'])
    expect(t.step_events[1]).toMatchObject({ model: 'gpt-6', input_tokens: 900, output_tokens: 30, messages_sent: 1, stop_reason: 'tool_use' })
    expect(t.step_events[2]).toMatchObject({ tool: 'issue_refund', approved: true, changed: true, by: 'ana@shop.com', reason: 'Lower amount' })
  })

  it('leaves cost unknown when a call has no price, and reads an older run’s brief version', () => {
    const t = buildRunTrace({ run: { ...run, versions: { brief: 2 }, status: 'error', error: 'Stripe timed out', result: undefined, feedback: undefined }, spans: [], usage: [{ ...usage[0]!, costUsd: undefined }], events: [] })
    expect(t).toMatchObject({ workflow_version: 2, workflow_version_id: 'refund-check@v2', final_output: null, error: 'Stripe timed out', feedback: null, model: { model: 'gpt-6' } })
    expect(t.cost.usd).toBeNull()
  })
})
