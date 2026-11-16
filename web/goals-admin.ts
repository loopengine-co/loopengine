// Backs the console's Goals page: a goal someone types, the jobs the goal
// planner (core/system-agents/goal-planner.ts) suggests for it, and what
// the person does with each one. Each goal is one JSON file in the
// project, goals/<id>.json; what the person says about their business is
// goals/about.json, shared by every goal.
//
// A job is one piece of the goal, with its own measure: recurring (done
// by a workflow on an agent) or once (a one-off piece of work an agent
// does in Chat). It's in one of five states:
//   suggested  the planner proposed it (on create or Generate more)
//   saved      the person kept it
//   active     a workflow does it (Build linked the real workflow back)
//   done       a once job the person marked done
//   discarded  the person said no; never suggested again unless restored
// Generate more is given every job in every state, so nothing comes back
// twice. Building one makes its suggested agent first when there is none
// by that name, then hands the request to Build a workflow (a once job
// opens Chat with the agent instead).
//
// Goals saved before jobs kept them as `workflows`, built ones with a
// `built` link; they're read as jobs and saved that way next time.
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import type { ModelCall } from '../core/run-agent.js'
import { agentName, runGoalPipeline, type GoalBrief, type GoalContext, type GoalNeed, type PlannedGoalWorkflow } from '../core/system-agents/goal-planner.js'
import { GOAL_FOCUSES, type GoalFocus } from '../core/system-agents/goal-playbooks.js'

export type GoalJobState = 'suggested' | 'saved' | 'active' | 'done' | 'discarded'

/** What does a job: a workflow on an agent. (One-off assignments and
 * several chained workflows come later: docs, Jobs under goals.) */
export interface JobDoer {
  type: 'workflow'
  agent: string
  workflowId: string
  title: string
  at: string
}

export interface GoalJob {
  id: string
  title: string
  /** recurring: a workflow does it, again and again. once: one piece of
   * work, done when the person says so. */
  kind: 'recurring' | 'once'
  /** The job's own number, in the person's terms ("replies per week"), or
   * for a once job what done looks like. */
  measure: string
  /** The request Build a workflow is given. */
  request: string
  /** Why it helps the goal, one sentence. */
  why: string
  lever: string
  leverId?: string
  focus: GoalFocus | 'other'
  /** The suggested agent: an existing one, or one to make on Build. */
  agent: { name: string; isNew: boolean; instructions?: string }
  needs: GoalNeed[]
  humanMinutesPerWeek: number
  measureLink: string
  state: GoalJobState
  /** Where a discarded one goes back to on Restore. */
  restoreTo?: 'suggested' | 'saved'
  /** What does it, once built: the workflow (skill id) on its agent. */
  doers: JobDoer[]
  /** When a once job was marked done. */
  doneAt?: string
  /** How much the person changed the suggested request before building it
   * (edits to the built workflow's instructions later don't count). */
  edited?: EditAmount
  /** Whether Build made its agent. */
  agentCreated?: boolean
  /** Why it was discarded, when the person said. */
  discardReason?: DiscardReason
  /** What the daily check has reported about the built workflow. */
  signals?: { kept14d?: true; lastUsedAt?: string; removed?: true }
  /** Which generation suggested it (1 on create). */
  round: number
}

/** Before jobs: the same thing, called a workflow under its goal. */
export type GoalWorkflow = GoalJob
export type GoalWorkflowState = GoalJobState

export interface Goal {
  id: string
  goal: string
  /** The focus the person chose, when they changed it. */
  focus?: GoalFocus | 'other'
  brief?: GoalBrief
  setup: string[]
  message: string
  status: 'planning' | 'ready' | 'failed'
  error?: string
  /** The playbook version the latest suggestions came from. */
  playbookVersion?: number
  rounds: number
  jobs: GoalJob[]
  createdAt: string
  updatedAt: string
}

export class GoalError extends Error {}

export type EditAmount = 'none' | 'light' | 'heavy'

export const DISCARD_REASONS = ['not-relevant', 'too-much-work', 'already-doing-it', 'other'] as const
export type DiscardReason = (typeof DISCARD_REASONS)[number]

