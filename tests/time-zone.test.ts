import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FileSchedulerStore, Scheduler, createScheduledTask, getScheduledTask, moveScheduledTasksToTimeZone, pauseScheduledTask, resumeScheduledTask, setSchedulerStore } from '#core/scheduler.js'
import { TIME_ZONE_ENV, addCalendarDays, instantOf, nextTimeOfDay, parseTimestamp, workspaceTimeZone } from '#core/time-zone.js'
import { templateScheduleStart } from '#core/system-agents/templates.js'

const NY = 'America/New_York'

let dir: string
let savedZone: string | undefined
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'loopengine-tz-'))
  setSchedulerStore(new FileSchedulerStore(dir))
  savedZone = process.env[TIME_ZONE_ENV]
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
  if (savedZone === undefined) delete process.env[TIME_ZONE_ENV]
  else process.env[TIME_ZONE_ENV] = savedZone
})

describe('time zone arithmetic', () => {
  it('turns a wall-clock time into the right instant either side of a clock change', () => {
    // New York: EDT (-4) until 1 Nov 2026 02:00, EST (-5) after.
    expect(new Date(instantOf({ year: 2026, month: 10, day: 30, hour: 9, minute: 0, second: 0 }, NY)).toISOString()).toBe('2026-10-30T13:00:00.000Z')
    expect(new Date(instantOf({ year: 2026, month: 11, day: 2, hour: 9, minute: 0, second: 0 }, NY)).toISOString()).toBe('2026-11-02T14:00:00.000Z')
    // 01:30 happens twice on 1 Nov: the first one.
    expect(new Date(instantOf({ year: 2026, month: 11, day: 1, hour: 1, minute: 30, second: 0 }, NY)).toISOString()).toBe('2026-11-01T05:30:00.000Z')
    // 02:30 doesn't happen on 8 Mar 2026: an hour later, 03:30 EDT.
    expect(new Date(instantOf({ year: 2026, month: 3, day: 8, hour: 2, minute: 30, second: 0 }, NY)).toISOString()).toBe('2026-03-08T07:30:00.000Z')
    // A zone ahead of UTC.
    expect(new Date(instantOf({ year: 2026, month: 10, day: 29, hour: 9, minute: 0, second: 0 }, 'Asia/Shanghai')).toISOString()).toBe('2026-10-29T01:00:00.000Z')
  })

  it('reads a timestamp without an offset in the given zone, and one with an offset exactly', () => {
    expect(new Date(parseTimestamp('2026-11-02T09:00', NY)).toISOString()).toBe('2026-11-02T14:00:00.000Z')
    expect(new Date(parseTimestamp('2026-11-02T09:00:00+08:00', NY)).toISOString()).toBe('2026-11-02T01:00:00.000Z')
    expect(new Date(parseTimestamp('2026-11-02T09:00:00Z', NY)).toISOString()).toBe('2026-11-02T09:00:00.000Z')
    expect(parseTimestamp('tomorrow', NY)).toBeNaN()
    expect(parseTimestamp('2026-13-02T09:00', NY)).toBeNaN()
  })

  it('finds the next time of day, and keeps it when stepping over a clock change', () => {
    const wednesday = Date.parse('2026-10-28T19:30:00Z') // 15:30 in New York
    expect(new Date(nextTimeOfDay([9, 0], wednesday, NY)).toISOString()).toBe('2026-10-29T13:00:00.000Z')
    expect(new Date(nextTimeOfDay([16, 0], wednesday, NY)).toISOString()).toBe('2026-10-28T20:00:00.000Z')
    // Next Monday 9:00 is after the change, so 14:00 UTC.
    expect(new Date(nextTimeOfDay([9, 0], wednesday, NY, 1)).toISOString()).toBe('2026-11-02T14:00:00.000Z')
    expect(new Date(addCalendarDays(Date.parse('2026-10-31T13:00:00Z'), 2, NY)).toISOString()).toBe('2026-11-02T14:00:00.000Z')
  })

  it("falls back to the server's zone when none is set or the setting is wrong", () => {
    delete process.env[TIME_ZONE_ENV]
    const server = Intl.DateTimeFormat().resolvedOptions().timeZone
    expect(workspaceTimeZone()).toBe(server)
    process.env[TIME_ZONE_ENV] = 'Not/AZone'
    expect(workspaceTimeZone()).toBe(server)
    process.env[TIME_ZONE_ENV] = NY
    expect(workspaceTimeZone()).toBe(NY)
  })
})

