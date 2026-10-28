// Scheduled tasks: "send this message to that agent later — once, or
// every N minutes". One scheduler per server, started at boot by
// adapters/http.ts, which also supplies how a task actually fires (the
// same turn path as POST /agents/:name/messages, so approvals, notifiers
// and decision links behave exactly as they do for any HTTP call).
//
// Everything a tool or the console needs — create, list, pause, cancel —
// works on the store directly (below), so it works whether or not this
// process is the one running the loop; the loop picks changes up on its
// next tick.
//
// `every` is anchored: an hourly task created at 10:07 keeps firing at
// :07, however long each run takes. `start_at` sets the anchor instead,
// for "daily at 9:00" ("1d" from a 9:00 start) or "Mondays at 9:00" ("7d"
// from a Monday). Intervals are exact durations, so in a time zone with
// daylight saving a daily 9:00 task runs at 8:00 or 10:00 local time
// after the clocks change. A run missed while the server was down fires
// once when it's back, then the schedule moves to the next future slot
// (no burst of catch-up runs).
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { KeyedMutex } from './session-store.js'

export type Schedule = { run_at: string } | { every: string; anchor?: string }

export type ScheduledTaskStatus = 'scheduled' | 'running' | 'awaiting_approval' | 'paused' | 'done' | 'cancelled'

export interface ScheduledTaskRun {
  ran_at: string
  status: 'ok' | 'error'
  result?: string
  error?: string
  session_id?: string
}

export interface ScheduledTask {
  task_id: string
  task_name?: string
  agent: string
  message: string
  schedule: Schedule
  status: ScheduledTaskStatus
  created_at: string
  next_run_at?: string
  run_count: number
  last_run_at?: string
  last_status?: 'ok' | 'error'
  last_result?: string
  last_error?: string
  /** Set while a run is paused on an approval or question. */
  pending?: { ran_at: string; session_id: string; pending_ids: string[] }
  /** Send each run's result through the agent's notifier. */
  notify?: boolean
  history: ScheduledTaskRun[]
  /** Set by "run now" on a paused or finished task, so it goes back to
   * that status after the extra run. */
  run_now_from?: 'paused' | 'done'
  /** Set by cancelling a run that's waiting on an approval: cancelled
   * once that run finishes. */
  cancel_after_run?: boolean
}

const HISTORY_LIMIT = 20
const EVERY_PATTERN = /^(\d+)\s*(s|m|h|d)$/
const EVERY_UNIT_MS: Record<string, number> = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 }
/** Shortest allowed interval, so a typo can't hammer the model. */
const MIN_EVERY_MS = 30_000

export class ScheduleError extends Error {}

export function parseEvery(every: string): number {
  const match = EVERY_PATTERN.exec(every.trim())
  if (!match) throw new ScheduleError(`"${every}" is not a valid interval — use a number followed by s/m/h/d, e.g. "30m", "1h", "1d"`)
  const ms = Number(match[1]) * EVERY_UNIT_MS[match[2]]
  if (ms < MIN_EVERY_MS) throw new ScheduleError(`"${every}" is too short — the shortest interval is 30s`)
  return ms
}

/** The first anchored slot strictly after `nowMs`. */
function nextAnchoredSlot(anchorMs: number, intervalMs: number, nowMs: number): number {
  if (nowMs < anchorMs) return anchorMs
  return anchorMs + (Math.floor((nowMs - anchorMs) / intervalMs) + 1) * intervalMs
}

/** Human-readable schedule, for lists and messages. */
export function describeSchedule(schedule: Schedule): string {
  return 'run_at' in schedule ? `once at ${schedule.run_at}` : `every ${schedule.every}`
}

// ---------- store ----------

export interface SchedulerStore {
  list(): Promise<ScheduledTask[]>
  get(taskId: string): Promise<ScheduledTask | undefined>
  put(task: ScheduledTask): Promise<void>
  remove(taskId: string): Promise<void>
  /** Runs `fn` with exclusive access to one task (read, change, write). */
  update(taskId: string, fn: (task: ScheduledTask | undefined) => ScheduledTask | undefined): Promise<ScheduledTask | undefined>
}

