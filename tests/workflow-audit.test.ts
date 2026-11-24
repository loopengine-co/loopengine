import { describe, expect, it } from 'vitest'
import type { Version } from '#core/audit-store.js'
import type { WorkflowRun } from '#core/workflow-runs.js'
import { buildWorkflowAudit, lineDiff } from '#web/workflow-audit.js'
import { workflowAuditReportHtml } from '#web/workflow-audit-report.js'

let n = 0
function run(at: string, brief: number, over: Partial<WorkflowRun> = {}): WorkflowRun {
  return { run_id: `r${++n}`, agent: 'cs', workflow_id: 'disputes', source: 'webhook', status: 'done', started_at: at, message: 'm', session_id: `s${n}`, versions: { brief }, ...over }
}
const deny = (by: string, reason: string) => ({ tool: 'submit_evidence', approved: false, at: '2026-11-10T00:00:00Z', by, reason })
const change = (by: string) => ({ tool: 'submit_evidence', approved: true, edited: true, at: '2026-11-10T00:00:00Z', by, before: { photo: false }, after: { photo: true } })
const ok = (by: string) => ({ tool: 'submit_evidence', approved: true, at: '2026-11-10T00:00:00Z', by })

const versions: Version[] = [
  { number: 1, at: '2026-10-01T00:00:00Z', reason: 'First version', content: 'Gather the order.\nSubmit evidence.' },
  { number: 2, at: '2026-11-15T00:00:00Z', by: 'ana@shop.com', reason: 'Edited in the console', content: 'Gather the order.\nAttach the delivery photo.\nSubmit evidence.' },
]

describe('a workflow audit', () => {
  const runs = [
    run('2026-11-02T00:00:00Z', 1, { params: { dispute: 'dp_1' }, decisions: [deny('ana@shop.com', 'No delivery photo')] }),
    run('2026-11-05T00:00:00Z', 1, { decisions: [change('ben@shop.com')] }),
    run('2026-11-08T00:00:00Z', 1, { decisions: [deny('ana@shop.com', 'Wrong order')], status: 'error', error: 'Stripe timed out' }),
    run('2026-11-16T00:00:00Z', 2, { decisions: [ok('ana@shop.com')], answers: [{ question: 'q', answer: 'a', at: 'x', by: 'ben@shop.com' }] }),
    run('2026-11-18T00:00:00Z', 2, { decisions: [ok('ana@shop.com')] }),
    run('2026-11-20T00:00:00Z', 2, { decisions: [ok('ben@shop.com')], feedback: { edit: 'none', at: 'x' } }),
  ]
  const audit = buildWorkflowAudit({
    workflow: { agent: 'cs', agentLabel: 'Support', id: 'disputes', title: 'Dispute evidence' },
    since: '2026-11-01T00:00:00Z', until: '2026-11-30T00:00:00Z',
    runs, costs: new Map([[runs[0].run_id, 0.02], [runs[1].run_id, 0.04]]), versions,
    changes: [{ id: 1, at: '2026-11-15T00:00:00Z', agent: 'cs', workflow_id: 'disputes', kind: 'change', by: 'ana@shop.com', data: { label: 'Edited the workflow' } }, { id: 2, at: '2026-11-21T00:00:00Z', agent: 'cs', workflow_id: 'disputes', kind: 'change', by: 'evany@shop.com', data: { label: 'Changed webhook triggers' } }],
    verification: { ok: true, events: 120, anchors: 3, anchoredAt: 'loopengine.co' },
  })

  it('counts runs and decisions, and who made them', () => {
    expect(audit.counts).toMatchObject({ runs: 6, done: 5, failed: 1, decided: 6, approved: 4, changed: 1, denied: 2, answered: 1, feedback: 1, unedited: 1 })
    expect(audit.people).toEqual([
      { by: 'ana@shop.com', approved: 2, changed: 0, denied: 2, answered: 0 },
      { by: 'ben@shop.com', approved: 1, changed: 1, denied: 0, answered: 1 },
    ])
    expect(audit.overruled.map((d) => [d.approved, d.reason ?? d.changes?.[0]])).toEqual([[false, 'No delivery photo'], [true, { field: 'photo', from: 'false', to: 'true' }], [false, 'Wrong order']])
    expect(audit.cost).toEqual({ totalUsd: 0.06, perRunUsd: 0.03, pricedRuns: 2 })
  })

  it('shows each brief version with its runs and what changed', () => {
    expect(audit.versions.map((v) => [v.number, v.changedInPeriod, v.counts.runs])).toEqual([[1, false, 3], [2, true, 3]])
    expect(audit.versions[1].diff).toEqual({ added: ['Attach the delivery photo.'], removed: [] })
  })

  it('says it in sentences, starting with whether the log checks out', () => {
    expect(audit.summary).toEqual([
      'The audit log checks out: 120 events verified, matching 3 anchors kept at loopengine.co.',
      '6 runs: 5 done, 1 failed (17% failed).',
      'People decided 6 requests: 3 approved as asked, 1 changed before approving, 2 denied.',
      'Reasons given for denials include “No delivery photo”, “Wrong order”.',
      'It asked, and people answered, 1 question.',
      'Feedback on 1 result: 1 used unedited, 0 marked bad.',
      'The brief changed to version 2 on Nov 15 by ana@shop.com, “Edited in the console” (1 line added, 0 removed); requests changed or denied went from 100% to 0%.',
      '1 other setting change: changed webhook triggers.',
      'It cost $0.060 in model calls (for the 2 runs with a known price), $0.030 a run.',
    ])
  })

  it('prints as a report with everything escaped', () => {
    const html = workflowAuditReportHtml({ ...audit, workflow: { ...audit.workflow, title: '<script>x</script>' } }, { generatedAt: '2026-11-30T00:00:00Z', by: 'evany@shop.com', jsonHref: '/j', caseHref: (id) => `/inbox?case=${id}`, pageHref: '/audit' })
    expect(html).toContain('Audit report: &lt;script&gt;x&lt;/script&gt;')
    expect(html).not.toContain('<script>x')
    expect(html).toContain('No delivery photo')
    expect(html).toContain('+ Attach the delivery photo.')
  })
})

