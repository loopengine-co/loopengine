import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  FileSchedulerStore, Scheduler, ScheduleError, cancelScheduledTask, createScheduledTask, getScheduledTask, importLegacyScheduledTasks,
  listScheduledTasks, nextScheduledWakeAt, pauseScheduledTask, resumeScheduledTask, runScheduledTaskNow, setSchedulerStore, type FireTask,
} from '#core/scheduler.js'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'loopengine-scheduler-'))
  setSchedulerStore(new FileSchedulerStore(dir))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const HOUR = 3_600_000
const flush = () => new Promise((r) => setTimeout(r, 20))

describe('creating tasks', () => {
  it('validates the schedule and anchors "every" to the first run', async () => {
    const now = Date.parse('2026-10-12T10:07:00Z')
    const task = await createScheduledTask({ agent: 'a', message: 'hi', schedule: { every: '1h' } }, now)
    expect(task.next_run_at).toBe('2026-10-12T11:07:00.000Z')
    expect(task.schedule).toEqual({ every: '1h', anchor: '2026-10-12T11:07:00.000Z' })
    await expect(createScheduledTask({ agent: 'a', message: 'hi', schedule: { every: '5s' } })).rejects.toThrow(/too short/)
    await expect(createScheduledTask({ agent: 'a', message: 'hi', schedule: { run_at: 'tomorrow' } })).rejects.toThrow(ScheduleError)
    await expect(createScheduledTask({ agent: 'a', message: ' ', schedule: { every: '1h' } })).rejects.toThrow(/message/)
  })

  it('starts a repeating task at start_at, so it keeps that time of day or weekday', async () => {
    const now = Date.parse('2026-10-28T15:30:00+08:00') // a Wednesday afternoon
    // Daily at 9:00 (UTC+8), starting tomorrow.
    const daily = await createScheduledTask({ agent: 'a', message: 'digest', schedule: { every: '1d', start_at: '2026-10-29T09:00:00+08:00' } }, now)
    expect(daily.next_run_at).toBe('2026-10-29T01:00:00.000Z')
    expect(daily.schedule).toEqual({ every: '1d', anchor: '2026-10-29T01:00:00.000Z' })
    // Weekly on Mondays at 9:00.
    const weekly = await createScheduledTask({ agent: 'a', message: 'weekly', schedule: { every: '7d', start_at: '2026-11-02T09:00:00+08:00' } }, now)
    expect(weekly.next_run_at).toBe('2026-11-02T01:00:00.000Z')
    // A start in the past: the next slot after now, still at 9:00.
    const past = await createScheduledTask({ agent: 'a', message: 'p', schedule: { every: '1d', start_at: '2026-10-01T09:00:00+08:00' } }, now)
    expect(past.next_run_at).toBe('2026-10-29T01:00:00.000Z')
    expect(past.schedule).toEqual({ every: '1d', anchor: '2026-10-01T01:00:00.000Z' })
    await expect(createScheduledTask({ agent: 'a', message: 'x', schedule: { every: '1d', start_at: 'next monday' } })).rejects.toThrow(/start_at "next monday" is not a valid/)
    await expect(createScheduledTask({ agent: 'a', message: 'x', schedule: { start_at: '2026-11-02T09:00:00Z' } })).rejects.toThrow(/start_at goes with "every"/)
  })

  it('keeps the start_at slot after a pause and a late resume', async () => {
    const now = Date.parse('2026-10-28T15:30:00+08:00')
    const task = await createScheduledTask({ agent: 'a', message: 'digest', schedule: { every: '1d', start_at: '2026-10-29T09:00:00+08:00' } }, now)
    await pauseScheduledTask(task.task_id)
    // Resumed on Nov 3 at 20:00 (UTC+8): next run is Nov 4 at 9:00.
    const resumed = await resumeScheduledTask(task.task_id, Date.parse('2026-11-03T20:00:00+08:00'))
    expect(resumed.next_run_at).toBe('2026-11-04T01:00:00.000Z')
  })
})