export interface GoalsDeps {
  /** The project folder goals/ lives in. */
  projectDir: () => string
  /** The model the goal planner uses; throws when none is ready. */
  modelCall: () => Promise<ModelCall>
  /** What the planner knows: the workspace, plus what the person said. */
  context: (about: string) => Promise<GoalContext>
  agentExists: (name: string) => boolean
  /** Makes an agent with these instructions (the workspace's default model). */
  createAgent: (name: string, instructions: string) => Promise<void>
  /** Whether a built workflow still exists, and its runs since a time. */
  workflowActivity?: (agent: string, workflowId: string, sinceIso: string) => Promise<{ exists: boolean; runs: number; done: number }>
}

const MAX_GOAL_CHARS = 1000
// A goal still "planning" after this long was cut short (a restart).
const STALE_PLANNING_MS = 15 * 60 * 1000

const goalsDir = (deps: GoalsDeps) => join(deps.projectDir(), 'goals')
const goalFile = (deps: GoalsDeps, id: string) => {
  if (!/^g-[a-z0-9-]+$/.test(id)) throw new GoalError('No such goal')
  return join(goalsDir(deps), `${id}.json`)
}
const now = () => new Date().toISOString()
const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${randomBytes(3).toString('hex')}`

function write(deps: GoalsDeps, goal: Goal): Goal {
  mkdirSync(goalsDir(deps), { recursive: true })
  const file = goalFile(deps, goal.id)
  const temp = `${file}.${process.pid}.tmp`
  writeFileSync(temp, `${JSON.stringify(goal, null, 2)}\n`)
  renameSync(temp, file)
  return goal
}

/** A goal as saved before jobs (its `workflows`, a built one's `built`
 * link) read as one with jobs; one saved since, as it is. */
export function migrateGoal(raw: Record<string, unknown>): Goal {
  if (Array.isArray(raw.jobs)) return raw as unknown as Goal
  const { workflows, ...rest } = raw
  const jobs = (Array.isArray(workflows) ? workflows : []).map((w): GoalJob => {
    const { built, ...x } = w as Record<string, unknown> & { built?: { agent: string; workflowId: string; title: string; at: string } }
    return {
      ...(x as unknown as GoalJob),
      kind: 'recurring',
      measure: typeof x.measure === 'string' ? x.measure : '',
      state: x.state === 'built' ? 'active' : (x.state as GoalJobState),
      doers: built ? [{ type: 'workflow', ...built }] : [],
    }
  })
  return { ...(rest as unknown as Goal), jobs }
}

export function getGoal(deps: GoalsDeps, id: string): Goal {
  const file = goalFile(deps, id)
  if (!existsSync(file)) throw new GoalError('No such goal')
  const goal = migrateGoal(JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>)
  if (goal.status === 'planning' && Date.now() - Date.parse(goal.updatedAt) > STALE_PLANNING_MS && !running.has(id)) {
    return write(deps, { ...goal, status: 'failed', error: 'Planning was interrupted. Try Generate more.', updatedAt: now() })
  }
  return goal
}

/** Newest first. */
export function listGoals(deps: GoalsDeps): Goal[] {
  const dir = goalsDir(deps)
  if (!existsSync(dir)) return []
  return readdirSync(dir).filter((f) => /^g-[a-z0-9-]+\.json$/.test(f)).flatMap((f) => {
    try {
      return [getGoal(deps, f.slice(0, -5))]
    } catch {
      return []
    }
  }).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export function deleteGoal(deps: GoalsDeps, id: string): void {
  unlinkSync(goalFile(deps, id))
}

// ---- What the person says about their business, its kind, and whether
// it shares anonymous lever stats (all goals share these): goals/about.json.

export const BUSINESS_KINDS = ['ecommerce', 'saas', 'agency', 'local', 'creator', 'nonprofit', 'other'] as const
export type BusinessKind = (typeof BUSINESS_KINDS)[number]

export interface GoalSettings {
  about: string
  businessKind?: BusinessKind
  /** Sharing anonymous lever stats with loopengine.co: unset means the
   * default (on for a LoopEngine Cloud workspace, off elsewhere). */
  shareLeverStats?: boolean
}

export function readGoalSettings(deps: GoalsDeps): GoalSettings {
  try {
    const raw = JSON.parse(readFileSync(join(goalsDir(deps), 'about.json'), 'utf8')) as Record<string, unknown>
    return {
      about: typeof raw.about === 'string' ? raw.about : '',
      ...(BUSINESS_KINDS.includes(raw.businessKind as BusinessKind) ? { businessKind: raw.businessKind as BusinessKind } : {}),
      ...(typeof raw.shareLeverStats === 'boolean' ? { shareLeverStats: raw.shareLeverStats } : {}),
    }
  } catch {
    return { about: '' }
  }
}

export function writeGoalSettings(deps: GoalsDeps, input: { about?: unknown; businessKind?: unknown; shareLeverStats?: unknown }): GoalSettings {
  const current = readGoalSettings(deps)
  if (input.about !== undefined && typeof input.about !== 'string') throw new GoalError('about must be text')
  if (input.businessKind !== undefined && input.businessKind !== null && !BUSINESS_KINDS.includes(input.businessKind as BusinessKind)) throw new GoalError(`businessKind must be one of ${BUSINESS_KINDS.join(', ')}`)
  if (input.shareLeverStats !== undefined && typeof input.shareLeverStats !== 'boolean') throw new GoalError('shareLeverStats must be true or false')
  const next: GoalSettings = {
    about: typeof input.about === 'string' ? input.about.trim().slice(0, 2000) : current.about,
    ...(input.businessKind === null ? {} : input.businessKind !== undefined ? { businessKind: input.businessKind as BusinessKind } : current.businessKind ? { businessKind: current.businessKind } : {}),
    ...(input.shareLeverStats !== undefined ? { shareLeverStats: input.shareLeverStats as boolean } : current.shareLeverStats !== undefined ? { shareLeverStats: current.shareLeverStats } : {}),
  }
  mkdirSync(goalsDir(deps), { recursive: true })
  writeFileSync(join(goalsDir(deps), 'about.json'), `${JSON.stringify(next, null, 2)}\n`)
  return next
}

export function readAbout(deps: GoalsDeps): string {
  return readGoalSettings(deps).about
}

export function writeAbout(deps: GoalsDeps, about: unknown): string {
  return writeGoalSettings(deps, { about }).about
}

// ---- Planning.

const running = new Map<string, Promise<void>>()

/** Resolves once the goal's current planning is done (for tests). */
export function goalPlanning(id: string): Promise<void> {
  return running.get(id) ?? Promise.resolve()
}

const sameLever = (a: { leverId?: string; lever: string; title: string }, b: { leverId?: string; lever: string; title: string }) =>
  Boolean((a.leverId && a.leverId === b.leverId) || a.lever.toLowerCase() === b.lever.toLowerCase() || a.title.toLowerCase() === b.title.toLowerCase())

function toJob(w: PlannedGoalWorkflow, round: number, deps: GoalsDeps): GoalJob {
  const name = agentName(w.newAgent?.name || w.agent) || 'goal-agent'
  const exists = deps.agentExists(name)
  return {
    id: newId('w'),
    title: w.title,
    kind: w.kind,
    measure: w.measure,
    request: w.request,
    why: w.mechanism,
    lever: w.lever,
    ...(w.leverId ? { leverId: w.leverId } : {}),
    focus: w.focus,
    agent: exists
      ? { name, isNew: false }
      : { name, isNew: true, instructions: w.newAgent?.instructions || `You help with this goal's work: ${w.title}. ${w.mechanism} Draft for review; nothing is sent, posted or published without approval.` },
    needs: w.needs,
    humanMinutesPerWeek: w.humanMinutesPerWeek,
    measureLink: w.measureLink,
    state: 'suggested',
    doers: [],
    round,
  }
}

