// Backs "Describe a workflow" (web/workflow-page.ts) and the Workflows list
// on an agent's Overview: plans a workflow from a description
// (core/system-agents/workflow-planner.ts), checks the plan against the
// agent it would go into, and creates it: as a new agent through the same
// path as a template (web/templates-admin.ts), or added to an existing
// one without changing anything that agent already does.
import { join } from 'node:path'
import { addGatewayTool, readGatewayToolsFromDir } from '../core/gateway-tools.js'
import { addActauthRule, readActauthConfig } from './actauth-admin.js'
import { writeSkill } from './skills-admin.js'
import { createFromTemplateObject, installFailureReason, templateChecklist, type CreatedTemplateAgent, type TemplateChecklistItem, type TemplateCreateDeps } from './templates-admin.js'
import { templateScheduleStart } from '../core/system-agents/templates.js'
import { planWorkflowWithModel, slugify, workflowTemplate, type WorkflowPlan, type WorkflowPlannerTools } from '../core/system-agents/workflow-planner.js'
import { readWorkflows, removeWorkflow, saveWorkflow, type WorkflowRecord } from '../core/workflows.js'
import { createScheduledTask, listScheduledTasks, pauseScheduledTask, runScheduledTaskNow } from '../core/scheduler.js'
import { workspaceTimeZone } from '../core/time-zone.js'
import type { ModelCall } from '../core/run-agent.js'

export class WorkflowError extends Error {}

/** What the planner and the checks need to know about an agent. */
export interface WorkflowAgentInfo {
  name: string
  tools: string[]
  abilities: string[]
  rules: { tool: string; decision: 'allow' | 'ask' | 'deny'; scope: string }[]
  defaultDecision: 'allow' | 'ask' | 'deny'
  /** Its primary messaging app, if any. */
  messaging: string | null
  /** Tools from its connected services (gateway-tools.yml), by source. */
  connected?: { source: string; tools: string[] }[]
}

/** A rule the workflow wants that the agent already decides differently. */
export interface WorkflowConflict {
  tool: string
  has: 'allow' | 'ask' | 'deny'
  wants: 'allow' | 'ask' | 'deny'
}

export interface WorkflowCheck {
  /** For an existing agent: rules it already decides differently. */
  conflicts: WorkflowConflict[]
  /** Abilities the agent doesn't have yet (they'd be installed). */
  toInstall: string[]
  /** Connected-service tools it doesn't have yet (they'd be copied in). */
  toConnect: string[]
  /** Whether adding to this agent changes nothing it already does. */
  fits: boolean
}

/** Checks a plan against the agent it would be added to. */
export function checkWorkflowForAgent(plan: WorkflowPlan, agent: WorkflowAgentInfo): WorkflowCheck {
  const conflicts = plan.rules.flatMap((rule) => {
    const existing = agent.rules.find((r) => r.tool === rule.tool && r.scope === '*/*') ?? agent.rules.find((r) => r.tool === rule.tool)
    return existing && existing.decision !== rule.decision ? [{ tool: rule.tool, has: existing.decision, wants: rule.decision }] : []
  })
  const toInstall = plan.abilities.filter((spec) => !agent.abilities.some((name) => specNames(spec).includes(name)))
  const toConnect = [...new Set(plan.steps.flatMap((s) => (s.connection && s.tool && !agent.tools.includes(s.tool) ? [s.tool] : [])))]
  return { conflicts, toInstall, toConnect, fits: conflicts.length === 0 }
}

/** Marks each step whose tool comes from some agent's connected service
 * (whatever the model said) and drops that service from the abilities to
 * install: it's copied over, not installed. */
export function resolveConnections(plan: WorkflowPlan, agents: WorkflowAgentInfo[]): void {
  const sources = new Set<string>()
  for (const step of plan.steps) {
    if (!step.tool) continue
    const found = agents.flatMap((a) => a.connected ?? []).find((c) => c.tools.includes(step.tool!))
    if (!found) continue
    step.connection = found.source
    if (step.ability === found.source) delete step.ability
    sources.add(found.source)
  }
  plan.abilities = plan.abilities.filter((spec) => !sources.has(spec) || plan.steps.some((s) => s.ability === spec))
}

/** Copies the connected-service tools the workflow uses into `target`,
 * from an agent that has them. Returns the tools copied. */