describe('a workflow audit with many brief changes', () => {
  it('sums them up in one sentence, with the change from the first version that ran to the last', () => {
    const many: Version[] = [1, 2, 3, 4].map((k) => ({ number: k, at: `2026-11-0${k}T00:00:00Z`, by: k % 2 ? 'ana@shop.com' : 'ben@shop.com', reason: 'Edited in the console', content: `Step ${k}.` }))
    const runs = [
      ...[1, 2, 3].map(() => run('2026-11-01T12:00:00Z', 1, { decisions: [deny('ana@shop.com', 'Not yet.')] })),
      ...[1, 2, 3].map(() => run('2026-11-04T12:00:00Z', 4, { decisions: [ok('ana@shop.com')] })),
    ]
    const audit = buildWorkflowAudit({
      workflow: { agent: 'cs', agentLabel: 'Support', id: 'disputes', title: 'Dispute evidence' },
      since: '2026-11-01T00:00:00Z', until: '2026-11-30T00:00:00Z', runs, costs: new Map(), versions: many, changes: [],
      verification: { ok: true, events: 10, anchors: 0 },
    })
    expect(audit.summary).toContain('The brief changed 4 times to version 4, last on Nov 4, by ana@shop.com, ben@shop.com. From version 1 to 4, requests changed or denied went from 100% to 0%.')
    expect(audit.summary).toContain('Reasons given for denials include “Not yet”.')
  })
})

describe('lineDiff', () => {
  it('finds lines added and removed, in order', () => {
    expect(lineDiff('a\nb\nc', 'a\nc\nd')).toEqual({ added: ['d'], removed: ['b'] })
  })
})
