import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { WorkflowRun } from '#core/workflow-runs.js'
import { inboxOnlyAllows } from '#core/workspace-roles.js'
import { addEvalCase, evalCandidates, suggestedCriteria, type WorkflowEvals } from '#web/workflow-evidence.js'

let n = 0
function run(over: Partial<WorkflowRun> = {}): WorkflowRun {
  n++
  return { run_id: `r${n}`, agent: 'cs', workflow_id: 'disputes', source: 'webhook', status: 'done', started_at: `2026-11-${String(10 + n).padStart(2, '0')}T00:00:00.000Z`, message: 'm', session_id: `s${n}`, result: 'Submitted.', params: { dispute: `dp_${n}` }, ...over }
}
const none: WorkflowEvals = { cases: [], criteria: [], rounds: [] }

describe('choosing eval cases', () => {
  it('suggests success criteria from what people corrected in a run', () => {
    const r = run({
      decisions: [
        { tool: 'submit_evidence', approved: false, at: 'x', reason: 'No delivery photo.' },
        { tool: 'refund', approved: true, edited: true, at: 'x', before: { amount: 84 }, after: { amount: 42 } },
      ],
      feedback: { verdict: 'bad', note: 'Wrong tone', at: 'x' },
      answers: [{ question: 'Include the photo?', answer: 'Yes', at: 'x' }],
    })
    expect(suggestedCriteria(r).map((c) => c.text)).toEqual([
      'Doesn’t do what a person denied before (submit_evidence): “No delivery photo.”',
      'Gets amount right for refund: a person changed it from 84 to 42',
      'Avoids what made a result bad: “Wrong tone”',
      'Handles this without asking: “Include the photo?” (the answer was “Yes”)',
    ])
  })

  it('picks runs worth testing, corrected ones first, then a few typical ones, leaving out saved ones', () => {
    const typical1 = run()
    const denied = run({ decisions: [{ tool: 'submit_evidence', approved: false, at: 'x', reason: 'No photo' }] })
    const changed = run({ decisions: [{ tool: 'refund', approved: true, edited: true, at: 'x', before: { amount: 84 }, after: { amount: 42 } }] })
    const bad = run({ feedback: { verdict: 'bad', note: 'Wrong tone', at: 'x' } })
    const asked = run({ answers: [{ question: 'Which order?', answer: 'EM1', at: 'x' }] })
    const failed = run({ status: 'error', error: 'Stripe timed out', result: undefined })
    const sameInputs = run({ params: typical1.params })
    const savedAlready = run({ decisions: [{ tool: 'submit_evidence', approved: false, at: 'x' }] })
    const picked = evalCandidates([typical1, denied, changed, bad, asked, failed, sameInputs, savedAlready], { ...none, cases: [{ id: 'c1', params: {}, reference: '', fromRun: savedAlready.run_id, createdAt: 'x' }] })
    expect(picked.map((c) => [c.runId, c.why])).toEqual([
      [denied.run_id, 'denied'], [changed.run_id, 'changed'], [bad.run_id, 'bad'], [asked.run_id, 'asked'], [failed.run_id, 'failed'],
      [sameInputs.run_id, 'typical'],
    ])
    expect(picked[0].detail).toBe('Denied submit_evidence: “No photo”')
    expect(picked[1].detail).toBe('Changed amount 84 → 42 for refund')
  })

  it("saves a case's good result as the text a person actually used, when they edited it", () => {
    const dir = mkdtempSync(join(tmpdir(), 'loopengine-cand-'))
    mkdirSync(join(dir, 'skills', 'disputes'), { recursive: true })
    try {
      const c = addEvalCase(dir, 'disputes', { run: run({ result: 'Draft', feedback: { edit: 'light', final: 'Draft, fixed by Ana', at: 'x' } }) })
      expect(c.reference).toBe('Draft, fixed by Ana')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('runs for approvers and viewers', () => {
  it('open in the Inbox only: there is no case page', () => {
    expect(inboxOnlyAllows('GET', '/inbox/cases/r1')).toBe(true)
    expect(inboxOnlyAllows('GET', '/cases/r1')).toBe(false)
    expect(inboxOnlyAllows('GET', '/audit')).toBe(false)
  })
})

describe("a plan's success criteria", () => {
  it('keep their words and kinds, judge a tool check for a tool it does not use, and drop repeats', async () => {
    const { planCriteria } = await import('#core/system-agents/workflow-planner.js')
    expect(planCriteria([
      { text: 'Looks up the order first', kind: 'tool_called', value: 'lookup_order' },
      { text: 'Never emails the customer', kind: 'tool_not_called', value: 'send_fax' },
      { text: 'Signed Everymarket Support', kind: 'contains', value: 'Everymarket Support' },
      { text: 'States where the parcel is', kind: 'contains' },
      { text: 'states where the parcel is', kind: 'judge' },
      { text: '', kind: 'judge' },
    ], ['lookup_order', 'send_email'])).toEqual([
      { text: 'Looks up the order first', kind: 'tool_called', value: 'lookup_order' },
      { text: 'Never emails the customer', kind: 'judge' },
      { text: 'Signed Everymarket Support', kind: 'contains', value: 'Everymarket Support' },
      { text: 'States where the parcel is', kind: 'judge' },
    ])
  })
})
