// Backs the console's Goals page: a goal someone types, the workflows the
// goal planner (core/system-agents/goal-planner.ts) suggests for it, and
// what the person does with each one. Each goal is one JSON file in the
// project, goals/<id>.json; what the person says about their business is
// goals/about.json, shared by every goal.
//
// A suggestion is one workflow, or a group of workflows that run in order
// (a bigger piece of the goal), with its own measure. Stored as the goal's
// `jobs` (the name files have always used). Each is in one of three states:
//   suggested  the planner proposed it (on create or Generate more), or the
//              person added it; it's built straight from here
//   active     a workflow does it (Build linked the real workflow back);
//              for a group, at least one of its steps is built
//   discarded  the person said no; never suggested again unless restored
//
// One can be done by several workflows, on any agents, and say what
// happens when one finishes: its chain. Each step is "after this
// workflow's run finishes (and its result says so), run that one", with
// that one's inputs taken from the result or from the first run's inputs.
// A group's chain is made as its steps are built, each after the one
// before. The server starts the next run itself (adapters/http.ts, when a
// run ends); each keeps its own agent, permissions, approvals and
// evidence. A chain can't loop, and stops after MAX_CHAIN_DEPTH runs.
//
// Generate more is given every suggestion in every state, so nothing comes
// back twice. Building one makes its suggested agent first when there is
// none by that name, then hands the request to Build a workflow.
//
// Older files may hold one-off jobs (kind "once", state "done", tries as
// "assignment" doers); they're kept in the file and left off the page.
// Goals saved before jobs kept them as `workflows`, built ones with a
// `built` link; they're read as jobs and saved that way next time.
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import type { ModelCall } from '../core/run-agent.js'
import { agentName, runGoalPipeline, shapeJob, type GoalBrief, type GoalContext, type GoalNeed, type LeverChoice, type PlannedGoalWorkflow, type PlannedGroup } from '../core/system-agents/goal-planner.js'
import { activePlaybook, addToLocalPlaybook, type GoalFocus } from '../core/system-agents/goal-playbooks.js'

export type GoalJobState = 'suggested' | 'active' | 'done' | 'discarded'

/** What does a job: a workflow on an agent, or, for a once job, each try
 * of its assignment (a run of its agent). */
export type JobDoer =
  | { type: 'workflow'; agent: string; workflowId: string; title: string; at: string }
  | { type: 'assignment'; agent: string; runId: string; at: string; note?: string }

/** A step in a job's chain: after a workflow's run finishes, maybe start
 * another. */
export interface ChainStep {
  id: string
  after: { agent: string; workflowId: string }
  /** always; or only when the result contains a text, or has a line that
   * starts with it (case doesn't matter). */
  when: { kind: 'always' } | { kind: 'contains' | 'line_starts'; text: string }
  run: { agent: string; workflowId: string }
  /** Each input of the next run: "result" (the run it follows ended
   * with), "result.<path>" (one field of its JSON output, when its
   * workflow has an output schema), or "input:<name>" (one of that run's
   * inputs). */
  with: Record<string, string>
}

/** Runs a chain may start one after another, after the first. */
export const MAX_CHAIN_DEPTH = 5

/** A group of workflows under a goal: steps that run in order (only
 * "sequence" for now), each built as its own workflow. Once two steps in
 * a row are built, the next is chained to start after the one before
 * (GoalJob.chain), given its result. */
export interface WorkflowGroup {
  order: 'sequence'
  steps: GroupStep[]
}

export interface GroupStep {
  id: string
  /** A short label for its workflow ("Lead scan"). */
  name: string
  request: string
  agent: { name: string; isNew: boolean; instructions?: string }
  needs: GoalNeed[]
  /** The workflow built for it, once built. */
  built?: { agent: string; workflowId: string }
}

