import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readWorkflow, readWorkspacePolicies, setWorkflowFields, workflowRunMessage, writeWorkspacePolicies } from '#core/workflows.js'
import { addEvalCase, checkCase, codeCheck, draftCriteria, readEvals, removeEvalCase, runFeedbackFrom, setEvalCriteria, startEvalRound, updateEvalCase, workflowScores } from '#web/workflow-evidence.js'
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

  const judgeSays = (text: string): ModelCall => async () => ({ content: [{ type: 'text', text }], stopReason: 'end_turn' } as never)

  it("fills a case's expected result only from what a person stood behind", () => {
    const dir = agentWithWorkflow()
    const plain = addEvalCase(dir, 'reply', { run: run({ run_id: 'r-plain', result: 'Whatever it said' }) })
    expect(plain.reference).toBe('')
    const bad = addEvalCase(dir, 'reply', { run: run({ run_id: 'r-bad', result: 'Wrong', feedback: { verdict: 'bad' } as never }) })
    expect(bad.reference).toBe('')
    const good = addEvalCase(dir, 'reply', { run: run({ run_id: 'r-good', result: 'Right', feedback: { verdict: 'good' } as never }) })
    expect(good.reference).toBe('Right')
    const edited = addEvalCase(dir, 'reply', { run: run({ run_id: 'r-edit', result: 'Draft', feedback: { verdict: 'bad', final: 'What was sent' } as never }) })
    expect(edited.reference).toBe('What was sent')
  })

  it('saves a past run as an eval case and, with no criteria set, checks results against its expected result', async () => {
    const dir = agentWithWorkflow()
    addEvalCase(dir, 'reply', { run: run({ params: { order_number: 'EM-1' }, feedback: { verdict: 'good' } as never }) })
    expect(() => addEvalCase(dir, 'reply', { run: run() })).toThrow(/already/)
    const round = await startEvalRound({ agentDir: dir, workflowId: 'reply', instructions: 'Draft a reply.', model: 'deepseek v4', judgeLabel: 'openai gpt-6.1-sol', judge: judgeSays('{"checks": [{"id": "reference", "pass": true}]}'), runCase: async ({ params }) => ({ result: `Draft for ${params.order_number}`, tools: [] }) })
    expect(round).toMatchObject({ allPassed: 1, passRates: [{ criterionId: 'reference', passed: 1, total: 1 }], cases: [{ result: 'Draft for EM-1', checks: [{ criterionId: 'reference', pass: true }] }] })
    const evals = readEvals(dir, 'reply')
    expect(evals.running).toBeUndefined()
    expect(evals.rounds).toHaveLength(1)
    removeEvalCase(dir, 'reply', evals.cases[0]!.id)
    expect(readEvals(dir, 'reply').cases).toEqual([])
  })

  it("tests a draft with its own criteria, recorded as the draft's round, not a version's", async () => {
    const dir = agentWithWorkflow()
    addEvalCase(dir, 'reply', { params: { order_number: 'EM-1' } })
    const round = await startEvalRound({
      agentDir: dir, workflowId: 'reply', instructions: 'Draft a better reply.', model: 'm', judgeLabel: 'j', judge: judgeSays('{"checks": []}'),
      draft: { savedAt: '2026-11-27T10:00:00.000Z' },
      criteria: [{ id: 'signed', text: 'Signed by Support', kind: 'contains', value: 'Everymarket Support' }],
      runCase: async () => ({ result: 'Thanks. Everymarket Support', tools: [] }),
    })
    expect(round.draft).toEqual({ savedAt: '2026-11-27T10:00:00.000Z' })
    expect(round.workflowVersion).toBeUndefined()
    expect(round.criteria!.map((c) => c.id)).toEqual(['signed'])
    expect(round.allPassed).toBe(1)
    // The saved criteria are untouched: the draft's were only tested.
    expect(readEvals(dir, 'reply').criteria).toEqual([])
  })

  it("checks the published version on a draft's criteria by judging its saved results again, without running it", async () => {
    const dir = agentWithWorkflow()
    const added = addEvalCase(dir, 'reply', { params: { order_number: 'EM-1' } })
    let runs = 0
    const round = await startEvalRound({
      agentDir: dir, workflowId: 'reply', instructions: 'Draft a reply.', model: 'm', judgeLabel: 'j', judge: judgeSays('{"checks": []}'),
      workflowVersion: 4, forDraft: { savedAt: '2026-11-27T10:00:00.000Z' },
      criteria: [{ id: 'signed', text: 'Signed by Support', kind: 'contains', value: 'Everymarket Support' }],
      reuse: { [added.id]: { result: 'Thanks. Everymarket Support', tools: [] } },
      runCase: async () => { runs++; return { result: 'should not run', tools: [] } },
    })
    expect(runs).toBe(0)
    expect(round).toMatchObject({ workflowVersion: 4, forDraft: { savedAt: '2026-11-27T10:00:00.000Z' }, allPassed: 1 })
    expect(round.draft).toBeUndefined()
  })

  it('checks every criterion: code checks by program, the rest by the judge in one call, a crash failing them all', async () => {
    const dir = agentWithWorkflow()
    setEvalCriteria(dir, 'reply', [
      { id: 'tracking', text: 'Gives the tracking number', kind: 'judge' },
      { id: 'signed', text: 'Signed by Support', kind: 'contains', value: 'Everymarket Support' },
      { id: 'no-refund', text: "Doesn't refund", kind: 'tool_not_called', value: 'issue_refund' },
      { id: 'reference', text: 'Matches the good result', kind: 'reference' },
    ])
    addEvalCase(dir, 'reply', { params: { order_number: 'EM-1' } })
    addEvalCase(dir, 'reply', { params: { order_number: 'EM-2' }, reference: 'Tracking 1Z9; Everymarket Support' })
    addEvalCase(dir, 'reply', { params: { order_number: 'EM-3' } })
    let judgeCalls = 0
    const judge: ModelCall = async (messages) => {
      judgeCalls++
      const asked = String(messages[0]!.content)
      // Only judge criteria go to the judge, and the reference check only
      // for the case that has a good result.
      expect(asked).toContain('tracking:')
      expect(asked).not.toContain('signed:')
      return judgeSays(asked.includes('reference:') ? '{"checks": [{"id": "tracking", "pass": true}, {"id": "reference", "pass": false, "reason": "Wrong carrier."}]}' : '{"checks": [{"id": "tracking", "pass": false, "reason": "No number."}]}')([], '', [])
    }
    const round = await startEvalRound({
      agentDir: dir, workflowId: 'reply', instructions: 'Draft a reply.', model: 'm', judgeLabel: 'j', judge,
      runCase: async ({ params }) => {
        if (params.order_number === 'EM-3') throw new Error('timeout')
        return params.order_number === 'EM-1' ? { result: 'We will look into it.', tools: ['issue_refund'] } : { result: 'Tracking 1Z9. Everymarket Support', tools: [] }
      },
    })
    expect(judgeCalls).toBe(2)
    const byCase = (n: number) => Object.fromEntries(round.cases[n]!.checks!.map((c) => [c.criterionId, c.pass]))
    expect(byCase(0)).toEqual({ tracking: false, signed: false, 'no-refund': false })
    expect(byCase(1)).toEqual({ tracking: true, signed: true, 'no-refund': true, reference: false })
    expect(byCase(2)).toEqual({ tracking: false, signed: false, 'no-refund': false })
    expect(round.cases[2]!.checks![0]!.reason).toMatch(/run failed: timeout/)
    expect(round.passRates).toEqual([
      { criterionId: 'tracking', passed: 1, total: 3 },
      { criterionId: 'signed', passed: 1, total: 3 },
      { criterionId: 'no-refund', passed: 1, total: 3 },
      { criterionId: 'reference', passed: 0, total: 1 },
    ])
    expect(round.allPassed).toBe(0)
  })

  it('validates criteria and lets a case drop its good result', () => {
    const dir = agentWithWorkflow()
    expect(() => setEvalCriteria(dir, 'reply', [{ text: '', kind: 'judge' }])).toThrow(/words/)
    expect(() => setEvalCriteria(dir, 'reply', [{ text: 'Signed', kind: 'contains' }])).toThrow(/text to look for/)
    expect(() => setEvalCriteria(dir, 'reply', Array.from({ length: 9 }, (_, i) => ({ text: `c${i}`, kind: 'judge' })))).toThrow(/8 criteria/)
    expect(() => addEvalCase(dir, 'reply', {})).toThrow(/inputs, an expected result/)
    const c = addEvalCase(dir, 'reply', { params: { order_number: 'EM-9' }, reference: 'x' })
    updateEvalCase(dir, 'reply', c.id, '')
    expect(readEvals(dir, 'reply').cases[0]!.reference).toBe('')
    expect(codeCheck({ id: 'a', text: '', kind: 'not_contains', value: 'REFUND' }, { result: 'no refund here', tools: [] })).toMatchObject({ pass: false })
  })

  it('treats a judge that answers nothing as failing its checks, and tells why', async () => {
    const checks = await checkCase(judgeSays('Looks fine.'), { instructions: '', criteria: [{ id: 'a', text: 'x', kind: 'judge' }], reference: '', run: { result: 'b', tools: [] } })
    expect(checks).toEqual([{ criterionId: 'a', pass: false, reason: 'The judge did not answer the checks.' }])
  })

  it('drafts criteria from the brief, judging a tool or phrase check it can\'t back', async () => {
    const drafted = await draftCriteria(judgeSays('{"criteria": [{"text": "Gives tracking", "kind": "judge"}, {"text": "Looks up the order", "kind": "tool_called", "value": "lookup_order"}, {"text": "Refunds", "kind": "tool_called", "value": "made_up_tool"}]}'), { instructions: 'Reply with tracking.', tools: ['lookup_order'] })
    expect(drafted.map((c) => [c.kind, c.value])).toEqual([['judge', undefined], ['tool_called', 'lookup_order'], ['judge', undefined]])
  })
})
