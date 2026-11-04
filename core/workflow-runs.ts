// Workflow runs started by hand or by an app: Run now in the console, or
// POST /agents/:name/workflows/:id/run. Each is a record of its own here,
// not a schedule task, so the Schedules tab only lists what is set to run
// and each run can be looked up by its id afterwards
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

export type WorkflowRunStatus = 'running' | 'awaiting_approval' | 'done' | 'error'

export interface WorkflowRun {
  run_id: string
  agent: string
  workflow_id: string
  params?: Record<string, string>
  /** Who started it: the console's Run now, or an app over the API. */
  source: 'console' | 'api'
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
}

export type RunOutcome = { kind: 'done'; text: string } | { kind: 'pending'; pendingIds: string[] }

/** Runs the agent once: what a scheduled task's fire does. */
export type ExecuteRun = (agent: string, message: string, sessionId: string) => Promise<RunOutcome>

const MAX_FINISHED_PER_AGENT = 500
const SESSION_PREFIX = 'run-'

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
}

export class WorkflowRunner {
  private readonly execute: ExecuteRun
  private readonly maxFinishedPerAgent: number
  private readonly inFlight = new Set<Promise<void>>()

  constructor(options: { execute: ExecuteRun; maxFinishedPerAgent?: number }) {
    this.execute = options.execute
    this.maxFinishedPerAgent = options.maxFinishedPerAgent ?? MAX_FINISHED_PER_AGENT
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
        await getRunStore().update(run.run_id, (r) => r && { ...r, status: 'awaiting_approval', pending_ids: outcome.pendingIds })
        return
      }
      await this.finish(run.run_id, { status: 'done', result: outcome.text })
    } catch (err) {
      await this.finish(run.run_id, { status: 'error', error: err instanceof Error ? err.message : String(err) })
    }
  }

  private async finish(runId: string, end: { status: 'done' | 'error'; result?: string; error?: string }): Promise<void> {
    await getRunStore().update(runId, (r) => r && { ...r, ...end, pending_ids: undefined, finished_at: new Date().toISOString() })
  }

  /** A paused run resumed after a decision (the server calls this from
   * its resolve path, for every resumed session): settle it, or record
   * what it's waiting on now. */
  async settleFromResume(sessionId: string, outcome: { text: string; pendingIds?: string[] }): Promise<void> {
    if (!sessionId.startsWith(SESSION_PREFIX)) return
    const run = (await getRunStore().list()).find((r) => r.session_id === sessionId)
    if (!run) return
    if (outcome.pendingIds?.length) {
      await getRunStore().update(run.run_id, (r) => r && { ...r, status: 'awaiting_approval', pending_ids: outcome.pendingIds })
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