/** Plans (or plans more) for a goal in the background. */
function startPlanning(deps: GoalsDeps, goal: Goal): Goal {
  if (running.has(goal.id)) throw new GoalError('This goal is already being planned.')
  const planning = write(deps, { ...goal, status: 'planning', error: undefined, updatedAt: now() } as Goal)
  const job = (async () => {
    try {
      const modelCall = await deps.modelCall()
      const context = await deps.context(readAbout(deps))
      const round = planning.rounds + 1
      const plan = await runGoalPipeline(modelCall, {
        goal: planning.goal,
        context,
        saved: planning.jobs.map((w) => ({ title: w.title, lever: w.lever, ...(w.leverId ? { leverId: w.leverId } : {}), state: w.state })),
        ...(planning.focus ? { focus: planning.focus } : {}),
      })
      const latest = getGoal(deps, planning.id)
      // The planner is told what's there; anything it repeats anyway is dropped.
      const fresh = plan.workflows.map((w) => toJob(w, round, deps)).filter((w, i, all) =>
        !latest.jobs.some((old) => sameLever(old, w)) && all.findIndex((x) => sameLever(x, w)) === i)
      const updated: Goal = {
        ...latest,
        brief: plan.brief,
        setup: [...new Set([...latest.setup, ...plan.setup])],
        message: plan.message,
        playbookVersion: plan.playbookVersion,
        status: 'ready',
        error: undefined,
        rounds: round,
        jobs: [...latest.jobs, ...fresh],
        updatedAt: now(),
      } as Goal
      write(deps, updated)
      fresh.forEach((w, i) => recordLeverEvent(deps, updated, w, 'suggested', { position: i + 1, round }))
    } catch (err) {
      const latest = getGoal(deps, planning.id)
      write(deps, { ...latest, status: 'failed', error: err instanceof Error ? err.message : String(err), updatedAt: now() })
    } finally {
      running.delete(planning.id)
    }
  })()
  running.set(planning.id, job)
  return planning
}