/** A suggestion under a goal: one workflow, or a group of them (`group`).
 * Stored as before under the name "job" (a goal's `jobs`), so saved
 * goals keep working; the console calls it a workflow or a group. */
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
  restoreTo?: 'suggested'
  /** What does it, once built: the workflow (skill id) on its agent. */
  doers: JobDoer[]
  /** Older one-off jobs: when marked done, and the accepted result. */
  doneAt?: string
  result?: string
  /** For a recurring job done by several workflows: what runs after what. */
  chain?: ChainStep[]
  /** A group of workflows that run in order, instead of one. */
  group?: WorkflowGroup
  /** A job the person added themselves: their own words, and how the
   * planner judged it ("changed" or "warned", with its note). */
  added?: { idea: string; verdict: 'added' | 'changed' | 'warned'; note?: string; alternative?: string }
  /** This job's approach stays in the workspace: its lever events are
   * never sent, and its lever is never offered as a candidate for the
   * shared playbook. A job the person typed is kept this way unless they
   * agreed to share its approach; a planner's job, when it's made from a
   * lever written from such a job. */
  keepPrivate?: true
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
  /** How each round of suggestions chose its levers (the latest five):
   * every lever looked at, chosen or ruled out, and why. */
  choices?: { round: number; at: string; considered: LeverChoice[] }[]
  jobs: GoalJob[]
  createdAt: string
  updatedAt: string
  /** The holder of jobs once submitted without a goal (before goals held
   * only workflows): never listed as a goal. */
  standalone?: true
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
  /** A workflow on an agent, when it exists: its title and inputs (for
   * linking it to a job and checking a chain). */
  workflowInfo?: (agent: string, workflowId: string) => { title: string; parameters: Record<string, { required: boolean }>; outputSchema?: Record<string, unknown> } | undefined
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
 * link) read as one with jobs; one saved since, as it is. Each becomes a
 * recurring job: a built one active, done by its workflow. Each gets a
 * measure: the lever's, else how it was said to move the goal. */
export function migrateGoal(raw: Record<string, unknown>): Goal {
  if (Array.isArray(raw.jobs)) return raw as unknown as Goal
  const { workflows, ...rest } = raw
  let levers: readonly { id: string; measureLink: string }[] = []
  try {
    levers = activePlaybook().levers
  } catch {}
  const jobs = (Array.isArray(workflows) ? workflows : []).map((w): GoalJob => {
    const { built, ...x } = w as Record<string, unknown> & { built?: { agent: string; workflowId: string; title: string; at: string } }
    const lever = typeof x.leverId === 'string' ? levers.find((l) => l.id === x.leverId) : undefined
    return {
      ...(x as unknown as GoalJob),
      kind: 'recurring',
      measure: typeof x.measure === 'string' && x.measure ? x.measure : lever?.measureLink ?? (typeof x.measureLink === 'string' ? x.measureLink : ''),
      state: x.state === 'built' ? 'active' : (x.state as GoalJobState),
      doers: built ? [{ type: 'workflow', ...built }] : [],
    }
  })
  return { ...(rest as unknown as Goal), jobs }
}

/** Rewrites every goal saved before jobs in the new form (jobs, with
 * their workflows as doers), once, at start. Returns how many changed. */
export function migrateGoalFiles(deps: GoalsDeps): number {
  const dir = goalsDir(deps)
  if (!existsSync(dir)) return 0
  let changed = 0
  for (const f of readdirSync(dir).filter((name) => /^g-[a-z0-9-]+\.json$/.test(name))) {
    try {
      const raw = JSON.parse(readFileSync(join(dir, f), 'utf8')) as Record<string, unknown>
      if (Array.isArray(raw.jobs) || !Array.isArray(raw.workflows)) continue
      write(deps, withoutSaved(migrateGoal(raw)))
      changed++
    } catch (err) {
      console.error(`[loopengine] couldn't move goals/${f} to jobs:`, err instanceof Error ? err.message : err)
    }
  }
  return changed
}

/** Jobs once saved (a state since removed) are suggestions again, ready
 * to build or assign; a discarded one restores to a suggestion. */
function withoutSaved(goal: Goal): Goal {
  if (!goal.jobs.some((j) => (j.state as string) === 'saved' || (j.restoreTo as string) === 'saved')) return goal
  return { ...goal, jobs: goal.jobs.map((j) => ({ ...j, ...((j.state as string) === 'saved' ? { state: 'suggested' as const } : {}), ...((j.restoreTo as string) === 'saved' ? { restoreTo: 'suggested' as const } : {}) })) }
}

export function getGoal(deps: GoalsDeps, id: string): Goal {
  const file = goalFile(deps, id)
  if (!existsSync(file)) throw new GoalError('No such goal')
  const goal = withoutSaved(migrateGoal(JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>))
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
  // Made from a lever written from a person's job they kept private.
  const fromPrivate = Boolean(w.leverId && activePlaybook().levers.find((l) => l.id === w.leverId)?.private)
  return {
    ...(fromPrivate ? { keepPrivate: true as const } : {}),
    id: newId('w'),
    title: w.title,
    kind: 'recurring',
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
    ...(w.group ? { group: groupOf(w.group, w, deps) } : {}),
  }
}

