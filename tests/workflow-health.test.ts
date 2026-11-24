import { describe, expect, it } from 'vitest'
import type { WorkflowRun } from '#core/workflow-runs.js'
import { healthAlerts, workflowHealth } from '#web/workflow-health.js'

const NOW = Date.parse('2026-11-24T12:00:00Z')
const DAY = 24 * 60 * 60 * 1000
let n = 0
function run(daysAgo: number, over: Partial<WorkflowRun> = {}): WorkflowRun {
  const started = new Date(NOW - daysAgo * DAY).toISOString()
  return { run_id: `r${++n}`, agent: 'cs', workflow_id: 'refunds', source: 'api', status: 'done', started_at: started, finished_at: new Date(Date.parse(started) + 60_000).toISOString(), message: 'm', session_id: `s${n}`, ...over }
}

describe('workflow health', () => {
  it('counts the period per brief version, with cost and time', () => {
    const runs = [
      run(20, { versions: { brief: 1 }, decisions: [{ tool: 'refund', approved: false, at: 'x' }] }),
      run(10, { versions: { brief: 2 }, decisions: [{ tool: 'refund', approved: true, edited: true, at: 'x' }], answers: [{ question: 'q', answer: 'a', at: 'x' }] }),
      run(2, { versions: { brief: 2 }, status: 'error', feedback: { verdict: 'bad', at: 'x' } }),
      run(40, { versions: { brief: 1 } }),
    ]
    const h = workflowHealth(runs, new Map([[runs[1].run_id, 0.02], [runs[2].run_id, 0.04]]), { now: NOW })
    expect(h.total).toMatchObject({ runs: 3, failed: 1, approved: 1, changed: 1, denied: 1, questions: 1, feedback: 1, bad: 1, medianMs: 60_000 })
    expect(h.total.costPerRunUsd).toBeCloseTo(0.03)
    expect(h.versions.map((v) => [v.version, v.runs, v.failed])).toEqual([[2, 2, 1], [1, 1, 0]])
    expect(h.daily).toHaveLength(30)
    expect(h.daily.at(-3)).toMatchObject({ runs: 1, failed: 1 })
  })

  it('alerts when a rate at least doubles on enough cases', () => {
    const before = Array.from({ length: 10 }, (_, i) => run(10 + i, { status: i === 0 ? 'error' : 'done' }))
    const recent = Array.from({ length: 5 }, (_, i) => run(i + 1, { status: i < 2 ? 'error' : 'done' }))
    expect(healthAlerts([...before, ...recent], NOW)).toEqual([expect.objectContaining({ measure: 'failure', text: '40% of runs failed in the last 7 days, up from 10%.' })])
    // Too few recent cases: no alert.
    expect(healthAlerts([...before, ...recent.slice(0, 4)], NOW)).toEqual([])
  })
})