const fileMutex = new KeyedMutex()

/** One JSON file per task under `<dir>/tasks/` — one server process. */
export class FileSchedulerStore implements SchedulerStore {
  private readonly dir: string

  constructor(dir: string) {
    this.dir = path.join(dir, 'tasks')
  }

  private file(taskId: string): string {
    if (!/^[A-Za-z0-9_-]+$/.test(taskId)) throw new ScheduleError(`invalid task id "${taskId}"`)
    return path.join(this.dir, `${taskId}.json`)
  }

  async list(): Promise<ScheduledTask[]> {
    if (!existsSync(this.dir)) return []
    const tasks: ScheduledTask[] = []
    for (const name of readdirSync(this.dir)) {
      if (!name.endsWith('.json')) continue
      try {
        tasks.push(JSON.parse(readFileSync(path.join(this.dir, name), 'utf8')) as ScheduledTask)
      } catch {
        // mid-write or removed between readdir and read
      }
    }
    return tasks.sort((a, b) => a.created_at.localeCompare(b.created_at))
  }

  async get(taskId: string): Promise<ScheduledTask | undefined> {
    const file = this.file(taskId)
    return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as ScheduledTask) : undefined
  }

  async put(task: ScheduledTask): Promise<void> {
    mkdirSync(this.dir, { recursive: true })
    const file = this.file(task.task_id)
    writeFileSync(file + '.tmp', JSON.stringify(task, null, 2))
    renameSync(file + '.tmp', file)
  }

  async remove(taskId: string): Promise<void> {
    rmSync(this.file(taskId), { force: true })
  }

  async update(taskId: string, fn: (task: ScheduledTask | undefined) => ScheduledTask | undefined): Promise<ScheduledTask | undefined> {
    return fileMutex.run(taskId, async () => {
      const next = fn(await this.get(taskId))
      if (next) await this.put(next)
      return next
    })
  }
}

let store: SchedulerStore | undefined

/** The process-wide store: `.scheduler/` in the project, or
 * LOOPENGINE_SCHEDULER_DIR. */
export function getSchedulerStore(): SchedulerStore {
  store ??= new FileSchedulerStore(process.env.LOOPENGINE_SCHEDULER_DIR || path.join(process.cwd(), '.scheduler'))
  return store
}

export function setSchedulerStore(next: SchedulerStore): void {
  store = next
}

// ---------- API for tools and the console ----------

export interface CreateScheduledTaskInput {
  agent: string
  message: string
  /** `start_at` (with `every` only): when the first run is, and so the
   * time of day / day of week every later run keeps, e.g. every "1d"
   * from "2026-11-02T09:00:00+08:00" runs daily at 9:00. A start in the
   * past is fine: the first run is its next slot after now. Without it,
   * the first run is one interval from now. */
  schedule: { run_at?: unknown; every?: unknown; start_at?: unknown }
  task_name?: string
  notify?: boolean
}

