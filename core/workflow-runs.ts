// Workflow runs: started by hand or by an app (Run now in the console, or
// POST /agents/:name/workflows/:id/run), or by a schedule that runs the
// workflow. Each is a record of its own here, so a workflow has one
// history of every run whatever started it, the Schedules tab only lists
// what is set to run, and each run can be looked up by its id afterwards
// (GET /agents/:name/runs/:id).
//
// A run executes the same way a scheduled task fires (supplied by the
// server, adapters/http.ts): an unattended agent turn whose approvals and
// questions go to the agent's messaging app and wait durably. A run that
// pauses there is settled by settleFromResume once someone decides.
//
// Stored like scheduled tasks: one JSON file per run under
// `<LOOPENGINE_SCHEDULER_DIR or .scheduler>/runs/`. Each agent keeps its
// latest MAX_FINISHED_PER_AGENT finished runs; older ones are removed as
// new runs start.
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { KeyedMutex } from './session-store.js'
import type { CallbackDelivery } from './run-callbacks.js'

export type WorkflowRunStatus = 'running' | 'awaiting_approval' | 'done' | 'error'

export interface WorkflowRun {
  run_id: string
  agent: string
  workflow_id: string
  params?: Record<string, string>
  /** Who started it: the console's Run now, an app over the API, a
   * schedule, or an outside service through a webhook trigger. */
  source: 'console' | 'api' | 'schedule' | 'webhook'
  /** The webhook trigger that started it, for source "webhook"
   * (core/workflow-triggers.ts). */
  trigger_id?: string
  /** The schedule that started it, for source "schedule". */
  task_id?: string
  task_name?: string
  status: WorkflowRunStatus
  started_at: string
  finished_at?: string
  /** The message it started with: the workflow's start message and steps. */
  message: string
  session_id: string
  /** The agent's final reply, when done. */
  result?: string
  error?: string
  /** The approvals or questions it is waiting on. */
  pending_ids?: string[]
  /** Send its result through the agent's notifier when it ends. */
  notify?: boolean
  /** Where its record is posted when it ends or stops for a decision
   * (core/run-callbacks.ts). */
  callback_url?: string
  /** Each callback delivery, oldest first (the latest 10). */
  callbacks?: CallbackDelivery[]
}

export type RunOutcome = { kind: 'done'; text: string } | { kind: 'pending'; pendingIds: string[] }

/** Runs the agent once: what a scheduled task's fire does. */
export type ExecuteRun = (agent: string, message: string, sessionId: string) => Promise<RunOutcome>

const MAX_FINISHED_PER_AGENT = 500
const SESSION_PREFIX = 'run-'
/** A scheduled task's sessions (core/scheduler.ts). */
const SCHEDULE_SESSION_PREFIX = 'sched-'

export class RunError extends Error {}

// ---------- store ----------

export interface RunStore {
  list(): Promise<WorkflowRun[]>
  get(runId: string): Promise<WorkflowRun | undefined>
  put(run: WorkflowRun): Promise<void>
  remove(runId: string): Promise<void>
  update(runId: string, fn: (run: WorkflowRun | undefined) => WorkflowRun | undefined): Promise<WorkflowRun | undefined>
}

const fileMutex = new KeyedMutex()

/** One JSON file per run under `<dir>/runs/` — one server process. */
export class FileRunStore implements RunStore {
  private readonly dir: string

  constructor(dir: string) {
    this.dir = path.join(dir, 'runs')
  }

  private file(runId: string): string {
    if (!/^[A-Za-z0-9_-]+$/.test(runId)) throw new RunError(`invalid run id "${runId}"`)
    return path.join(this.dir, `${runId}.json`)
  }

  async list(): Promise<WorkflowRun[]> {
    if (!existsSync(this.dir)) return []
    const runs: WorkflowRun[] = []
    for (const name of readdirSync(this.dir)) {
      if (!name.endsWith('.json')) continue
      try {
        runs.push(JSON.parse(readFileSync(path.join(this.dir, name), 'utf8')) as WorkflowRun)
      } catch {
        // A file being written, or not a run: skip it.
      }
    }
    return runs.sort((a, b) => b.started_at.localeCompare(a.started_at))
  }