export function createGoal(deps: GoalsDeps, input: { goal?: unknown; about?: unknown }): Goal {
  const text = typeof input.goal === 'string' ? input.goal.trim() : ''
  if (text.length < 5) throw new GoalError('Say what you want to achieve, e.g. "Grow my Cloud users to 100".')
  if (text.length > MAX_GOAL_CHARS) throw new GoalError(`Keep the goal under ${MAX_GOAL_CHARS} characters.`)
  if (input.about !== undefined) writeAbout(deps, input.about)
  const goal: Goal = { id: newId('g'), goal: text, setup: [], message: '', status: 'planning', rounds: 0, jobs: [], createdAt: now(), updatedAt: now() }
  return startPlanning(deps, write(deps, goal))
}

/** Generate more, optionally after changing the goal's wording or focus. */
export function generateMore(deps: GoalsDeps, id: string, input: { goal?: unknown; focus?: unknown } = {}): Goal {
  const goal = getGoal(deps, id)
  const text = typeof input.goal === 'string' && input.goal.trim() ? input.goal.trim().slice(0, MAX_GOAL_CHARS) : goal.goal
  const focus = typeof input.focus === 'string' && ([...GOAL_FOCUSES, 'other'] as string[]).includes(input.focus) ? (input.focus as Goal['focus']) : goal.focus
  return startPlanning(deps, { ...goal, goal: text, ...(focus ? { focus } : {}) })
}

// ---- What the person does with a job (/goals/<id>/jobs/<jobId>).

function findWorkflow(goal: Goal, jobId: string): GoalJob {
  const w = goal.jobs.find((x) => x.id === jobId)
  if (!w) throw new GoalError('No such job under this goal')
  return w
}

function updateWorkflow(deps: GoalsDeps, goal: Goal, jobId: string, change: (w: GoalJob) => GoalJob): Goal {
  findWorkflow(goal, jobId)
  return write(deps, { ...goal, jobs: goal.jobs.map((w) => (w.id === jobId ? change(w) : w)), updatedAt: now() })
}