export async function createScheduledTask(input: CreateScheduledTaskInput, nowMs = Date.now()): Promise<ScheduledTask> {
  if (!input.agent) throw new ScheduleError('agent is required')
  if (!input.message?.trim()) throw new ScheduleError('message is required')
  let schedule: Schedule
  let nextRunMs: number
  if (typeof input.schedule?.run_at === 'string' && input.schedule.run_at) {
    const runAtMs = Date.parse(input.schedule.run_at)
    if (Number.isNaN(runAtMs)) throw new ScheduleError(`"${input.schedule.run_at}" is not a valid ISO 8601 timestamp`)
    schedule = { run_at: new Date(runAtMs).toISOString() }
    nextRunMs = runAtMs
  } else if (typeof input.schedule?.every === 'string' && input.schedule.every) {
    const intervalMs = parseEvery(input.schedule.every)
    const startAt = input.schedule.start_at
    if (startAt !== undefined && startAt !== null && startAt !== '') {
      const startMs = typeof startAt === 'string' ? Date.parse(startAt) : Number.NaN
      if (Number.isNaN(startMs)) throw new ScheduleError(`start_at "${String(startAt)}" is not a valid ISO 8601 timestamp`)
      // The anchor is the start itself, so every run lands on its time of
      // day (or weekday, for "7d").
      nextRunMs = nextAnchoredSlot(startMs, intervalMs, nowMs)
      schedule = { every: input.schedule.every.trim(), anchor: new Date(startMs).toISOString() }
    } else {
      nextRunMs = nowMs + intervalMs
      schedule = { every: input.schedule.every.trim(), anchor: new Date(nextRunMs).toISOString() }
    }
  } else {
    if (input.schedule?.start_at) throw new ScheduleError('start_at goes with "every" (a repeating task); a one-off task uses run_at')
    throw new ScheduleError('schedule must be { "run_at": "<ISO timestamp>" } or { "every": "<interval, e.g. 1h>", "start_at"?: "<ISO timestamp>" }')
  }
  const task: ScheduledTask = {
    task_id: randomUUID(),
    task_name: input.task_name?.trim() || undefined,
    agent: input.agent,
    message: input.message,
    schedule,
    status: 'scheduled',
    created_at: new Date(nowMs).toISOString(),
    next_run_at: new Date(nextRunMs).toISOString(),
    run_count: 0,
    notify: input.notify || undefined,
    history: [],
  }
  await getSchedulerStore().put(task)
  return task
}

export async function listScheduledTasks(filter: { agent?: string; status?: ScheduledTaskStatus } = {}): Promise<ScheduledTask[]> {
  return (await getSchedulerStore().list()).filter((t) => (!filter.agent || t.agent === filter.agent) && (!filter.status || t.status === filter.status))
}

export async function getScheduledTask(taskId: string): Promise<ScheduledTask | undefined> {
  return getSchedulerStore().get(taskId)
}

function mustExist(task: ScheduledTask | undefined, taskId: string): ScheduledTask {
  if (!task) throw new ScheduleError(`no scheduled task "${taskId}"`)
  return task
}

/** Stops future runs; history stays. A run already waiting on an
 * approval isn't retracted. */
export async function cancelScheduledTask(taskId: string): Promise<ScheduledTask> {
  return mustExist(
    await getSchedulerStore().update(taskId, (t) =>
      !t ? t : t.status === 'awaiting_approval' ? { ...t, cancel_after_run: true } : { ...t, status: 'cancelled', next_run_at: undefined },
    ),
    taskId,
  )
}

export async function pauseScheduledTask(taskId: string): Promise<ScheduledTask> {
  return mustExist(
    await getSchedulerStore().update(taskId, (t) => (t && t.status === 'scheduled' ? { ...t, status: 'paused', next_run_at: undefined } : t)),
    taskId,
  )
}

export async function resumeScheduledTask(taskId: string, nowMs = Date.now()): Promise<ScheduledTask> {
  return mustExist(
    await getSchedulerStore().update(taskId, (t) => {
      if (!t || t.status !== 'paused') return t
      return { ...t, status: 'scheduled', next_run_at: new Date(nextRunAfter(t, nowMs) ?? nowMs).toISOString() }
    }),
    taskId,
  )
}

/** Fires the task on the next tick, without changing its schedule. A
 * finished one-off task runs once more. */
export async function runScheduledTaskNow(taskId: string, nowMs = Date.now()): Promise<ScheduledTask> {
  return mustExist(
    await getSchedulerStore().update(taskId, (t) => {
      if (!t || t.status === 'running' || t.status === 'awaiting_approval' || t.status === 'cancelled') return t
      return { ...t, status: 'scheduled', next_run_at: new Date(nowMs).toISOString(), run_now_from: t.status === 'paused' || t.status === 'done' ? t.status : undefined }
    }),
    taskId,
  )
}

export async function deleteScheduledTask(taskId: string): Promise<void> {
  await getSchedulerStore().remove(taskId)
}

/** When the next task is due — for a host that stops idle servers and
 * needs to wake this one in time (GET /internal/activity). */
export async function nextScheduledWakeAt(): Promise<string | undefined> {
  const due = (await getSchedulerStore().list()).filter((t) => t.status === 'scheduled' && t.next_run_at).map((t) => t.next_run_at!)
  return due.sort()[0]
}