// A planned group's steps, each with its agent (an existing one, or one to
// make when its step is built).
function groupOf(g: PlannedGroup, w: PlannedGoalWorkflow, deps: GoalsDeps): WorkflowGroup {
  return {
    order: 'sequence',
    steps: g.steps.map((st) => {
      const name = agentName(st.newAgent?.name || st.agent) || 'goal-agent'
      const exists = deps.agentExists(name)
      return {
        id: newId('s'),
        name: st.name,
        request: st.request,
        agent: exists ? { name, isNew: false } : { name, isNew: true, instructions: st.newAgent?.instructions || `You help with this goal's work: ${w.title}, the ${st.name} step. Draft for review; nothing is sent, posted or published without approval.` },
        needs: st.needs,
      }
    }),
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
        ...(planning.setup.length ? { setup: planning.setup } : {}),
        ...(planning.focus ? { focus: planning.focus } : {}),
      })
      // A focus or levers the planner wrote, because the playbook had none
      // that fit, go in the workspace's own playbook for next time.
      if (plan.brief.newFocus || plan.newLevers?.length) {
        try {
          addToLocalPlaybook(deps.projectDir(), { ...(plan.brief.newFocus ? { focuses: [plan.brief.newFocus] } : {}), levers: plan.newLevers ?? [] })
        } catch (err) {
          console.error('[loopengine] couldn\'t add the planner\'s focus and levers to the playbook:', err instanceof Error ? err.message : err)
        }
      }
      const latest = getGoal(deps, planning.id)
      // The planner is told what's there; anything it repeats anyway is dropped.
      const fresh = plan.workflows.map((w) => toJob(w, round, deps)).filter((w, i, all) =>
        !latest.jobs.some((old) => sameLever(old, w)) && all.findIndex((x) => sameLever(x, w)) === i)
      const updated: Goal = {
        ...latest,
        brief: plan.brief,
        setup: [...new Set([...latest.setup, ...plan.setup.slice(0, 4)])],
        message: plan.message,
        playbookVersion: plan.playbookVersion,
        status: 'ready',
        error: undefined,
        rounds: round,
        ...(plan.considered?.length ? { choices: [...(latest.choices ?? []), { round, at: now(), considered: plan.considered }].slice(-5) } : {}),
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
  const focus = typeof input.focus === 'string' && [...activePlaybook().focuses.map((f) => f.id), 'other'].includes(input.focus) ? (input.focus as Goal['focus']) : goal.focus
  return startPlanning(deps, { ...goal, goal: text, ...(focus ? { focus } : {}) })
}

// ---- What the person does with a job (/goals/<id>/jobs/<jobId>).

function findWorkflow(goal: Goal, jobId: string): GoalJob {
  const w = goal.jobs.find((x) => x.id === jobId)
  if (!w) throw new GoalError('No such workflow under this goal')
  return w
}

function updateWorkflow(deps: GoalsDeps, goal: Goal, jobId: string, change: (w: GoalJob) => GoalJob): Goal {
  findWorkflow(goal, jobId)
  return write(deps, { ...goal, jobs: goal.jobs.map((w) => (w.id === jobId ? change(w) : w)), updatedAt: now() })
}

export function setWorkflowState(deps: GoalsDeps, id: string, workflowId: string, action: unknown, reason?: unknown): Goal {
  const goal = getGoal(deps, id)
  const w = findWorkflow(goal, workflowId)
  if (action === 'discard') {
    if (w.state === 'discarded') return goal
    if (w.state === 'active') throw new GoalError('A workflow does this: remove it from its agent instead.')
    recordLeverEvent(deps, goal, w, 'discarded')
    return updateWorkflow(deps, goal, workflowId, (x) => ({ ...x, state: 'discarded', restoreTo: 'suggested' }))
  }
  if (action === 'restore') {
    if (w.state !== 'discarded') return goal
    recordLeverEvent(deps, goal, w, 'restored')
    return updateWorkflow(deps, goal, workflowId, ({ restoreTo, discardReason: _r, ...x }) => ({ ...x, state: restoreTo ?? 'suggested' }))
  }
  if (action === 'reason') {
    if (w.state !== 'discarded') throw new GoalError('Only a discarded workflow has a reason.')
    if (!DISCARD_REASONS.includes(reason as DiscardReason)) throw new GoalError(`reason must be one of ${DISCARD_REASONS.join(', ')}`)
    if (w.discardReason === reason) return goal
    recordLeverEvent(deps, goal, w, 'discard_reason', { reason: reason as string })
    return updateWorkflow(deps, goal, workflowId, (x) => ({ ...x, discardReason: reason as DiscardReason }))
  }
  throw new GoalError('action must be discard, restore or reason')
}