export function setWorkflowState(deps: GoalsDeps, id: string, workflowId: string, action: unknown, reason?: unknown): Goal {
  const goal = getGoal(deps, id)
  const w = findWorkflow(goal, workflowId)
  if (action === 'save') {
    if (w.state !== 'suggested') throw new GoalError('Only a suggestion can be saved.')
    recordLeverEvent(deps, goal, w, 'saved')
    return updateWorkflow(deps, goal, workflowId, (x) => ({ ...x, state: 'saved' }))
  }
  if (action === 'discard') {
    if (w.state === 'discarded') return goal
    if (w.state === 'active') throw new GoalError('A workflow does this job: remove it from its agent instead.')
    recordLeverEvent(deps, goal, w, 'discarded')
    return updateWorkflow(deps, goal, workflowId, (x) => ({ ...x, state: 'discarded', restoreTo: x.state as 'suggested' | 'saved' }))
  }
  if (action === 'restore') {
    if (w.state !== 'discarded') return goal
    recordLeverEvent(deps, goal, w, 'restored')
    return updateWorkflow(deps, goal, workflowId, ({ restoreTo, discardReason: _r, ...x }) => ({ ...x, state: restoreTo ?? 'suggested' }))
  }
  if (action === 'done') {
    if (w.kind !== 'once') throw new GoalError('Only a one-off job is marked done.')
    if (w.state === 'done') return goal
    if (w.state !== 'saved') throw new GoalError('Save it first.')
    recordLeverEvent(deps, goal, w, 'built', { newAgent: Boolean(w.agentCreated) })
    return updateWorkflow(deps, goal, workflowId, (x) => ({ ...x, state: 'done', doneAt: now() }))
  }
  if (action === 'undone') {
    if (w.state !== 'done') return goal
    return updateWorkflow(deps, goal, workflowId, ({ doneAt: _d, ...x }) => ({ ...x, state: 'saved' }))
  }
  if (action === 'reason') {
    if (w.state !== 'discarded') throw new GoalError('Only a discarded workflow has a reason.')
    if (!DISCARD_REASONS.includes(reason as DiscardReason)) throw new GoalError(`reason must be one of ${DISCARD_REASONS.join(', ')}`)
    if (w.discardReason === reason) return goal
    recordLeverEvent(deps, goal, w, 'discard_reason', { reason: reason as string })
    return updateWorkflow(deps, goal, workflowId, (x) => ({ ...x, discardReason: reason as DiscardReason }))
  }
  throw new GoalError('action must be save, discard, restore, done, undone or reason')
}

/** Build: makes the suggested agent when there is none by that name,
 * then returns where the work starts. A recurring job goes to Build a
 * workflow, with the request and the agent filled in and the goal to link
 * the result back to; a once job opens Chat with the agent, the request
 * ready to send. */
export async function prepareBuild(deps: GoalsDeps, id: string, workflowId: string): Promise<{ goal: Goal; agent: string; createdAgent: boolean; url: string }> {
  let goal = getGoal(deps, id)
  const w = findWorkflow(goal, workflowId)
  if (w.state === 'active') throw new GoalError('A workflow already does this job.')
  if (w.state !== 'saved') throw new GoalError('Save it first.')
  let createdAgent = false
  if (!deps.agentExists(w.agent.name)) {
    await deps.createAgent(w.agent.name, w.agent.instructions || `You help with: ${w.title}.`)
    createdAgent = true
  }
  if (w.agent.isNew || createdAgent) goal = updateWorkflow(deps, goal, workflowId, (x) => ({ ...x, agent: { name: x.agent.name, isNew: false }, ...(createdAgent ? { agentCreated: true } : {}) }))
  if (w.kind === 'once') return { goal, agent: w.agent.name, createdAgent, url: `/playground?${new URLSearchParams({ agent: w.agent.name, message: w.request })}` }
  const params = new URLSearchParams({ agent: w.agent.name, description: w.request, goal: id, goalJob: workflowId })
  return { goal, agent: w.agent.name, createdAgent, url: `/workflows/new?${params}` }
}

/** Build a workflow's Create it, linking the new workflow back.
 * `description` is the request as the person submitted it at Build. */
