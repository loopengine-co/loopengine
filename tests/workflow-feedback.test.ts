import { describe, expect, it } from 'vitest'
import { createFeedbackToken, verifyFeedbackToken } from '#core/approval-links.js'
import { feedbackSummary, isActionable, suggestImprovements } from '#web/workflow-feedback.js'
import { feedbackSourceOf, runFeedbackFrom } from '#web/workflow-evidence.js'
import type { WorkflowRun } from '#core/workflow-runs.js'

const run = (id: string, over: Partial<WorkflowRun> = {}): WorkflowRun => ({
  run_id: id, agent: 'cs', workflow_id: 'refunds', source: 'api', status: 'done', started_at: '2026-11-20T10:00:00.000Z', message: 'm', session_id: 's' + id, result: 'Refunded $84.', ...over,
})

describe('feedback links', () => {
  it('name the run, its agent and where they were sent, and refuse a changed or expired one', () => {
    const token = createFeedbackToken('cs', 'r1', 'slack', 1_000)
    expect(verifyFeedbackToken(token, 2_000)).toEqual({ runId: 'r1', agent: 'cs', source: 'slack' })
    const [body, sig] = token.split('.')
    const forged = Buffer.from(JSON.stringify({ f: 'r2', a: 'cs', s: 'slack', exp: 9e15 })).toString('base64url')
    expect(verifyFeedbackToken(`${forged}.${sig}`, 2_000)).toBeNull()
    expect(verifyFeedbackToken(`${body}.x${sig}`, 2_000)).toBeNull()
    expect(verifyFeedbackToken(token, 1_000 + 31 * 86_400_000)).toBeNull()
  })
})

describe('feedback on a run', () => {
  it('keeps where it came from and who gave it, and how much the result was changed', () => {
    const f = runFeedbackFrom(run('1'), { verdict: 'bad', note: 'Say the order number', final: 'Refunded $84 for order 12.' }, { source: 'inbox', by: 'ana@shop.com' })
    expect(f).toMatchObject({ verdict: 'bad', note: 'Say the order number', source: 'inbox', by: 'ana@shop.com' })
    expect(f.edit).not.toBe('none')
    expect(feedbackSourceOf('telegram')).toBe('telegram')
    expect(feedbackSourceOf('fax')).toBeUndefined()
  })
})

describe('a workflow’s feedback', () => {
  const runs = [
    run('1', { feedback: { verdict: 'good', edit: 'none', source: 'slack', at: '2026-11-21T00:00:00Z' } }),
    run('2', { feedback: { verdict: 'bad', note: 'Too long', source: 'inbox', by: 'ana', at: '2026-11-22T00:00:00Z' } }),
    run('3', { feedback: { final: 'Refunded $84 for order 12.', edit: 'light', source: 'api', at: '2026-11-23T00:00:00Z' } }),
    run('4'),
    run('5', { status: 'error' }),
  ]
  it('counts what people said and where it came from, newest first', () => {
    const s = feedbackSummary(runs, 30)
    expect(s).toMatchObject({ days: 30, runs: 4, total: 3, good: 1, bad: 1, edited: 1, actionable: 2, sources: { slack: 1, inbox: 1, api: 1 } })
    expect(s.items.map((i) => i.runId)).toEqual(['3', '2', '1'])
    expect(s.items[0].final).toContain('order 12')
    expect(isActionable({ verdict: 'good' })).toBe(false)
    expect(isActionable({ verdict: 'good', note: 'but shorter' })).toBe(true)
  })

  it('suggests changes from the feedback worth learning from, never repeating a criterion it has', async () => {
    let asked = ''
    const model = async (messages: { content: unknown }[]) => {
      asked = String(messages[0].content)
      return { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Here: {"summary":"Results run long.","changes":[{"what":"Keep replies under 80 words","why":"Marked too long"}],"instructions":"Refund the order.\\nKeep replies under 80 words.","criteria":[{"text":"The reply is under 80 words","kind":"judge"},{"text":"It states the amount","kind":"judge"},{"text":"Says sorry","kind":"contains"}],"open":["What is the refund window?"]}' }] }
    }
    const s = feedbackSummary(runs, 30)
    const sg = await suggestImprovements(model as never, { title: 'Refunds', instructions: 'Refund the order.', criteria: [{ text: 'It states the amount', kind: 'judge' }], tools: [], items: s.items })
    expect(asked).toContain('Too long')
    expect(asked).toContain('order 12')
    expect(sg.instructions).toContain('under 80 words')
    expect(sg.changes).toEqual([{ what: 'Keep replies under 80 words', why: 'Marked too long' }])
    // The one it has is left out; a phrase check with no phrase is judged.
    expect(sg.criteria.map((c) => [c.text, c.kind])).toEqual([['The reply is under 80 words', 'judge'], ['Says sorry', 'judge']])
    expect(sg.open).toEqual(['What is the refund window?'])
    expect(sg.basedOn).toBe(3)
  })

  it('refuses when there is nothing to learn from', async () => {
    const model = async () => ({ stop_reason: 'end_turn', content: [] })
    await expect(suggestImprovements(model as never, { title: 'R', instructions: 'x', criteria: [], tools: [], items: feedbackSummary([runs[0]], 30).items })).rejects.toThrow(/no feedback to learn from/)
  })
})