describe('schedules in the workspace time zone', () => {
  it('starts "at" a time of day there, and a daily task stays at that time after the clocks change', async () => {
    process.env[TIME_ZONE_ENV] = NY
    const now = Date.parse('2026-10-30T19:30:00Z') // Friday 15:30 in New York
    const task = await createScheduledTask({ agent: 'a', message: 'digest', schedule: { every: '1d', at: '09:00' } }, now)
    expect(task.next_run_at).toBe('2026-10-31T13:00:00.000Z')
    expect(task.schedule).toEqual({ every: '1d', anchor: '2026-10-31T13:00:00.000Z', time_zone: NY })

    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      const fire = vi.fn(async () => ({ kind: 'done' as const, text: 'ok' }))
      const scheduler = new Scheduler({ fire, tickMs: 60_000 })
      // Saturday's run, then Sunday's (the day the clocks go back).
      vi.setSystemTime(Date.parse('2026-10-31T13:00:01Z'))
      await scheduler.tick()
      await new Promise((r) => setImmediate(r))
      await vi.waitFor(async () => expect((await getScheduledTask(task.task_id))!.run_count).toBe(1))
      expect((await getScheduledTask(task.task_id))!.next_run_at).toBe('2026-11-01T14:00:00.000Z')
    } finally {
      vi.useRealTimers()
    }
  })

  it('takes a weekday by name, and reads a start without an offset in the workspace zone', async () => {
    process.env[TIME_ZONE_ENV] = NY
    const now = Date.parse('2026-10-28T19:30:00Z')
    const weekly = await createScheduledTask({ agent: 'a', message: 'w', schedule: { every: '7d', at: '9:00', weekday: 'mon' } }, now)
    expect(weekly.next_run_at).toBe('2026-11-02T14:00:00.000Z')
    const once = await createScheduledTask({ agent: 'a', message: 'o', schedule: { run_at: '2026-11-02T09:00' } }, now)
    expect(once.next_run_at).toBe('2026-11-02T14:00:00.000Z')
    // Hourly tasks are exact durations: no zone kept.
    const hourly = await createScheduledTask({ agent: 'a', message: 'h', schedule: { every: '1h', start_at: '2026-10-29T09:00' } }, now)
    expect(hourly.schedule).toEqual({ every: '1h', anchor: '2026-10-29T13:00:00.000Z' })
    await expect(createScheduledTask({ agent: 'a', message: 'x', schedule: { every: '1d', at: '25:00' } }, now)).rejects.toThrow(/HH:MM/)
    await expect(createScheduledTask({ agent: 'a', message: 'x', schedule: { every: '7d', weekday: 'monday' } }, now)).rejects.toThrow(/goes with at/)
    await expect(createScheduledTask({ agent: 'a', message: 'x', schedule: { every: '7d', at: '09:00', weekday: 'someday' } }, now)).rejects.toThrow(/isn't a day/)
    await expect(createScheduledTask({ agent: 'a', message: 'x', schedule: { every: '1d', at: '09:00', start_at: '2026-10-29T09:00' } }, now)).rejects.toThrow(/either/)
  })

  it("works a template's start out in the workspace zone", () => {
    const now = Date.parse('2026-10-28T19:30:00Z')
    expect(templateScheduleStart({ every: '7d', at: '09:00', weekday: 1, name: 'x', message: 'x' }, now, NY)).toBe('2026-11-02T14:00:00.000Z')
    expect(templateScheduleStart({ every: '1d', at: '09:00', name: 'x', message: 'x' }, now, 'Asia/Shanghai')).toBe('2026-10-29T01:00:00.000Z')
  })

  it('moves daily and weekly schedules to a new zone, keeping their time of day, and leaves the rest', async () => {
    process.env[TIME_ZONE_ENV] = 'UTC'
    const now = Date.parse('2026-10-28T08:00:00Z')
    const daily = await createScheduledTask({ agent: 'a', message: 'd', schedule: { every: '1d', at: '09:00' } }, now)
    const paused = await createScheduledTask({ agent: 'a', message: 'p', schedule: { every: '7d', at: '09:00', weekday: 'monday' } }, now)
    await pauseScheduledTask(paused.task_id)
    const hourly = await createScheduledTask({ agent: 'a', message: 'h', schedule: { every: '1h' } }, now)
    const once = await createScheduledTask({ agent: 'a', message: 'o', schedule: { run_at: '2026-10-29T09:00:00Z' } }, now)
    // A task from before tasks kept their zone.
    const old = await createScheduledTask({ agent: 'a', message: 'old', schedule: { every: '1d', at: '10:00' } }, now)
    const store = new FileSchedulerStore(dir)
    const oldTask = (await store.get(old.task_id))!
    await store.put({ ...oldTask, schedule: { every: '1d', anchor: (oldTask.schedule as { anchor: string }).anchor } })

    expect(await moveScheduledTasksToTimeZone('UTC', NY, now)).toBe(3)
    const movedDaily = (await getScheduledTask(daily.task_id))!
    expect(movedDaily.schedule).toEqual({ every: '1d', anchor: '2026-10-28T13:00:00.000Z', time_zone: NY })
    expect(movedDaily.next_run_at).toBe('2026-10-28T13:00:00.000Z')
    expect((await getScheduledTask(old.task_id))!.next_run_at).toBe('2026-10-28T14:00:00.000Z')
    // Paused: its zone moves, and resuming picks the next Monday 9:00 New York time.
    const resumed = await resumeScheduledTask(paused.task_id, now)
    expect(resumed.next_run_at).toBe('2026-11-02T14:00:00.000Z')
    expect((await getScheduledTask(hourly.task_id))!.schedule).toEqual(hourly.schedule)
    expect((await getScheduledTask(once.task_id))!.next_run_at).toBe(once.next_run_at)
  })
})