  async get(runId: string): Promise<WorkflowRun | undefined> {
    const file = this.file(runId)
    return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as WorkflowRun) : undefined
  }

  async put(run: WorkflowRun): Promise<void> {
    mkdirSync(this.dir, { recursive: true })
    const file = this.file(run.run_id)
    writeFileSync(file + '.tmp', JSON.stringify(run, null, 2))
    renameSync(file + '.tmp', file)
  }

  async remove(runId: string): Promise<void> {
    rmSync(this.file(runId), { force: true })
  }

  async update(runId: string, fn: (run: WorkflowRun | undefined) => WorkflowRun | undefined): Promise<WorkflowRun | undefined> {
    return fileMutex.run(runId, async () => {
      const next = fn(await this.get(runId))
      if (next) await this.put(next)
      return next
    })
  }
}

let store: RunStore | undefined

/** The process-wide store: `runs/` in the scheduler's folder. */
export function getRunStore(): RunStore {
  store ??= new FileRunStore(process.env.LOOPENGINE_SCHEDULER_DIR || path.join(process.cwd(), '.scheduler'))
  return store
}

export function setRunStore(next: RunStore): void {
  store = next
}

// ---------- reading ----------

/** An agent's runs, newest first; of one workflow when `workflowId` is given. */
export async function listRuns(agent: string, filter: { workflowId?: string; limit?: number } = {}): Promise<WorkflowRun[]> {
  const runs = (await getRunStore().list()).filter((r) => r.agent === agent && (!filter.workflowId || r.workflow_id === filter.workflowId))
  return filter.limit ? runs.slice(0, filter.limit) : runs
}

/** One of an agent's runs; undefined for another agent's. */
export async function getRun(agent: string, runId: string): Promise<WorkflowRun | undefined> {
  if (!/^[A-Za-z0-9_-]+$/.test(runId)) return undefined
  const run = await getRunStore().get(runId)
  return run && run.agent === agent ? run : undefined
}

export function isUnderWay(run: WorkflowRun): boolean {
  return run.status === 'running' || run.status === 'awaiting_approval'
}

// ---------- running ----------

export interface StartRunInput {
  agent: string
  workflow_id: string
  params?: Record<string, string>
  source: WorkflowRun['source']
  message: string
  notify?: boolean
  callback_url?: string
  trigger_id?: string
}

export class WorkflowRunner {
  private readonly execute: ExecuteRun
  private readonly maxFinishedPerAgent: number
  private readonly onChange?: (run: WorkflowRun) => void | Promise<void>
  private readonly inFlight = new Set<Promise<void>>()

  /** `onChange`: called with the run each time it finishes, fails or
   * stops for a decision (the server sends its notify and callback). */
  constructor(options: { execute: ExecuteRun; maxFinishedPerAgent?: number; onChange?: (run: WorkflowRun) => void | Promise<void> }) {
    this.execute = options.execute
    this.maxFinishedPerAgent = options.maxFinishedPerAgent ?? MAX_FINISHED_PER_AGENT
    this.onChange = options.onChange
  }

  private changed(run: WorkflowRun | undefined): void {
    if (!run || !this.onChange) return
    void Promise.resolve()
      .then(() => this.onChange!(run))
      .catch((err) => console.error(`[loopengine] reporting run ${run.run_id} failed:`, err))
  }

  /** Records a run and starts it; returns at once with the record. */
  async start(input: StartRunInput): Promise<WorkflowRun> {
    const runId = randomUUID()
    const run: WorkflowRun = {
      run_id: runId,
      agent: input.agent,
      workflow_id: input.workflow_id,
      ...(input.params && Object.keys(input.params).length ? { params: input.params } : {}),
      source: input.source,
      ...(input.notify ? { notify: true } : {}),
      ...(input.callback_url ? { callback_url: input.callback_url } : {}),
      ...(input.trigger_id ? { trigger_id: input.trigger_id } : {}),
      status: 'running',
      started_at: new Date().toISOString(),
      message: input.message,
      session_id: `${SESSION_PREFIX}${runId.slice(0, 8)}-${Date.now().toString(36)}`,
    }
    await getRunStore().put(run)
    await this.prune(input.agent)
    const job = this.run(run).finally(() => this.inFlight.delete(job))
    this.inFlight.add(job)
    return run
  }