/** Build: makes the suggested agent when there is none by that name,
 * then returns Build a workflow's address, with the request and the agent
 * filled in and the goal to link the result back to. For a group, `step`
 * says which of its workflows. */
export async function prepareBuild(deps: GoalsDeps, id: string, workflowId: string, opts: { another?: boolean; step?: string } = {}): Promise<{ goal: Goal; agent: string; createdAgent: boolean; url: string }> {
  let goal = getGoal(deps, id)
  const w = findWorkflow(goal, workflowId)
  // A group's step: built on its own, into its own agent.
  if (opts.step) {
    const step = w.group?.steps.find((st) => st.id === opts.step)
    if (!step) throw new GoalError('That step isn’t in this group.')
    if (step.built) throw new GoalError('That step is built already.')
    if (w.state === 'discarded') throw new GoalError('Restore it first.')
    let createdAgent = false
    if (!deps.agentExists(step.agent.name)) {
      await deps.createAgent(step.agent.name, step.agent.instructions || `You help with: ${w.title}.`)
      createdAgent = true
    }
    if (step.agent.isNew || createdAgent) goal = updateWorkflow(deps, goal, workflowId, (x) => ({ ...x, group: x.group && { ...x.group, steps: x.group.steps.map((s2) => (s2.id === step.id ? { ...s2, agent: { name: s2.agent.name, isNew: false } } : s2)) }, ...(createdAgent ? { agentCreated: true } : {}) }))
    const params = new URLSearchParams({ agent: step.agent.name, description: step.request, goal: id, goalJob: workflowId, goalStep: step.id })
    return { goal, agent: step.agent.name, createdAgent, url: `/workflows/new?${params}` }
  }
  if (w.state === 'active' && !opts.another) throw new GoalError('A workflow already does this: add another workflow to it instead.')
  if (w.state !== 'suggested' && w.state !== 'active') throw new GoalError('Restore it first.')
  let createdAgent = false
  if (!deps.agentExists(w.agent.name)) {
    await deps.createAgent(w.agent.name, w.agent.instructions || `You help with: ${w.title}.`)
    createdAgent = true
  }
  if (w.agent.isNew || createdAgent) goal = updateWorkflow(deps, goal, workflowId, (x) => ({ ...x, agent: { name: x.agent.name, isNew: false }, ...(createdAgent ? { agentCreated: true } : {}) }))
  // Another workflow for an active job starts from a blank description.
  const params = new URLSearchParams({ agent: w.agent.name, description: opts.another ? '' : w.request, goal: id, goalJob: workflowId })
  return { goal, agent: w.agent.name, createdAgent, url: `/workflows/new?${params}` }
}

/** Build a workflow's Create it, linking the new workflow back.
 * `description` is the request as the person submitted it at Build. */
