import { describe, expect, it, vi } from 'vitest'
import type { ModelCall } from '#core/run-agent.js'
import { decideReply, decisionPrompt } from '#core/messaging/decide.js'

const answering = (content: unknown[]): ModelCall => async () => ({ stop_reason: 'tool_use', content: content as never })
const record = (input: Record<string, unknown>) => answering([{ type: 'tool_use', id: 't', name: 'record_decision', input }])

describe('decideReply', () => {
  it('reads approve, deny (with a reason), edit and continue for an approval', async () => {
    const approval = { kind: 'approval' as const, tool: 'stripe_refund' }
    expect(await decideReply(record({ decision: 'approve' }), approval, 'yes')).toEqual({ decision: 'approve' })
    expect(await decideReply(record({ decision: 'deny', reason: ' wrong customer ' }), approval, 'no')).toEqual({ decision: 'deny', reason: 'wrong customer' })
    expect(await decideReply(record({ decision: 'edit' }), approval, 'make it 40')).toEqual({ decision: 'edit' })
    expect(await decideReply(record({ decision: 'continue' }), approval, 'why?')).toEqual({ decision: 'continue' })
  })

  it('reads an answer to a question, and never approves one', async () => {
    const question = { kind: 'question' as const, question: 'Which city?', options: ['Tokyo', 'Kyoto'] }
    expect(await decideReply(record({ decision: 'answer', answer: 'Kyoto' }), question, 'kyoto')).toEqual({ decision: 'answer', answer: 'Kyoto' })
    expect(await decideReply(record({ decision: 'answer', answer: '  ' }), question, 'hmm')).toEqual({ decision: 'continue' })
    expect(await decideReply(record({ decision: 'approve' }), question, 'yes')).toEqual({ decision: 'continue' })
  })

  it('treats anything else as continue: plain text, an unknown decision, a failed call', async () => {
    const approval = { kind: 'approval' as const, tool: 'x' }
    expect(await decideReply(answering([{ type: 'text', text: '{"decision":"approve"}' }]), approval, 'yes')).toEqual({ decision: 'continue' })
    expect(await decideReply(record({ decision: 'yolo' }), approval, 'yes')).toEqual({ decision: 'continue' })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await decideReply(async () => Promise.reject(new Error('down')), approval, 'yes')).toEqual({ decision: 'continue' })
    vi.restoreAllMocks()
  })

  it('passes only the message, with one tool whose choices fit the request', async () => {
    let seen: { messages: unknown; tools: { input_schema: { properties: { decision: { enum: string[] } } } }[] } | undefined
    const spy: ModelCall = async (messages, _system, tools) => {
      seen = { messages, tools: tools as never }
      return { stop_reason: 'end_turn', content: [] }
    }
    await decideReply(spy, { kind: 'approval', tool: 'x' }, 'hello')
    expect(seen!.messages).toEqual([{ role: 'user', content: '<message>\nhello\n</message>' }])
    expect(seen!.tools.map((t) => t.input_schema.properties.decision.enum)).toEqual([['approve', 'deny', 'edit', 'continue']])
    expect(decisionPrompt({ kind: 'approval', tool: 'x' })).toMatch(/When in doubt, choose continue/)
  })
})