  /** A schedule firing one of its agent's workflows (the scheduler's fire,
   * for a workflow task): recorded as a run of the workflow, then run the
   * usual way. Returns the outcome for the scheduler, and throws what the
   * run threw, so the schedule's own history records it too. */
  async runForSchedule(input: { agent: string; workflow_id: string; params?: Record<string, string>; task_id: string; task_name?: string; message: string; session_id: string }): Promise<RunOutcome> {
    const run: WorkflowRun = {
      run_id: randomUUID(),
      agent: input.agent,
      workflow_id: input.workflow_id,
      ...(input.params && Object.keys(input.params).length ? { params: input.params } : {}),
      source: 'schedule',
      task_id: input.task_id,
      ...(input.task_name ? { task_name: input.task_name } : {}),
      status: 'running',
      started_at: new Date().toISOString(),
      message: input.message,
      session_id: input.session_id,
    }
    await getRunStore().put(run)
    await this.prune(input.agent)
    try {
      const outcome = await this.execute(run.agent, run.message, run.session_id)
      if (outcome.kind === 'pending') this.changed(await getRunStore().update(run.run_id, (r) => r && { ...r, status: 'awaiting_approval', pending_ids: outcome.pendingIds }))
      else await this.finish(run.run_id, { status: 'done', result: outcome.text })
      return outcome
    } catch (err) {
      await this.finish(run.run_id, { status: 'error', error: err instanceof Error ? err.message : String(err) })
      throw err
    }
  }

  /** Waits for the runs this process has started (tests, shutdown). */
  async idle(): Promise<void> {
    await Promise.all([...this.inFlight])
  }

  /** How many runs are executing right now (for idle-shutdown checks). */
  get running(): number {
    return this.inFlight.size
  }

  private async run(run: WorkflowRun): Promise<void> {
    try {
      const outcome = await this.execute(run.agent, run.message, run.session_id)
      if (outcome.kind === 'pending') {
        this.changed(await getRunStore().update(run.run_id, (r) => r && { ...r, status: 'awaiting_approval', pending_ids: outcome.pendingIds }))
        return
      }
      await this.finish(run.run_id, { status: 'done', result: outcome.text })
    } catch (err) {
      await this.finish(run.run_id, { status: 'error', error: err instanceof Error ? err.message : String(err) })
    }
  }

  private async finish(runId: string, end: { status: 'done' | 'error'; result?: string; error?: string }): Promise<void> {
    this.changed(await getRunStore().update(runId, (r) => r && { ...r, ...end, pending_ids: undefined, finished_at: new Date().toISOString() }))
  }

  /** A paused run resumed after a decision (the server calls this from
   * its resolve path, for every resumed session): settle it, or record
   * what it's waiting on now. */
  async settleFromResume(sessionId: string, outcome: { text: string; pendingIds?: string[] }): Promise<void> {
    if (!sessionId.startsWith(SESSION_PREFIX) && !sessionId.startsWith(SCHEDULE_SESSION_PREFIX)) return
    const run = (await getRunStore().list()).find((r) => r.session_id === sessionId)
    if (!run) return
    if (outcome.pendingIds?.length) {
      this.changed(await getRunStore().update(run.run_id, (r) => r && { ...r, status: 'awaiting_approval', pending_ids: outcome.pendingIds }))
      return
    }
    await this.finish(run.run_id, { status: 'done', result: outcome.text })
  }

  /** On startup: a run a restart cut off can't continue, so it's an
   * error. One waiting on a decision is kept: its checkpoint survives. */
  async recover(): Promise<void> {
    for (const run of await getRunStore().list()) {
      if (run.status === 'running') await this.finish(run.run_id, { status: 'error', error: 'The server restarted while this run was in progress.' })
    }
  }

  private async prune(agent: string): Promise<void> {
    const finished = (await listRuns(agent)).filter((r) => !isUnderWay(r))
    for (const old of finished.slice(this.maxFinishedPerAgent)) await getRunStore().remove(old.run_id)
  }
}