export function markBuilt(deps: GoalsDeps, id: string, workflowId: string, input: { agent?: unknown; workflowId?: unknown; title?: unknown; description?: unknown; step?: unknown }): Goal {
  const goal = getGoal(deps, id)
  const w = findWorkflow(goal, workflowId)
  if (typeof input.agent !== 'string' || typeof input.workflowId !== 'string') throw new GoalError('agent and workflowId are required')
  const doer: Extract<JobDoer, { type: 'workflow' }> = { type: 'workflow', agent: input.agent, workflowId: input.workflowId, title: typeof input.title === 'string' ? input.title : input.workflowId, at: now() }
  if (typeof input.step === 'string' && w.group?.steps.some((st) => st.id === input.step)) {
    const first = !w.doers.some((d) => d.type === 'workflow')
    if (first) recordLeverEvent(deps, goal, w, 'built', { newAgent: Boolean(w.agentCreated) })
    const built = { agent: input.agent, workflowId: input.workflowId }
    return updateWorkflow(deps, goal, workflowId, (x) => {
      const steps = x.group!.steps.map((st) => (st.id === input.step ? { ...st, built, agent: { name: built.agent, isNew: false } } : st))
      const doers = [...x.doers.filter((d) => !(d.type === 'workflow' && d.agent === doer.agent && d.workflowId === doer.workflowId)), doer]
      const chain = groupChain(deps, { ...x, doers }, steps)
      return { ...x, state: 'active', doers, group: { ...x.group!, steps }, ...(chain.length ? { chain } : {}) }
    })
  }
  const edited = typeof input.description === 'string' ? editAmount(w.request, input.description) : undefined
  // Another workflow added to an active job isn't a new build of its lever.
  const first = !w.doers.some((d) => d.type === 'workflow')
  if (first) recordLeverEvent(deps, goal, w, 'built', { newAgent: Boolean(w.agentCreated) })
  if (first && edited && edited !== 'none') recordLeverEvent(deps, goal, w, 'edited', { amount: edited })
  return updateWorkflow(deps, goal, workflowId, (x) => ({ ...x, state: 'active', doers: [...x.doers.filter((d) => !(d.type === 'workflow' && d.agent === doer.agent && d.workflowId === doer.workflowId)), doer], agent: { name: input.agent as string, isNew: false }, ...(edited ? { edited } : {}) }))
}

/** A group's chain: its own steps kept, plus one for each two built
 * steps in a row with none yet, the next given what the one before ended
 * with (its result, into its one required input, or into an input of
 * the same name). A pair whose inputs can't be matched that way is left
 * for the person to chain. */
function groupChain(deps: GoalsDeps, job: GoalJob, steps: GroupStep[]): ChainStep[] {
  const chain = [...(job.chain ?? [])]
  for (let i = 1; i < steps.length; i++) {
    const before = steps[i - 1].built
    const next = steps[i].built
    if (!before || !next || chain.some((st) => sameRef(st.after, before) && sameRef(st.run, next))) continue
    const target = deps.workflowInfo?.(next.agent, next.workflowId)
    const source = deps.workflowInfo?.(before.agent, before.workflowId)
    if (!target) continue
    const mapping: Record<string, string> = {}
    const required = Object.entries(target.parameters).filter(([, spec]) => spec.required).map(([p]) => p)
    // An input named like a field of the step before's JSON output takes
    // that field; else one named like its input takes that input.
    const props = source?.outputSchema?.type === 'object' && source.outputSchema.properties && typeof source.outputSchema.properties === 'object' ? Object.keys(source.outputSchema.properties) : []
    for (const p of Object.keys(target.parameters)) {
      if (props.includes(p)) mapping[p] = `result.${p}`
      else if (source?.parameters[p]) mapping[p] = `input:${p}`
    }
    const unfilled = required.filter((p) => !mapping[p])
    if (unfilled.length === 1) mapping[unfilled[0]] = 'result'
    if (required.some((p) => !mapping[p])) continue
    chain.push({ id: newId('c'), after: before, when: { kind: 'always' }, run: next, with: mapping })
  }
  return chain
}

// ---- A job the person adds, in their own words: the planner shapes it
// (kind, measure, agent, request, a lever or a new generic one) and
// judges it: added, added with changes, added with a warning, or refused
// (deceptive, illegal, against a platform's rules). One that's added is
// saved, ready to build or assign.