describe('Scheduler', () => {
  it('fires a due one-off once and marks it done with the reply', async () => {
    const fire = vi.fn<FireTask>(async () => ({ kind: 'done', text: 'sent the report' }))
    const settled = vi.fn()
    const scheduler = new Scheduler({ fire, onSettled: settled })
    const task = await createScheduledTask({ agent: 'a', message: 'report', schedule: { run_at: new Date(Date.now() - 1000).toISOString() } })

    expect(await scheduler.tick()).toBe(1)
    await flush()
    const after = await getScheduledTask(task.task_id)
    expect(after).toMatchObject({ status: 'done', run_count: 1, last_status: 'ok', last_result: 'sent the report' })
    expect(after?.next_run_at).toBeUndefined()
    expect(settled).toHaveBeenCalledWith(expect.objectContaining({ task_id: task.task_id }), expect.objectContaining({ status: 'ok' }))
    expect(await scheduler.tick()).toBe(0)
  })

  it('keeps a late recurring task on its anchored slots instead of drifting or bursting', async () => {
    const created = Date.parse('2026-10-12T10:07:00Z')
    const task = await createScheduledTask({ agent: 'a', message: 'x', schedule: { every: '1h' } }, created)
    const scheduler = new Scheduler({ fire: async () => ({ kind: 'done', text: 'ok' }) })
    vi.useFakeTimers({ now: created + 3.5 * HOUR, toFake: ['Date'] })
    expect(await scheduler.tick()).toBe(1)
    await flush()
    vi.useRealTimers()
    expect((await getScheduledTask(task.task_id))?.next_run_at).toBe('2026-10-12T14:07:00.000Z')
  })

  it('records an error and still schedules the next run', async () => {
    const scheduler = new Scheduler({ fire: async () => { throw new Error('model unavailable') } })
    const task = await createScheduledTask({ agent: 'a', message: 'x', schedule: { every: '1m' } }, Date.now() - 2 * 60_000)
    await scheduler.tick()
    await flush()
    expect(await getScheduledTask(task.task_id)).toMatchObject({ status: 'scheduled', last_status: 'error', last_error: 'model unavailable' })
  })

  it('waits on an approval, then settles when the paused run resumes', async () => {
    let sessionId = ''
    const scheduler = new Scheduler({ fire: async (_t, s) => { sessionId = s; return { kind: 'pending', pendingIds: ['p1'] } } })
    const task = await createScheduledTask({ agent: 'a', message: 'refund', schedule: { run_at: new Date(Date.now() - 1).toISOString() } })
    await scheduler.tick()
    await flush()
    expect(await getScheduledTask(task.task_id)).toMatchObject({ status: 'awaiting_approval', pending: { pending_ids: ['p1'] } })

    await scheduler.settleFromResume(sessionId, { text: 'still need one more', pendingIds: ['p2'] })
    expect((await getScheduledTask(task.task_id))?.pending?.pending_ids).toEqual(['p2'])
    await scheduler.settleFromResume(sessionId, { text: 'Refund done.' })
    expect(await getScheduledTask(task.task_id)).toMatchObject({ status: 'done', last_result: 'Refund done.' })
    await scheduler.settleFromResume('not-a-scheduled-session', { text: 'x' })
  })

  it('turns a run a restart cut off into an error on start', async () => {
    const task = await createScheduledTask({ agent: 'a', message: 'x', schedule: { every: '1h' } })
    const store = new FileSchedulerStore(dir)
    await store.put({ ...(await store.get(task.task_id))!, status: 'running' })
    const scheduler = new Scheduler({ fire: async () => ({ kind: 'done', text: '' }), tickMs: 60_000 })
    await scheduler.start()
    scheduler.stop()
    expect(await getScheduledTask(task.task_id)).toMatchObject({ status: 'scheduled', last_status: 'error', last_error: expect.stringMatching(/restarted/) })
  })
})

describe('pause, resume, run now, cancel, wake time', () => {
  it('controls a task without losing its schedule', async () => {
    const scheduler = new Scheduler({ fire: async () => ({ kind: 'done', text: 'ran' }) })
    const task = await createScheduledTask({ agent: 'a', message: 'x', schedule: { every: '1h' } })
    expect(await nextScheduledWakeAt()).toBe(task.next_run_at)

    expect((await pauseScheduledTask(task.task_id)).status).toBe('paused')
    expect(await nextScheduledWakeAt()).toBeUndefined()
    await runScheduledTaskNow(task.task_id)
    await scheduler.tick()
    await flush()
    expect(await getScheduledTask(task.task_id)).toMatchObject({ status: 'paused', run_count: 1 })

    const resumed = await resumeScheduledTask(task.task_id)
    expect(resumed.status).toBe('scheduled')
    expect(Date.parse(resumed.next_run_at!)).toBeGreaterThan(Date.now())
    expect((await cancelScheduledTask(task.task_id)).status).toBe('cancelled')
    expect(await listScheduledTasks({ status: 'cancelled' })).toHaveLength(1)
  })
})

describe('importLegacyScheduledTasks', () => {
  it('moves the old ability’s task files in once', async () => {
    const legacy = join(dir, 'legacy')
    mkdirSync(join(legacy, '.tasks'), { recursive: true })
    const old = { task_id: 'old-1', agent: 'a', message: 'x', schedule: { every: '1d' }, status: 'scheduled', created_at: '2026-01-01T00:00:00.000Z', next_run_at: '2026-10-13T09:00:00.000Z', run_count: 3, history: [] }
    writeFileSync(join(legacy, '.tasks', 'old-1.json'), JSON.stringify(old))
    expect(await importLegacyScheduledTasks(legacy)).toBe(1)
    expect(await importLegacyScheduledTasks(legacy)).toBe(0)
    expect(existsSync(join(legacy, '.tasks', 'old-1.json.migrated'))).toBe(true)
    expect((await getScheduledTask('old-1'))?.schedule).toEqual({ every: '1d', anchor: '2026-10-13T09:00:00.000Z' })
  })
})
