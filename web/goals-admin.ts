// Backs the console's Goals page: a goal someone types, the workflows the
// goal planner (core/system-agents/goal-planner.ts) suggests for it, and
// what the person does with each one. Each goal is one JSON file in the
// project, goals/<id>.json; what the person says about their business is
// goals/about.json, shared by every goal.
//
// A workflow under a goal is in one of four states:
//   suggested  the planner proposed it (on create or Generate more)
//   saved      the person kept it
//   built      it was built into its agent (linked to the real workflow)
//   discarded  the person said no; never suggested again unless restored
// Generate more is given every workflow in every state, so nothing comes
// back twice. Building one makes its suggested agent first when there is
// none by that name, then hands the request to Build a workflow.
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import type { ModelCall } from '../core/run-agent.js'
import { agentName, runGoalPipeline, type GoalBrief, type GoalContext, type GoalNeed, type PlannedGoalWorkflow } from '../core/system-agents/goal-planner.js'
import { GOAL_FOCUSES, type GoalFocus } from '../core/system-agents/goal-playbooks.js'

export type GoalWorkflowState = 'suggested' | 'saved' | 'built' | 'discarded'

export interface GoalWorkflow {
  id: string
  title: string
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
  state: GoalWorkflowState
  /** Where a discarded one goes back to on Restore. */
  restoreTo?: Exclude<GoalWorkflowState, 'discarded'>
  /** Set once built: the agent and the workflow (skill id) it became. */
  built?: { agent: string; workflowId: string; title: string; at: string }
  /** Which generation suggested it (1 on create). */
  round: number
}

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
  rounds: number
  workflows: GoalWorkflow[]
  createdAt: string
  updatedAt: string
}

export class GoalError extends Error {}

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

export function getGoal(deps: GoalsDeps, id: string): Goal {
  const file = goalFile(deps, id)
  if (!existsSync(file)) throw new GoalError('No such goal')
  const goal = JSON.parse(readFileSync(file, 'utf8')) as Goal
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

// ---- What the person says about their business (all goals share it).

export function readAbout(deps: GoalsDeps): string {
  const file = join(goalsDir(deps), 'about.json')
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as { about?: unknown }
    return typeof parsed.about === 'string' ? parsed.about : ''
  } catch {
    return ''
  }
}

export function writeAbout(deps: GoalsDeps, about: unknown): string {
  if (typeof about !== 'string') throw new GoalError('about must be text')
  const text = about.trim().slice(0, 2000)
  mkdirSync(goalsDir(deps), { recursive: true })
  writeFileSync(join(goalsDir(deps), 'about.json'), `${JSON.stringify({ about: text }, null, 2)}\n`)
  return text
}

// ---- Planning.

const running = new Map<string, Promise<void>>()

/** Resolves once the goal's current planning is done (for tests). */
export function goalPlanning(id: string): Promise<void> {
  return running.get(id) ?? Promise.resolve()
}

const sameLever = (a: { leverId?: string; lever: string; title: string }, b: { leverId?: string; lever: string; title: string }) =>
  Boolean((a.leverId && a.leverId === b.leverId) || a.lever.toLowerCase() === b.lever.toLowerCase() || a.title.toLowerCase() === b.title.toLowerCase())

function toWorkflow(w: PlannedGoalWorkflow, round: number, deps: GoalsDeps): GoalWorkflow {
  const name = agentName(w.newAgent?.name || w.agent) || 'goal-agent'
  const exists = deps.agentExists(name)
  return {
    id: newId('w'),
    title: w.title,
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
        saved: planning.workflows.map((w) => ({ title: w.title, lever: w.lever, ...(w.leverId ? { leverId: w.leverId } : {}), state: w.state })),
        ...(planning.focus ? { focus: planning.focus } : {}),
      })
      const latest = getGoal(deps, planning.id)
      // The planner is told what's there; anything it repeats anyway is dropped.
      const fresh = plan.workflows.map((w) => toWorkflow(w, round, deps)).filter((w, i, all) =>
        !latest.workflows.some((old) => sameLever(old, w)) && all.findIndex((x) => sameLever(x, w)) === i)
      write(deps, {
        ...latest,
        brief: plan.brief,
        setup: [...new Set([...latest.setup, ...plan.setup])],
        message: plan.message,
        status: 'ready',
        error: undefined,
        rounds: round,
        workflows: [...latest.workflows, ...fresh],
        updatedAt: now(),
      } as Goal)
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
  const goal: Goal = { id: newId('g'), goal: text, setup: [], message: '', status: 'planning', rounds: 0, workflows: [], createdAt: now(), updatedAt: now() }
  return startPlanning(deps, write(deps, goal))
}