export async function addJob(deps: GoalsDeps, id: string, input: { idea?: unknown; share?: unknown }): Promise<{ goal: Goal; verdict: 'added' | 'changed' | 'warned' | 'refused'; note: string; alternative: string; jobId?: string }> {
  const idea = typeof input.idea === 'string' ? input.idea.trim() : ''
  if (idea.length < 5) throw new GoalError('Say what the workflow should do, e.g. "Thank every new customer by email within a day".')
  if (idea.length > 1000) throw new GoalError('Keep it under 1000 characters.')
  const goal = getGoal(deps, id)
  if (goal.status === 'planning') throw new GoalError('Wait for the suggestions first.')
  if (!goal.brief) throw new GoalError('This goal hasn\'t been planned yet: generate suggestions first.')
  const brief = { ...goal.brief, ...(goal.focus ? { focus: goal.focus } : {}) }
  const shaped = await shapeJob(await deps.modelCall(), {
    goal: goal.goal,
    brief,
    context: await deps.context(readAbout(deps)),
    saved: goal.jobs.map((w) => ({ title: w.title, lever: w.lever, ...(w.leverId ? { leverId: w.leverId } : {}), state: w.state })),
    idea,
  })
  if (shaped.verdict === 'refused' || !shaped.job) {
    return { goal, verdict: 'refused', note: shaped.note || 'This couldn\'t be shaped into a workflow: say a little more about what it should do.', alternative: shaped.alternative }
  }
  // The person's own idea stays theirs unless they agreed to share its
  // approach: then the lever written from it can become a candidate.
  const share = input.share === true
  if (shaped.newLever) {
    try {
      addToLocalPlaybook(deps.projectDir(), { levers: [share ? shaped.newLever : { ...shaped.newLever, private: true }] })
    } catch (err) {
      console.error('[loopengine] couldn\'t add the job\'s lever to the playbook:', err instanceof Error ? err.message : err)
    }
  }
  const job: GoalJob = {
    ...toJob(shaped.job, goal.rounds || 1, deps),
    state: 'suggested',
    ...(share ? {} : { keepPrivate: true as const }),
    added: { idea, verdict: shaped.verdict, ...(shaped.note ? { note: shaped.note } : {}), ...(shaped.alternative ? { alternative: shaped.alternative } : {}) },
  }
  const latest = getGoal(deps, id)
  const updated = write(deps, { ...latest, jobs: [...latest.jobs, job], updatedAt: now() })
  recordLeverEvent(deps, updated, job, 'added', { verdict: shaped.verdict })
  return { goal: updated, verdict: shaped.verdict, note: shaped.note, alternative: shaped.alternative, jobId: job.id }
}

/** The goals each workflow was built for ("agent|workflowId" -> goals,
 * each its id and its words), for a workflow's "For goal". */
export function jobsByWorkflow(deps: GoalsDeps): Map<string, { id: string; title: string }[]> {
  const out = new Map<string, { id: string; title: string }[]>()
  for (const goal of listGoals(deps)) {
    for (const job of goal.jobs) {
      if (job.state === 'discarded') continue
      for (const d of job.doers) {
        if (d.type !== 'workflow') continue
        const key = `${d.agent}|${d.workflowId}`
        const list = out.get(key) ?? []
        if (!list.some((g) => g.id === goal.id)) list.push({ id: goal.id, title: goal.goal })
        out.set(key, list)
      }
    }
  }
  return out
}

// ---- A recurring job's workflows and its chain.

type WorkflowRef = { agent: string; workflowId: string }
const sameRef = (a: WorkflowRef, b: WorkflowRef) => a.agent === b.agent && a.workflowId === b.workflowId
const refText = (r: WorkflowRef) => `${r.agent}/${r.workflowId}`

function refFrom(raw: unknown, what: string): WorkflowRef {
  const r = (raw ?? {}) as Record<string, unknown>
  if (typeof r.agent !== 'string' || !r.agent || typeof r.workflowId !== 'string' || !r.workflowId) throw new GoalError(`${what} needs an agent and a workflowId`)
  return { agent: r.agent, workflowId: r.workflowId }
}

/** Checks a chain against the job's workflows: each step joins two of
 * them, its condition and inputs make sense, every required input of the
 * next run is filled, and nothing loops. Returns it tidied, with ids. */
