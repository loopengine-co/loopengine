import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FileRunStore, WorkflowRunner, getRun, listRuns, setRunStore, type ExecuteRun } from '#core/workflow-runs.js'
import { FileSchedulerStore, Scheduler, createScheduledTask, getScheduledTask, listScheduledTasks, setSchedulerStore } from '#core/scheduler.js'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'loopengine-runs-'))
  setRunStore(new FileRunStore(dir))
  setSchedulerStore(new FileSchedulerStore(dir))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const input = { agent: 'cs', workflow_id: 'refund-check', params: { order_number: 'EM20-1' }, source: 'api' as const, message: 'Check the refund request for order EM20-1.' }

describe('workflow runs', () => {
  it('run once with the prepared message, and record the reply', async () => {
    const execute = vi.fn<ExecuteRun>(async () => ({ kind: 'done', text: 'Refunded $84.' }))
    const runner = new WorkflowRunner({ execute })

    const run = await runner.start(input)
    expect(run).toMatchObject({ status: 'running', workflow_id: 'refund-check', params: { order_number: 'EM20-1' }, source: 'api' })
    await runner.idle()

    expect(execute).toHaveBeenCalledWith('cs', 'Check the refund request for order EM20-1.', run.session_id, { workflowId: 'refund-check' })
    expect(await getRun('cs', run.run_id)).toMatchObject({ status: 'done', result: 'Refunded $84.', finished_at: expect.any(String) })
  })

  it('are kept apart from schedules', async () => {
    const runner = new WorkflowRunner({ execute: async () => ({ kind: 'done', text: 'ok' }) })
    await runner.start(input)
    await runner.idle()
    expect(await listScheduledTasks({ agent: 'cs' })).toEqual([])
  })

  it('record a failure with its reason', async () => {
    const runner = new WorkflowRunner({ execute: async () => { throw new Error('model unavailable') } })
    const run = await runner.start(input)
    await runner.idle()
    expect(await getRun('cs', run.run_id)).toMatchObject({ status: 'error', error: 'model unavailable' })
  })

  it('wait on an approval, then settle when the paused run resumes', async () => {
    const runner = new WorkflowRunner({ execute: async () => ({ kind: 'pending', pendingIds: ['p1'] }) })
    const run = await runner.start(input)
    await runner.idle()
    expect(await getRun('cs', run.run_id)).toMatchObject({ status: 'awaiting_approval', pending_ids: ['p1'] })

    await runner.settleFromResume(run.session_id, { text: 'Asked again', pendingIds: ['p2'] })
    expect(await getRun('cs', run.run_id)).toMatchObject({ status: 'awaiting_approval', pending_ids: ['p2'] })

    await runner.settleFromResume(run.session_id, { text: 'Refund approved and sent.' })
    expect(await getRun('cs', run.run_id)).toMatchObject({ status: 'done', result: 'Refund approved and sent.' })
    expect((await getRun('cs', run.run_id))?.pending_ids).toBeUndefined()

    // Another kind of session is none of its business.
    await expect(runner.settleFromResume('sched-abc', { text: 'x' })).resolves.toBeUndefined()
  })

  it('turn a run a restart cut off into an error, keeping one waiting on a decision', async () => {
    const hang = new WorkflowRunner({ execute: () => new Promise(() => {}) })
    const cut = await hang.start(input)
    const waiting = new WorkflowRunner({ execute: async () => ({ kind: 'pending', pendingIds: ['p1'] }) })
    const paused = await waiting.start({ ...input, params: { order_number: 'EM20-2' } })
    await waiting.idle()

    await new WorkflowRunner({ execute: async () => ({ kind: 'done', text: 'ok' }) }).recover()

    expect(await getRun('cs', cut.run_id)).toMatchObject({ status: 'error', error: 'The server restarted while this run was in progress.' })
    expect(await getRun('cs', paused.run_id)).toMatchObject({ status: 'awaiting_approval' })
  })

  it('are listed newest first, per agent and workflow, and hidden from other agents', async () => {
    const runner = new WorkflowRunner({ execute: async () => ({ kind: 'done', text: 'ok' }) })
    const first = await runner.start(input)
    await new Promise((r) => setTimeout(r, 5))
    const second = await runner.start({ ...input, workflow_id: 'weekly-digest' })
    const other = await runner.start({ ...input, agent: 'sales' })
    await runner.idle()

    expect((await listRuns('cs')).map((r) => r.run_id)).toEqual([second.run_id, first.run_id])
    expect((await listRuns('cs', { workflowId: 'refund-check' })).map((r) => r.run_id)).toEqual([first.run_id])
    expect(await getRun('cs', other.run_id)).toBeUndefined()
    expect(await getRun('cs', '../escape')).toBeUndefined()
  })

  it('keep only the latest finished runs per agent', async () => {
    const runner = new WorkflowRunner({ execute: async () => ({ kind: 'done', text: 'ok' }), maxFinishedPerAgent: 2 })
    const ids: string[] = []
    for (let i = 0; i < 4; i++) {
      ids.push((await runner.start(input)).run_id)
      await runner.idle()
      await new Promise((r) => setTimeout(r, 5))
    }
    // Each start prunes the finished runs beyond the limit before running,
    // so the fourth start dropped the first.
    expect((await listRuns('cs')).map((r) => r.run_id)).toEqual([ids[3], ids[2], ids[1]])
    await runner.start(input)
    expect((await listRuns('cs')).filter((r) => r.status === 'done')).toHaveLength(2)
    await runner.idle()
  })

  it('record a schedule firing a workflow as a run of it, and hand the scheduler its outcome', async () => {
    const runner = new WorkflowRunner({ execute: async () => ({ kind: 'done', text: 'Digest sent.' }) })
    const outcome = await runner.runForSchedule({ agent: 'cs', workflow_id: 'weekly-digest', params: { region: 'EU' }, task_id: 'task-1', task_name: 'EU digest', message: 'Write the EU digest.', session_id: 'sched-task1-1' })

    expect(outcome).toEqual({ kind: 'done', text: 'Digest sent.' })
    const [run] = await listRuns('cs', { workflowId: 'weekly-digest' })
    expect(run).toMatchObject({ source: 'schedule', task_id: 'task-1', task_name: 'EU digest', params: { region: 'EU' }, status: 'done', result: 'Digest sent.', session_id: 'sched-task1-1' })
  })

  it('record a scheduled run that fails, and still throw so the schedule records it', async () => {
    const runner = new WorkflowRunner({ execute: async () => { throw new Error('model unavailable') } })
    await expect(runner.runForSchedule({ agent: 'cs', workflow_id: 'weekly-digest', task_id: 'task-1', message: 'x', session_id: 'sched-task1-2' })).rejects.toThrow('model unavailable')
    expect(await listRuns('cs')).toMatchObject([{ source: 'schedule', status: 'error', error: 'model unavailable' }])
  })

  it('settle a scheduled run that paused, by its schedule session', async () => {
    const runner = new WorkflowRunner({ execute: async () => ({ kind: 'pending', pendingIds: ['p1'] }) })
    await runner.runForSchedule({ agent: 'cs', workflow_id: 'weekly-digest', task_id: 'task-1', message: 'x', session_id: 'sched-task1-3' })
    expect(await listRuns('cs')).toMatchObject([{ status: 'awaiting_approval', pending_ids: ['p1'] }])

    await runner.settleFromResume('sched-task1-3', { text: 'Approved and sent.' })
    expect(await listRuns('cs')).toMatchObject([{ status: 'done', result: 'Approved and sent.' }])
  })

  it('show up when the scheduler fires a workflow task', async () => {
    const runner = new WorkflowRunner({ execute: async (_agent, message) => ({ kind: 'done', text: `did: ${message}` }) })
    const scheduler = new Scheduler({
      fire: (task, sessionId) => runner.runForSchedule({ agent: task.agent, workflow_id: task.workflow_id!, params: task.params, task_id: task.task_id, task_name: task.task_name, message: task.message, session_id: sessionId }),
      resolveWorkflowMessage: (_agent, _id, params) => `Write the ${params.region} digest.`,
    })
    const task = await createScheduledTask({ agent: 'cs', workflow_id: 'weekly-digest', params: { region: 'US' }, schedule: { every: '1m' }, task_name: 'US digest' }, Date.now() - 2 * 60_000)

    await scheduler.tick()
    await new Promise((r) => setTimeout(r, 30))

    expect(await getScheduledTask(task.task_id)).toMatchObject({ last_status: 'ok', last_result: 'did: Write the US digest.' })
    expect(await listRuns('cs', { workflowId: 'weekly-digest' })).toMatchObject([{ source: 'schedule', task_id: task.task_id, task_name: 'US digest', params: { region: 'US' }, status: 'done' }])
  })
})