function nextRunAfter(task: ScheduledTask, nowMs: number): number | undefined {
  if ('run_at' in task.schedule) return undefined
  const intervalMs = parseEvery(task.schedule.every)
  const anchorMs = task.schedule.anchor ? Date.parse(task.schedule.anchor) : Date.parse(task.created_at) + intervalMs
  return nextAnchoredSlot(anchorMs, intervalMs, nowMs)
}

/** Moves the old lp-task-scheduler's task files (`<dir>/.tasks/*.json`)
 * into this store once, renaming each to `.json.migrated`. Returns how
 * many it imported. */
export async function importLegacyScheduledTasks(dir: string): Promise<number> {
  const legacyDir = path.join(dir, '.tasks')
  if (!existsSync(legacyDir)) return 0
  let imported = 0
  for (const name of readdirSync(legacyDir)) {
    if (!name.endsWith('.json')) continue
    const file = path.join(legacyDir, name)
    try {
      const old = JSON.parse(readFileSync(file, 'utf8')) as ScheduledTask
      if (!(await getSchedulerStore().get(old.task_id))) {
        const task: ScheduledTask = { ...old, history: old.history ?? [], run_count: old.run_count ?? 0 }
        if ('every' in task.schedule && !task.schedule.anchor && task.next_run_at) task.schedule = { ...task.schedule, anchor: task.next_run_at }
        await getSchedulerStore().put(task)
        imported++
      }
      renameSync(file, file + '.migrated')
    } catch (err) {
      console.error(`[loopengine] could not import legacy scheduled task ${file}:`, err)
    }
  }
  return imported
}

/** lp-task-scheduler 1.x kept tasks under
 * generated/scheduled-tasks/<agent>/.tasks/ (or SCHEDULER_STORE_DIR) and
 * ran its own timer; scheduling is built in now, so the server imports
 * those once at start. */
async function importLegacyAbilityTasks(): Promise<void> {
  const dirs = new Set<string>()
  const root = path.join(process.cwd(), 'generated', 'scheduled-tasks')
  if (existsSync(root)) {
    dirs.add(root)
    for (const name of readdirSync(root)) if (name !== '.tasks') dirs.add(path.join(root, name))
  }
  if (process.env.SCHEDULER_STORE_DIR) dirs.add(path.resolve(process.env.SCHEDULER_STORE_DIR))
  for (const dir of dirs) {
    const n = await importLegacyScheduledTasks(dir)
    if (n) console.log(`[loopengine] imported ${n} scheduled task(s) from ${dir}`)
  }
}

// ---------- the loop ----------

/** How a task fires — supplied by the server. `done`: the agent replied;
 * `pending`: the run is paused on approvals/questions (see settleFromResume). */
export type FireTask = (task: ScheduledTask, sessionId: string) => Promise<{ kind: 'done'; text: string } | { kind: 'pending'; pendingIds: string[] }>

export class Scheduler {
  private readonly fire: FireTask
  private readonly tickMs: number
  private readonly onSettled?: (task: ScheduledTask, run: ScheduledTaskRun) => void
  private readonly inFlight = new Set<string>()
  private timer?: ReturnType<typeof setInterval>

  constructor(options: { fire: FireTask; tickMs?: number; onSettled?: (task: ScheduledTask, run: ScheduledTaskRun) => void }) {
    this.fire = options.fire
    this.tickMs = options.tickMs ?? (Number(process.env.LOOPENGINE_SCHEDULER_TICK_MS) || 10_000)
    this.onSettled = options.onSettled
  }

  /** Imports tasks left by the old lp-task-scheduler ability, recovers
   * runs a restart cut off, then ticks every `tickMs`. */
  async start(): Promise<void> {
    await importLegacyAbilityTasks()
    for (const task of await getSchedulerStore().list()) {
      if (task.status === 'running') await this.settle(task.task_id, new Date().toISOString(), { status: 'error', error: 'The server restarted while this run was in progress.' })
    }
    await this.tick()
    this.timer = setInterval(() => void this.tick().catch((err) => console.error('[loopengine] scheduler tick failed:', err)), this.tickMs)
    this.timer.unref?.()
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
  }