export function checkChain(deps: GoalsDeps, job: GoalJob, raw: unknown): ChainStep[] {
  if (!Array.isArray(raw)) throw new GoalError('chain must be a list of steps')
  if (raw.length > 10) throw new GoalError('A chain keeps at most 10 steps.')
  const flows = job.doers.filter((d): d is Extract<JobDoer, { type: 'workflow' }> => d.type === 'workflow')
  const doing = (r: WorkflowRef) => flows.some((d) => sameRef(d, r))
  const steps = raw.map((item, i): ChainStep => {
    const x = (item ?? {}) as Record<string, unknown>
    const n = `Step ${i + 1}`
    const after = refFrom(x.after, `${n}: "after"`)
    const run = refFrom(x.run, `${n}: "run"`)
    if (!doing(after) || !doing(run)) throw new GoalError(`${n}: both workflows must be on it (add them first).`)
    if (sameRef(after, run)) throw new GoalError(`${n}: a workflow can't follow itself.`)
    const w = (x.when ?? { kind: 'always' }) as Record<string, unknown>
    const when: ChainStep['when'] = w.kind === 'always' ? { kind: 'always' }
      : (w.kind === 'contains' || w.kind === 'line_starts') && typeof w.text === 'string' && w.text.trim() ? { kind: w.kind, text: w.text.trim().slice(0, 200) }
      : (() => { throw new GoalError(`${n}: "when" is always, contains or line_starts with a text.`) })()
    const target = deps.workflowInfo?.(run.agent, run.workflowId)
    if (!target) throw new GoalError(`${n}: ${refText(run)} isn't a workflow (any more).`)
    const source = deps.workflowInfo?.(after.agent, after.workflowId)
    if (!source) throw new GoalError(`${n}: ${refText(after)} isn't a workflow (any more).`)
    const withRaw = x.with && typeof x.with === 'object' && !Array.isArray(x.with) ? (x.with as Record<string, unknown>) : {}
    const mapping: Record<string, string> = {}
    for (const [param, from] of Object.entries(withRaw)) {
      if (typeof from !== 'string' || !from) continue
      if (!target.parameters[param]) throw new GoalError(`${n}: ${target.title} has no input "${param}".`)
      if (from !== 'result' && !RESULT_FIELD.test(from) && !(from.startsWith('input:') && source.parameters[from.slice(6)])) throw new GoalError(`${n}: "${param}" comes from "result", "result.<field>" (a field of its JSON output) or "input:<one of ${source.title}'s inputs>".`)
      mapping[param] = from
    }
    const missing = Object.entries(target.parameters).filter(([p, spec]) => spec.required && !mapping[p]).map(([p]) => p)
    if (missing.length) throw new GoalError(`${n}: say where ${target.title}'s ${missing.join(', ')} come${missing.length > 1 ? '' : 's'} from.`)
    return { id: typeof x.id === 'string' && /^c-[a-z0-9-]+$/.test(x.id) ? x.id : newId('c'), after, when, run, with: mapping }
  })
  // No loops: follow every step from each workflow.
  const next = (r: WorkflowRef) => steps.filter((st) => sameRef(st.after, r)).map((st) => st.run)
  const visit = (r: WorkflowRef, path: string[]): void => {
    if (path.includes(refText(r))) throw new GoalError(`The chain loops: ${[...path, refText(r)].join(' → ')}.`)
    for (const n of next(r)) visit(n, [...path, refText(r)])
  }
  for (const st of steps) visit(st.after, [])
  return steps
}

/** Adds a workflow (already on its agent) to a recurring job, removes one
 * (and its chain steps), or saves the job's chain. */
export function editJob(deps: GoalsDeps, id: string, jobId: string, body: { action?: unknown; agent?: unknown; workflowId?: unknown; chain?: unknown }): Goal {
  const goal = getGoal(deps, id)
  const job = findWorkflow(goal, jobId)
  if (job.kind === 'once') throw new GoalError('This one-off job is from before goals suggested workflows; it can’t take workflows.')
  if (body.action === 'link') {
    const ref = refFrom(body, 'Adding a workflow')
    const info = deps.workflowInfo?.(ref.agent, ref.workflowId)
    if (!info) throw new GoalError(`${ref.agent} has no workflow ${ref.workflowId}.`)
    if (job.state !== 'suggested' && job.state !== 'active') throw new GoalError('Restore it first.')
    if (job.doers.some((d) => d.type === 'workflow' && sameRef(d, ref))) return goal
    if (job.state === 'suggested') recordLeverEvent(deps, goal, job, 'built', { newAgent: false })
    return updateWorkflow(deps, goal, jobId, (x) => ({ ...x, state: 'active', doers: [...x.doers, { type: 'workflow', ...ref, title: info.title, at: now() }] }))
  }
  if (body.action === 'unlink') {
    const ref = refFrom(body, 'Removing a workflow')
    return updateWorkflow(deps, goal, jobId, (x) => {
      const doers = x.doers.filter((d) => !(d.type === 'workflow' && sameRef(d, ref)))
      const chain = (x.chain ?? []).filter((st) => !sameRef(st.after, ref) && !sameRef(st.run, ref))
      return { ...x, doers, ...(chain.length ? { chain } : { chain: undefined }), state: doers.length ? x.state : 'suggested' }
    })
  }
  if (body.action === 'chain') {
    const chain = checkChain(deps, job, body.chain)
    return updateWorkflow(deps, goal, jobId, (x) => ({ ...x, chain: chain.length ? chain : undefined }))
  }
  throw new GoalError('action must be link, unlink or chain')
}