/** Generate more, optionally after changing the goal's wording or focus. */
export function generateMore(deps: GoalsDeps, id: string, input: { goal?: unknown; focus?: unknown } = {}): Goal {
  const goal = getGoal(deps, id)
  const text = typeof input.goal === 'string' && input.goal.trim() ? input.goal.trim().slice(0, MAX_GOAL_CHARS) : goal.goal
  const focus = typeof input.focus === 'string' && ([...GOAL_FOCUSES, 'other'] as string[]).includes(input.focus) ? (input.focus as Goal['focus']) : goal.focus
  return startPlanning(deps, { ...goal, goal: text, ...(focus ? { focus } : {}) })
}

// ---- What the person does with a workflow.

function findWorkflow(goal: Goal, workflowId: string): GoalWorkflow {
  const w = goal.workflows.find((x) => x.id === workflowId)
  if (!w) throw new GoalError('No such workflow under this goal')
  return w
}

function updateWorkflow(deps: GoalsDeps, goal: Goal, workflowId: string, change: (w: GoalWorkflow) => GoalWorkflow): Goal {
  findWorkflow(goal, workflowId)
  return write(deps, { ...goal, workflows: goal.workflows.map((w) => (w.id === workflowId ? change(w) : w)), updatedAt: now() })
}

export function setWorkflowState(deps: GoalsDeps, id: string, workflowId: string, action: unknown): Goal {
  const goal = getGoal(deps, id)
  const w = findWorkflow(goal, workflowId)
  if (action === 'save') {
    if (w.state !== 'suggested') throw new GoalError('Only a suggestion can be saved.')
    return updateWorkflow(deps, goal, workflowId, (x) => ({ ...x, state: 'saved' }))
  }
  if (action === 'discard') {
    if (w.state === 'discarded') return goal
    if (w.state === 'built') throw new GoalError('This one is built: remove the workflow from its agent instead.')
    return updateWorkflow(deps, goal, workflowId, (x) => ({ ...x, state: 'discarded', restoreTo: x.state as 'suggested' | 'saved' }))
  }
  if (action === 'restore') {
    if (w.state !== 'discarded') return goal
    return updateWorkflow(deps, goal, workflowId, ({ restoreTo, ...x }) => ({ ...x, state: restoreTo ?? 'suggested' }))
  }
  throw new GoalError('action must be save, discard or restore')
}

/** Build workflow: makes the suggested agent when there is none by that
 * name, then returns where Build a workflow takes over, with the request
 * and the agent filled in and the goal to link the result back to. */
export async function prepareBuild(deps: GoalsDeps, id: string, workflowId: string): Promise<{ goal: Goal; agent: string; createdAgent: boolean; url: string }> {
  let goal = getGoal(deps, id)
  const w = findWorkflow(goal, workflowId)
  if (w.state === 'built') throw new GoalError('This workflow is already built.')
  if (w.state !== 'saved') throw new GoalError('Save it first.')
  let createdAgent = false
  if (!deps.agentExists(w.agent.name)) {
    await deps.createAgent(w.agent.name, w.agent.instructions || `You help with: ${w.title}.`)
    createdAgent = true
  }
  if (w.agent.isNew) goal = updateWorkflow(deps, goal, workflowId, (x) => ({ ...x, agent: { name: x.agent.name, isNew: false } }))
  const params = new URLSearchParams({ agent: w.agent.name, description: w.request, goal: id, goalWorkflow: workflowId })
  return { goal, agent: w.agent.name, createdAgent, url: `/workflows/new?${params}` }
}

/** Build a workflow's Create it, linking the new workflow back. */
export function markBuilt(deps: GoalsDeps, id: string, workflowId: string, input: { agent?: unknown; workflowId?: unknown; title?: unknown }): Goal {
  const goal = getGoal(deps, id)
  if (typeof input.agent !== 'string' || typeof input.workflowId !== 'string') throw new GoalError('agent and workflowId are required')
  const built = { agent: input.agent, workflowId: input.workflowId, title: typeof input.title === 'string' ? input.title : input.workflowId, at: now() }
  return updateWorkflow(deps, goal, workflowId, (x) => ({ ...x, state: 'built', built, agent: { name: input.agent as string, isNew: false } }))
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