function copyConnectedTools(plan: WorkflowPlan, target: string, agents: WorkflowAgentInfo[], agentDir: (name: string) => string): { copied: string[]; failed: { name: string; error: string }[] } {
  const has = new Set(agents.find((a) => a.name === target)?.tools ?? [])
  const copied: string[] = []
  const failed: { name: string; error: string }[] = []
  for (const step of plan.steps) {
    const tool = step.tool
    if (!step.connection || !tool || has.has(tool) || copied.includes(tool)) continue
    const from = agents.find((a) => a.connected?.some((c) => c.source === step.connection && c.tools.includes(tool)))
    const entry = from && readGatewayToolsFromDir(agentDir(from.name)).find((e) => e.name === step.connection)
    const slug = tool.slice(String(step.connection).length + 1)
    if (!entry || !entry.slugs.includes(slug)) {
      failed.push({ name: tool, error: `no agent has ${tool} connected any more` })
      continue
    }
    try {
      const resolved = entry.resolved?.[slug]
      addGatewayTool(target, { provider: entry.provider, name: entry.name, slugs: [slug], ...(entry.cliCommand ? { cliCommand: entry.cliCommand } : {}), ...(resolved ? { resolved: { [slug]: resolved } } : {}) })
      copied.push(tool)
    } catch (err) {
      failed.push({ name: tool, error: err instanceof Error ? err.message : String(err) })
    }
  }
  return { copied, failed }
}

/** The package names a spec could install as: "lp-x", "@acme/lp-x@1.0.0" →
 * "@acme/lp-x", "file:/…/lp-x" or "github:org/lp-x" → "lp-x". */
