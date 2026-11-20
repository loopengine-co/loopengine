import { describe, expect, it } from 'vitest'
import { startsOf, workflowsOverview } from '#web/workflows-overview.js'
import type { AgentWorkflowView } from '#web/workflow-admin.js'
import type { WorkflowRun } from '#core/workflow-runs.js'
import type { InboxItem } from '#web/inbox-admin.js'

const view = (over: Partial<AgentWorkflowView>): AgentWorkflowView =>
  ({ id: 'wf', title: 'Workflow', instructions: '', schedules: [], recentRuns: [], webhooks: 0, webhooksWaiting: 0, webhooksOff: 0, evals: [], scores: { runs: 0, done: 0, failed: 0, approvals: { approved: 2, refused: 1 }, feedback: { count: 0, good: 0, bad: 0, edits: { none: 0, light: 0, heavy: 0 } } }, ...over }) as unknown as AgentWorkflowView

const run = (over: Partial<WorkflowRun>): WorkflowRun => ({ run_id: 'r', agent: 'cs', workflow_id: 'disputes', status: 'done', started_at: '2026-11-19T10:00:00Z', ...over }) as WorkflowRun

describe('workflows overview', () => {
  it('says how a workflow starts, or Run now when nothing else starts it', () => {
    expect(startsOf(view({}))).toEqual(['Run now'])
    expect(startsOf(view({ schedules: [{ describe: 'Every Monday at 09:00', status: 'scheduled' }, { describe: 'Daily at 08:00', status: 'paused' }] as never, webhooks: 2, webhooksWaiting: 1 }))).toEqual([
      'Every Monday at 09:00', 'Daily at 08:00 (paused)', '2 webhooks', '1 webhook waiting for a secret',
    ])
  })

  it('counts this week\'s runs and failures, the last run and waiting cases, waiting ones first', () => {
    const now = new Date('2026-11-20T12:00:00Z')
    const runs = [
      run({ run_id: 'a', started_at: '2026-11-19T10:00:00Z' }),
      run({ run_id: 'b', started_at: '2026-11-20T09:00:00Z', status: 'error' }),
      run({ run_id: 'old', started_at: '2026-10-01T09:00:00Z' }),
      run({ run_id: 'c', agent: 'ops', workflow_id: 'orders', started_at: '2026-11-18T09:00:00Z' }),
    ]
    const waiting = [{ id: 'x', agent: 'ops', workflowId: 'orders', waiting: ['approval'] } as InboxItem]
    const out = workflowsOverview({
      now,
      runs,
      waiting,
      workflows: [
        { agent: 'cs', agentLabel: 'Support', view: view({ id: 'disputes', title: 'Handle a dispute' }) },
        { agent: 'ops', agentLabel: 'ops', view: view({ id: 'orders', title: 'Check orders' }) },
      ],
    })
    expect(out.workflows.map((w) => w.id)).toEqual(['orders', 'disputes'])
    expect(out.workflows[1]).toMatchObject({ runsThisWeek: 2, failedThisWeek: 1, lastRun: { status: 'error', at: '2026-11-20T09:00:00Z' }, waiting: 0, approved: 2, refused: 1, starts: ['Run now'] })
    expect(out.workflows[0]).toMatchObject({ waiting: 1, runsThisWeek: 1 })
    expect(out.workflows.map((w) => w.live)).toEqual([false, false])
    const live = workflowsOverview({ runs: [run({ status: 'running' })], waiting: [], workflows: [
      { agent: 'cs', agentLabel: 'cs', view: view({ id: 'disputes' }) },
      { agent: 'cs', agentLabel: 'cs', view: view({ id: 'weekly', schedules: [{ describe: 'Every Monday', status: 'scheduled' }] as never }) },
      { agent: 'cs', agentLabel: 'cs', view: view({ id: 'hooked', webhooks: 1 }) },
      { agent: 'cs', agentLabel: 'cs', view: view({ id: 'paused', schedules: [{ describe: 'Daily', status: 'paused' }] as never }) },
    ] })
    expect(Object.fromEntries(live.workflows.map((w) => [w.id, w.live]))).toEqual({ disputes: true, weekly: true, hooked: true, paused: false })
    expect(out.summary).toEqual({ workflows: 2, runsThisWeek: 3, failedThisWeek: 1, waiting: 1 })
  })
})