export function markBuilt(deps: GoalsDeps, id: string, workflowId: string, input: { agent?: unknown; workflowId?: unknown; title?: unknown; description?: unknown }): Goal {
  const goal = getGoal(deps, id)
  const w = findWorkflow(goal, workflowId)
  if (typeof input.agent !== 'string' || typeof input.workflowId !== 'string') throw new GoalError('agent and workflowId are required')
  const doer: JobDoer = { type: 'workflow', agent: input.agent, workflowId: input.workflowId, title: typeof input.title === 'string' ? input.title : input.workflowId, at: now() }
  const edited = typeof input.description === 'string' ? editAmount(w.request, input.description) : undefined
  recordLeverEvent(deps, goal, w, 'built', { newAgent: Boolean(w.agentCreated) })
  if (edited && edited !== 'none') recordLeverEvent(deps, goal, w, 'edited', { amount: edited })
  return updateWorkflow(deps, goal, workflowId, (x) => ({ ...x, state: 'active', doers: [...x.doers.filter((d) => !(d.agent === doer.agent && d.workflowId === doer.workflowId)), doer], agent: { name: input.agent as string, isNew: false }, ...(edited ? { edited } : {}) }))
}

// ---- Edits: how much the person changed a suggested request at Build.

const words = (text: string) => new Set(text.toLowerCase().replace(/[^a-z0-9$ ]+/g, ' ').split(/\s+/).filter((w) => w.length > 2))

/** none (same words), light (mostly the same: names, a schedule, tone)
 * or heavy (a different request), by how many words the two share. */
export function editAmount(before: string, after: string): EditAmount {
  const a = words(before)
  const b = words(after)
  if (!a.size && !b.size) return 'none'
  let shared = 0
  for (const w of a) if (b.has(w)) shared++
  const similarity = shared / (a.size + b.size - shared)
  return similarity >= 0.95 ? 'none' : similarity >= 0.55 ? 'light' : 'heavy'
}

// ---- Lever events, kept in the project (goals/lever-events.jsonl) until
// they're sent to loopengine.co. Never the goal's or the workflow's text:
// the lever, its focus, the playbook version and what happened.

export type LeverEventType = 'suggested' | 'saved' | 'discarded' | 'discard_reason' | 'restored' | 'built' | 'edited' | 'kept_14d' | 'used' | 'removed'

export interface LeverEvent {
  id: string
  type: LeverEventType
  at: string
  goal: string
  goalWorkflow: string
  leverId?: string
  /** The lever's label (for a new idea, the planner's own, generic). */
  lever: string
  focus: GoalFocus | 'other'
  playbookVersion?: number
  /** Per type: position and round (suggested), reason (discard_reason),
   * newAgent (built), amount (edited), runs and done (used), days (removed). */
  detail: Record<string, string | number | boolean>
}

export function recordLeverEvent(deps: GoalsDeps, goal: Goal, w: GoalJob, type: LeverEventType, detail: LeverEvent['detail'] = {}): LeverEvent {
  const full: LeverEvent = {
    id: newId('e'), type, at: now(), goal: goal.id, goalWorkflow: w.id, ...(w.leverId ? { leverId: w.leverId } : {}), lever: w.lever, focus: w.focus,
    ...(goal.playbookVersion !== undefined ? { playbookVersion: goal.playbookVersion } : {}), detail,
  }
  mkdirSync(goalsDir(deps), { recursive: true })
  appendFileSync(join(goalsDir(deps), 'lever-events.jsonl'), `${JSON.stringify(full)}\n`)
  return full
}

// ---- The daily check of the workflows that do active jobs: kept after
// 14 days, how much they're used (weekly), and removed.

const DAY = 24 * 60 * 60 * 1000