function specNames(spec: string): string[] {
  const bare = spec.replace(/^file:/, '').replace(/^github:/, '').replace(/#.*$/, '')
  const last = bare.split('/').pop() ?? bare
  const scoped = spec.match(/^(@[^/]+\/[^@]+)/)?.[1]
  const named = spec.match(/^([^@/:][^@]*)(@.*)?$/)?.[1]
  return [...new Set([scoped, named, last.replace(/@.*$/, '')].filter((n): n is string => Boolean(n)))]
}

export interface PlannedWorkflow {
  plan: WorkflowPlan
  /** The check against the suggested agent, when the plan names one. */
  check?: WorkflowCheck
  /** Why the suggestion was changed, if it was (e.g. a conflict). */
  note?: string
}

/** Plans a workflow from a description, then checks the suggested agent:
 * one that would have a decision changed, or doesn't exist, becomes a new
 * agent instead, saying why. */
export async function planWorkflow(description: unknown, modelCall: ModelCall, tools: WorkflowPlannerTools & { agentInfo(): Promise<WorkflowAgentInfo[]> }): Promise<PlannedWorkflow> {
  const text = typeof description === 'string' ? description.trim() : ''
  if (text.length < 15) throw new WorkflowError('Describe the workflow in a sentence or two: what starts it, the steps, and where you want to decide.')
  if (text.length > 4000) throw new WorkflowError('That description is too long: keep it under 4000 characters.')
  const result = await planWorkflowWithModel(modelCall, text, tools)
  if (!result.plan) throw new WorkflowError(result.reply || 'The planner did not produce a plan; try describing the steps more plainly.')
  const plan = result.plan
  const agents = await tools.agentInfo()
  resolveConnections(plan, agents)
  if (plan.target.kind !== 'existing' || !plan.target.agent) return { plan }
  const agent = agents.find((a) => a.name === plan.target.agent)
  if (!agent) {
    plan.target = { kind: 'new', reason: `${plan.target.agent} doesn't exist, so it would be a new agent.` }
    return { plan, note: plan.target.reason }
  }
  const check = checkWorkflowForAgent(plan, agent)
  if (!check.fits) {
    const note = `Adding it to ${agent.name} would change ${check.conflicts.map((c) => `${c.tool} (${c.has} there, ${c.wants} here)`).join(', ')}, so a new agent is suggested.`
    plan.target = { kind: 'new', reason: note }
    return { plan, check, note }
  }
  return { plan, check }
}

// Planning can take a few minutes (the model looks around first), longer
// than a request should stay open: it runs as a job the page checks on.
export interface PlanJob {
  id: string
  status: 'planning' | 'done' | 'failed'
  startedAt: string
  result?: PlannedWorkflow
  error?: string
}

const JOB_TTL_MS = 60 * 60 * 1000
const planJobs = new Map<string, PlanJob & { at: number }>()

/** Starts planning in the background; check on it with getPlanJob. */
export function startPlanJob(run: () => Promise<PlannedWorkflow>): PlanJob {
  for (const [id, job] of planJobs) if (Date.now() - job.at > JOB_TTL_MS) planJobs.delete(id)
  const id = `plan-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  const job = { id, status: 'planning' as const, startedAt: new Date().toISOString(), at: Date.now() }
  planJobs.set(id, job)
  run().then(
    (result) => planJobs.set(id, { ...job, status: 'done', result }),
    (err) => planJobs.set(id, { ...job, status: 'failed', error: err instanceof Error ? err.message : String(err) }),
  )
  const { at: _at, ...view } = job
  return view
}

export function getPlanJob(id: string): PlanJob | undefined {
  const job = planJobs.get(id)
  if (!job) return undefined
  const { at: _at, ...view } = job
  return view
}

export interface CreatedWorkflow {
  agent: string
  /** A new agent was made for it. */
  newAgent: boolean
  workflow: string
  abilities: { installed: string[]; failed: { name: string; error: string }[] }
  /** Rules left as the agent already had them. */
  keptDecisions: WorkflowConflict[]
  checklist: TemplateChecklistItem[]
  schedule?: CreatedTemplateAgent['schedule']
  scheduleError?: string
  loadError?: string
}

export interface WorkflowCreateDeps extends TemplateCreateDeps {
  agentDir(name: string): string
  agentInfo(): Promise<WorkflowAgentInfo[]>
  /** Makes sure the agent is loaded once its new tools and skill are in place. */
  reloadAgent(name: string): Promise<void>
}

/** A to-do for each step nothing could be found for, first in the list. */
function withMissingSteps(plan: WorkflowPlan, agent: string, checklist: TemplateChecklistItem[]): TemplateChecklistItem[] {
  const href = `/agents/config?agent=${encodeURIComponent(agent)}&tab=abilities`
  const missing = plan.steps.flatMap((s) => (s.missing ? [{ label: `Find or add a tool for "${s.title}": ${s.missing}`, href }] : []))
  return [...missing, ...checklist]
}

/** Creates the workflow: in a new agent (as a template would), or in an
 * existing one. An existing agent keeps every decision it already has: a
 * conflicting rule is left alone and reported, not changed. */
export async function createWorkflow(input: { plan?: unknown; target?: unknown; description?: unknown }, deps: WorkflowCreateDeps): Promise<CreatedWorkflow> {
  const plan = input.plan as WorkflowPlan | undefined
  if (!plan || typeof plan !== 'object' || !Array.isArray(plan.steps) || !plan.skill || !plan.newAgent) throw new WorkflowError('Plan the workflow first.')
  const target = (input.target ?? plan.target) as { kind?: string; agent?: string }
  const description = typeof input.description === 'string' ? input.description.trim().slice(0, 4000) : undefined
  const record = (scheduleName?: string): WorkflowRecord => ({
    id: plan.id,
    name: plan.name,
    summary: plan.summary,
    trigger: { kind: plan.trigger.kind, description: plan.trigger.description },
    steps: plan.steps,
    startMessage: plan.startMessage,
    ...(scheduleName ? { scheduleName } : {}),
    ...(description ? { description } : {}),
    createdAt: new Date().toISOString(),
  })
  const agents = await deps.agentInfo()
  resolveConnections(plan, agents)
  const template = workflowTemplate(plan)

  if (target.kind !== 'existing') {
    const created = await createFromTemplateObject(template, deps)
    // Read on its next run: the agent needs no reloading for it.
    const connected = copyConnectedTools(plan, created.name, agents, deps.agentDir)
    const loadError = created.loadError
    saveWorkflow(deps.agentDir(created.name), record(created.schedule ? plan.name : undefined))
    return {
      agent: created.name,
      newAgent: true,
      workflow: plan.name,
      abilities: { installed: [...created.abilities.installed, ...connected.copied], failed: [...created.abilities.failed, ...connected.failed] },
      keptDecisions: [],
      checklist: withMissingSteps(plan, created.name, created.checklist),
      ...(created.schedule ? { schedule: created.schedule } : {}),
      ...(created.scheduleError ? { scheduleError: created.scheduleError } : {}),
      ...(loadError ? { loadError } : {}),
    }
  }

  const agent = agents.find((a) => a.name === target.agent)
  if (!agent) throw new WorkflowError(`There's no agent named ${target.agent ?? '(none)'}.`)
  const check = checkWorkflowForAgent(plan, agent)

  // 1. Rules: only for tools the agent has no rule for.
  const { rules: current } = readActauthConfig(agent.name)
  for (const rule of plan.rules) {
    if (current.some((r) => r.tool === rule.tool)) continue
    let name = slugify(`${plan.id}-${rule.tool}`, `${plan.id}-rule`)
    for (let i = 2; current.some((r) => r.name === name); i++) name = `${slugify(`${plan.id}-${rule.tool}`)}-${i}`
    addActauthRule(agent.name, { name, scope: '*/*', tool: rule.tool, decision: rule.decision })
    current.push({ name, scope: '*/*', tool: rule.tool, decision: rule.decision })
  }

  // 2. Abilities it doesn't have yet.
  const installed: string[] = []
  const failed: { name: string; error: string }[] = []
  for (const spec of check.toInstall) {
    if (!deps.installAbility) {
      failed.push({ name: spec, error: 'installing abilities needs LOOPENGINE_ADMIN_AUTH set on the server' })
      continue
    }
    try {
      await deps.installAbility(agent.name, spec)
      installed.push(spec)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (/already installed/i.test(message)) continue
      failed.push({ name: spec, error: installFailureReason(err) })
    }
  }

  // Connected-service tools it doesn't have yet.
  const connected = copyConnectedTools(plan, agent.name, agents, deps.agentDir)
  installed.push(...connected.copied)
  failed.push(...connected.failed)

  // 3. Its steps, as a skill; then load the agent again with all of it.
  writeSkill(agent.name, plan.id, { description: plan.skill.description, body: plan.skill.body })
  let loadError: string | undefined
  try {
    await deps.reloadAgent(agent.name)
  } catch (err) {
    loadError = err instanceof Error ? err.message : String(err)
  }

  // 4. Its schedule, paused until the person turns it on.
  let schedule: CreatedTemplateAgent['schedule']
  let scheduleError: string | undefined
  if (template.setup.schedule) {
    try {
      const startAt = templateScheduleStart(template.setup.schedule)
      const task = await createScheduledTask({
        agent: agent.name,
        message: plan.startMessage,
        schedule: { every: template.setup.schedule.every, ...(startAt ? { start_at: startAt } : {}) },
        task_name: plan.name,
      })
      await pauseScheduledTask(task.task_id)
      schedule = { description: plan.trigger.description, timeZone: workspaceTimeZone(), ...(startAt ? { next_run_at: startAt } : {}) }
    } catch (err) {
      scheduleError = err instanceof Error ? err.message : String(err)
    }
  }

  saveWorkflow(deps.agentDir(agent.name), record(schedule ? plan.name : undefined))
  return {
    agent: agent.name,
    newAgent: false,
    workflow: plan.name,
    abilities: { installed, failed },
    keptDecisions: check.conflicts,
    checklist: withMissingSteps(plan, agent.name, templateChecklist(template, agent.name, deps, failed)),
    ...(schedule ? { schedule } : {}),
    ...(scheduleError ? { scheduleError } : {}),
    ...(loadError ? { loadError } : {}),
  }
}

export interface AgentWorkflowView extends WorkflowRecord {
  schedule?: { taskId: string; status: string; nextRunAt?: string; lastRunAt?: string; lastStatus?: string; waiting: boolean }
}

/** An agent's workflows, each with its schedule's state when it has one. */
export async function listAgentWorkflows(agentName: string, agentDir: string): Promise<AgentWorkflowView[]> {
  const workflows = readWorkflows(agentDir)
  if (!workflows.length) return []
  const tasks = await listScheduledTasks({ agent: agentName })
  return workflows.map((w) => {
    const task = w.scheduleName ? tasks.find((t) => t.task_name === w.scheduleName && t.status !== 'cancelled') : undefined
    return task
      ? {
          ...w,
          schedule: {
            taskId: task.task_id,
            status: task.status,
            ...(task.next_run_at ? { nextRunAt: task.next_run_at } : {}),
            ...(task.last_run_at ? { lastRunAt: task.last_run_at } : {}),
            ...(task.last_status ? { lastStatus: task.last_status } : {}),
            waiting: Boolean(task.pending) || task.status === 'awaiting_approval',
          },
        }
      : w
  })
}

/** Starts a workflow now: its schedule runs once (a paused one goes back
 * to paused after), or, with no schedule, a one-off run. Questions and
 * approvals go to the agent's messaging app. */
export async function runWorkflowNow(agentName: string, agentDir: string, id: string): Promise<{ taskId: string }> {
  const workflow = readWorkflows(agentDir).find((w) => w.id === id)
  if (!workflow) throw new WorkflowError(`No workflow ${id} in ${agentName}.`)
  const views = await listAgentWorkflows(agentName, agentDir)
  const task = views.find((w) => w.id === id)?.schedule
  if (task) {
    if (task.status === 'running' || task.waiting) throw new WorkflowError('It is already running, or waiting for a decision.')
    await runScheduledTaskNow(task.taskId)
    return { taskId: task.taskId }
  }
  const once = await createScheduledTask({ agent: agentName, message: workflow.startMessage, schedule: { run_at: new Date().toISOString() }, task_name: `${workflow.name} (run now)` })
  return { taskId: once.task_id }
}

/** Forgets a workflow (its skill, schedule and rules stay). */
export function forgetWorkflow(agentDir: string, id: string): void {
  removeWorkflow(agentDir, id)
}

export function agentDirIn(projectDir: string, name: string): string {
  return join(projectDir, 'agents', name)
}
