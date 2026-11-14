import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readWorkflow, readWorkspacePolicies, setWorkflowFields, workflowRunMessage, writeWorkspacePolicies } from '#core/workflows.js'
import { addEvalCase, judgeEvalResult, readEvals, removeEvalCase, runFeedbackFrom, startEvalRound, workflowScores } from '#web/workflow-evidence.js'
import type { WorkflowRun } from '#core/workflow-runs.js'
import type { ModelCall } from '#core/run-agent.js'

function agentWithWorkflow(): string {
  const dir = mkdtempSync(join(tmpdir(), 'loopengine-contract-'))
  mkdirSync(join(dir, 'skills', 'reply'), { recursive: true })
  writeFileSync(join(dir, 'skills', 'reply', 'SKILL.md'), '---\nname: reply\ndescription: Draft a reply\nworkflow: true\nparameters:\n  order_number: { description: The order, required: true }\n---\n\nDraft a reply for order $order_number.\n')
  return dir
}

const run = (over: Partial<WorkflowRun> = {}): WorkflowRun => ({
  run_id: 'r1', agent: 'cs', workflow_id: 'reply', source: 'api', status: 'done', started_at: '2026-11-14T00:00:00Z', message: 'm', session_id: 's', result: 'Hi Ann, your parcel arrives Friday.', ...over,
})

describe('a workflow contract', () => {
  it('keeps its model and result format, a later edit without them keeps them, and drops an old lookups key', () => {
    const dir = agentWithWorkflow()
    writeFileSync(join(dir, 'skills', 'reply', 'SKILL.md'), '---\nname: reply\ndescription: Draft a reply\nworkflow: true\ngather:\n  - tool: get_order_details\n    input: { order_number: $order_number }\n---\n\nDraft a reply.\n')
    setWorkflowFields(dir, 'reply', { instructions: 'Draft a reply for order $order_number.', model: { provider: 'openai', model: 'gpt-6.1-sol' }, output: 'The draft only.' })
    expect(readWorkflow(dir, 'reply')).toMatchObject({ model: { provider: 'openai', model: 'gpt-6.1-sol' }, output: 'The draft only.' })
    expect(readFileSync(join(dir, 'skills', 'reply', 'SKILL.md'), 'utf8')).not.toContain('gather')
    setWorkflowFields(dir, 'reply', { instructions: 'Draft a short reply for order $order_number.' })
    expect(readWorkflow(dir, 'reply')).toMatchObject({ model: { model: 'gpt-6.1-sol' }, output: 'The draft only.' })
    setWorkflowFields(dir, 'reply', { instructions: 'Draft a reply.', model: null, output: '' })
    const cleared = readWorkflow(dir, 'reply')!
    expect(cleared.model).toBeUndefined()
    expect(cleared.output).toBeUndefined()
  })

  it('orders a run: inputs, instructions, shared policies, then the result format', () => {
    const dir = agentWithWorkflow()
    setWorkflowFields(dir, 'reply', { instructions: 'Draft a reply for order $order_number.', output: 'The draft only.', parameters: { order_number: { description: 'The order', required: true } } })
    const message = workflowRunMessage(readWorkflow(dir, 'reply')!, { order_number: 'EM-1' }, { policies: 'Refunds within 30 days.' })
    const at = (text: string) => message.indexOf(text)
    expect(at('order_number: EM-1')).toBeLessThan(at('Draft a reply for order EM-1.'))
    expect(at('Draft a reply for order EM-1.')).toBeLessThan(at('Refunds within 30 days.'))
    expect(at('Refunds within 30 days.')).toBeLessThan(at('The draft only.'))
  })

  it('keeps the workspace policies in policies.md', () => {
    const project = mkdtempSync(join(tmpdir(), 'loopengine-policies-'))
    expect(readWorkspacePolicies(project)).toBe('')
    writeWorkspacePolicies(project, '  Refunds within 30 days.\n')
    expect(readWorkspacePolicies(project)).toBe('Refunds within 30 days.')
  })
})

describe('a workflow evidence', () => {
  it('scores runs: outcomes, approvals and feedback', () => {
    const scores = workflowScores([
      run({ decisions: [{ tool: 'send', approved: true, at: '' }, { tool: 'send', approved: false, at: '' }], feedback: { verdict: 'good', edit: 'light', at: '' } }),
      run({ run_id: 'r2', status: 'error' }),
    ])
    expect(scores).toMatchObject({ runs: 2, done: 1, failed: 1, approvals: { approved: 1, refused: 1 }, feedback: { count: 1, good: 1, edits: { light: 1 } } })
  })

  it('measures how much the text actually used was edited', () => {
    expect(runFeedbackFrom(run(), { final: 'Hi Ann, your parcel arrives Friday.' })).toMatchObject({ edit: 'none' })
    expect(runFeedbackFrom(run(), { final: 'Dear Ann, sorry for the wait: we have refunded you in full today.', verdict: 'bad' })).toMatchObject({ edit: 'heavy', verdict: 'bad' })
    expect(() => runFeedbackFrom(run(), {})).toThrow(/final|verdict/)
    expect(() => runFeedbackFrom(run({ status: 'error' }), { verdict: 'good' })).toThrow(/finished/)
  })

  it('saves a past run as an eval case, runs the cases and scores each with a judge', async () => {
    const dir = agentWithWorkflow()
    addEvalCase(dir, 'reply', { run: run({ params: { order_number: 'EM-1' } }) })
    expect(() => addEvalCase(dir, 'reply', { run: run() })).toThrow(/already/)
    const judge: ModelCall = async () => ({ content: [{ type: 'text', text: '{"score": 4, "reason": "Right facts."}' }], stopReason: 'end_turn' } as never)
    const round = await startEvalRound({ agentDir: dir, workflowId: 'reply', instructions: 'Draft a reply.', model: 'deepseek v4', judgeLabel: 'openai gpt-6.1-sol', judge, runCase: async (params) => `Draft for ${params.order_number}` })
    expect(round).toMatchObject({ average: 4, cases: [{ score: 4, result: 'Draft for EM-1' }] })
    const evals = readEvals(dir, 'reply')
    expect(evals.running).toBeUndefined()
    expect(evals.rounds).toHaveLength(1)
    removeEvalCase(dir, 'reply', evals.cases[0]!.id)
    expect(readEvals(dir, 'reply').cases).toEqual([])
  })

  it('rejects a judge reply without a score', async () => {
    const judge: ModelCall = async () => ({ content: [{ type: 'text', text: 'Looks fine.' }], stopReason: 'end_turn' } as never)
    await expect(judgeEvalResult(judge, { instructions: '', reference: 'a', result: 'b' })).rejects.toThrow(/score/)
  })
})