export async function checkBuiltWorkflows(deps: GoalsDeps, nowMs = Date.now()): Promise<void> {
  if (!deps.workflowActivity) return
  for (const goal of listGoals(deps)) {
    for (const w of goal.jobs) {
      // The workflow that does it (the first, for now).
      const built = w.doers.find((d) => d.type === 'workflow')
      if (w.state !== 'active' || !built || w.signals?.removed) continue
      const builtAt = Date.parse(built.at)
      const lastUsed = w.signals?.lastUsedAt ? Date.parse(w.signals.lastUsedAt) : builtAt
      const since = new Date(lastUsed).toISOString()
      let activity: { exists: boolean; runs: number; done: number }
      try {
        activity = await deps.workflowActivity(built.agent, built.workflowId, since)
      } catch {
        continue
      }
      const signals = { ...w.signals }
      const latest = getGoal(deps, goal.id)
      if (!activity.exists) {
        recordLeverEvent(deps, latest, w, 'removed', { days: Math.floor((nowMs - builtAt) / DAY) })
        signals.removed = true
      } else {
        if (!signals.kept14d && nowMs - builtAt >= 14 * DAY) {
          recordLeverEvent(deps, latest, w, 'kept_14d')
          signals.kept14d = true
        }
        if (nowMs - lastUsed >= 7 * DAY) {
          recordLeverEvent(deps, latest, w, 'used', { runs: activity.runs, done: activity.done })
          signals.lastUsedAt = new Date(nowMs).toISOString()
        }
      }
      updateWorkflow(deps, latest, w.id, (x) => ({ ...x, signals }))
    }
  }
}

export function readLeverEvents(deps: GoalsDeps): LeverEvent[] {
  try {
    return readFileSync(join(goalsDir(deps), 'lever-events.jsonl'), 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line) as LeverEvent)
  } catch {
    return []
  }
}

// ---- The workspace as the planner sees it.

/** Kinds of system, in the playbook's vocabulary, guessed from an app's or
 * ability's name. */
const KIND_WORDS: [RegExp, string][] = [
  [/gmail|outlook|email|mail|resend|sendgrid|postmark/i, 'email'],
  [/slack|telegram|discord|lark|feishu|teams|whatsapp/i, 'messaging'],
  [/firecrawl|search|browser|scrape|web/i, 'web-search'],
  [/shopify|woocommerce|bigcommerce/i, 'shopify'],
  [/stripe|paddle|lemon ?squeezy|payment/i, 'stripe'],
  [/github|gitlab/i, 'github'],
  [/freescout|zendesk|intercom|helpscout|help ?desk|front/i, 'helpdesk'],
  [/hubspot|salesforce|pipedrive|crm|orders?|lp-em|shipstation/i, 'orders-or-crm'],
  [/calendar|cal\.com|calendly/i, 'calendar'],
  [/records|notion|airtable|sheets/i, 'records'],
  [/reddit/i, 'reddit'],
  [/\bx\b|twitter/i, 'x'],
  [/postgres|mysql|database|supabase|firebase|analytics|posthog|mixpanel/i, 'usage-data'],
  [/twilio|sms/i, 'sms'],
]

export function kindOf(name: string): string {
  return KIND_WORDS.find(([re]) => re.test(name))?.[1] ?? 'app'
}

/** The planner's context from what the workspace has: agents, their
 * abilities and messaging, and connected apps. Works with none of them. */
export function goalContextFrom(input: {
  about: string
  agents: { name: string; description?: string; instructions?: string; abilities: string[]; messaging: string | null }[]
  apps: { id: string; title: string; connected: boolean }[]
}): GoalContext {
  const systems = new Map<string, { name: string; kind: string; connected: boolean }>()
  const add = (name: string, connected: boolean) => {
    const key = name.toLowerCase()
    const had = systems.get(key)
    systems.set(key, { name, kind: kindOf(name), connected: connected || Boolean(had?.connected) })
  }
  for (const app of input.apps) if (app.connected) add(app.title, true)
  for (const agent of input.agents) {
    for (const ability of agent.abilities) add(ability.replace(/^@loopengine-co\//, ''), true)
    if (agent.messaging) add(agent.messaging.charAt(0).toUpperCase() + agent.messaging.slice(1), true)
  }
  return {
    about: input.about || 'Not described yet: plan from the goal itself, and keep requests easy to adapt.',
    systems: [...systems.values()],
    agents: input.agents.map((a) => ({ name: a.name, description: (a.description || a.instructions || '').replace(/\s+/g, ' ').slice(0, 240) })),
    weeklyHours: 3,
  }
}