/** Whether a finished run's result meets a step's condition. */
export function chainConditionMet(when: ChainStep['when'], result: string): boolean {
  if (when.kind === 'always') return true
  const text = when.text.toLowerCase()
  if (when.kind === 'contains') return result.toLowerCase().includes(text)
  return result.split('\n').some((line) => line.trim().toLowerCase().startsWith(text))
}

/** The runs to start after a workflow run finished: every step, in any
 * active job's chain, that follows its workflow and whose condition its
 * result meets, with the next run's inputs filled in. None past
 * MAX_CHAIN_DEPTH. */
/** "result.<path>": one field of a run's JSON output (its workflow's output
 * schema), by a dot path: "result.lead.email", "result.items.0.id". */
const RESULT_FIELD = /^result\.[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+)*$/

/** A field of a run's JSON output, as text: a string as it is, anything
 * else as JSON; empty when the output doesn't have it. */
export function resultField(output: unknown, path: string): string {
  let at: unknown = output
  for (const key of path.split('.')) {
    if (at === null || typeof at !== 'object') return ''
    at = (at as Record<string, unknown>)[key]
  }
  return at === undefined || at === null ? '' : typeof at === 'string' ? at : JSON.stringify(at)
}

export function chainedRuns(deps: GoalsDeps, run: { run_id: string; agent: string; workflow_id: string; status: string; result?: string; output?: unknown; params?: Record<string, string>; chain_depth?: number }): { goal: string; job: string; step: string; agent: string; workflowId: string; params: Record<string, string>; depth: number }[] {
  if (run.status !== 'done' || !run.workflow_id) return []
  const depth = (run.chain_depth ?? 0) + 1
  if (depth > MAX_CHAIN_DEPTH) return []
  const from = { agent: run.agent, workflowId: run.workflow_id }
  const result = run.result ?? ''
  return listGoals(deps).flatMap((goal) => goal.jobs.flatMap((job) => job.state !== 'active' || !job.chain ? [] : job.chain
    .filter((st) => sameRef(st.after, from) && chainConditionMet(st.when, result))
    .map((st) => ({
      goal: goal.id, job: job.id, step: st.id, agent: st.run.agent, workflowId: st.run.workflowId, depth,
      params: Object.fromEntries(Object.entries(st.with).map(([param, src]) => [param, src === 'result' ? result : RESULT_FIELD.test(src) ? resultField(run.output, src.slice(7)) : run.params?.[src.slice(6)] ?? ''])),
    }))))
}

/** A goal as its page shows it: its workflows and groups. One-off jobs
 * (from before goals suggested only workflows) are left out; their
 * files keep them. */
export async function goalView(_deps: GoalsDeps, goal: Goal): Promise<Goal> {
  return { ...goal, jobs: goal.jobs.filter((job) => job.kind !== 'once') }
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

/** What happened to a lever's job: suggested (by the planner) or added
 * (by the person, in their own words), saved, discarded (with a
 * reason), restored; built (a workflow does it) or done (a once job
 * finished); edited (its request, at Build); then, from its workflow,
 * kept_14d, used (weekly) and removed. */
/** "saved" is from before suggestions were built or assigned directly;
 * no longer recorded. */
export type LeverEventType = 'suggested' | 'added' | 'saved' | 'discarded' | 'discard_reason' | 'restored' | 'built' | 'done' | 'edited' | 'kept_14d' | 'used' | 'removed'

export interface LeverEvent {
  id: string
  type: LeverEventType
  at: string
  goal: string
  /** The job (its id under the goal). */
  job: string
  /** From a job kept to the workspace: never sent. */
  private?: true
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
    id: newId('e'), type, at: now(), goal: goal.id, job: w.id, ...(w.keepPrivate ? { private: true as const } : {}), ...(w.leverId ? { leverId: w.leverId } : {}), lever: w.lever, focus: w.focus,
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
      const built = w.doers.find((d): d is Extract<JobDoer, { type: 'workflow' }> => d.type === 'workflow')
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
    // An event from before jobs named its job goalWorkflow.
    return readFileSync(join(goalsDir(deps), 'lever-events.jsonl'), 'utf8').split('\n').filter(Boolean).map((line) => {
      const { goalWorkflow, ...e } = JSON.parse(line) as LeverEvent & { goalWorkflow?: string }
      return { ...e, job: e.job ?? goalWorkflow ?? '' }
    })
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