  /** How many runs are executing right now (for idle-shutdown checks). */
  get running(): number {
    return this.inFlight.size
  }

  /** Fires every task that's due. Safe to call any time (a host's wake-up
   * request calls it directly). */
  async tick(nowMs = Date.now()): Promise<number> {
    let fired = 0
    for (const task of await getSchedulerStore().list()) {
      if (task.status !== 'scheduled' || !task.next_run_at || Date.parse(task.next_run_at) > nowMs || this.inFlight.has(task.task_id)) continue
      fired++
      this.inFlight.add(task.task_id)
      void this.run(task.task_id).finally(() => this.inFlight.delete(task.task_id))
    }
    return fired
  }

  private async run(taskId: string): Promise<void> {
    const ranAt = new Date().toISOString()
    const claimed = await getSchedulerStore().update(taskId, (t) => (t && t.status === 'scheduled' ? { ...t, status: 'running' } : t))
    if (!claimed || claimed.status !== 'running') return
    const sessionId = `sched-${taskId.slice(0, 8)}-${claimed.run_count + 1}-${Date.now().toString(36)}`
    try {
      const outcome = await this.fire(claimed, sessionId)
      if (outcome.kind === 'pending') {
        await getSchedulerStore().update(taskId, (t) => t && {
          ...t,
          status: 'awaiting_approval',
          next_run_at: undefined,
          pending: { ran_at: ranAt, session_id: sessionId, pending_ids: outcome.pendingIds },
          // Cancelled while this run was starting: finish this run, then stop.
          cancel_after_run: t.cancel_after_run || t.status === 'cancelled' || undefined,
        })
        return
      }
      await this.settle(taskId, ranAt, { status: 'ok', result: outcome.text, session_id: sessionId })
    } catch (err) {
      await this.settle(taskId, ranAt, { status: 'error', error: err instanceof Error ? err.message : String(err), session_id: sessionId })
    }
  }

  /** A paused run resumed after a decision (adapters/http.ts calls this
   * from the resolve path): settle it, or record the next decision it's
   * now waiting on. */
  async settleFromResume(sessionId: string, outcome: { text: string; pendingIds?: string[] }): Promise<void> {
    if (!sessionId.startsWith('sched-')) return
    const task = (await getSchedulerStore().list()).find((t) => t.pending?.session_id === sessionId)
    if (!task) return
    if (outcome.pendingIds?.length) {
      await getSchedulerStore().update(task.task_id, (t) => t && t.pending && { ...t, pending: { ...t.pending, pending_ids: outcome.pendingIds! } })
      return
    }
    await this.settle(task.task_id, task.pending!.ran_at, { status: 'ok', result: outcome.text, session_id: sessionId })
  }

  private async settle(taskId: string, ranAt: string, run: Omit<ScheduledTaskRun, 'ran_at'>): Promise<void> {
    const nowMs = Date.now()
    const entry: ScheduledTaskRun = { ran_at: ranAt, ...run }
    const settled = await getSchedulerStore().update(taskId, (t) => {
      if (!t) return t
      const history = [...t.history, entry].slice(-HISTORY_LIMIT)
      const base: ScheduledTask = {
        ...t,
        run_count: t.run_count + 1,
        last_run_at: ranAt,
        last_status: run.status,
        last_result: run.result,
        last_error: run.error,
        pending: undefined,
        history,
        run_now_from: undefined,
        cancel_after_run: undefined,
      }
      if (t.cancel_after_run || t.status === 'cancelled') return { ...base, status: 'cancelled', next_run_at: undefined }
      // A "run now" of a paused or finished task goes back to how it was.
      if (t.run_now_from) return { ...base, status: t.run_now_from, next_run_at: undefined }
      const next = nextRunAfter(t, nowMs)
      return next === undefined ? { ...base, status: 'done', next_run_at: undefined } : { ...base, status: 'scheduled', next_run_at: new Date(next).toISOString() }
    })
    if (settled) this.onSettled?.(settled, entry)
  }
}
