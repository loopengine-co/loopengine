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
import { planWorkflowWithModel, slugify, workflowTemplate, type PlannedMcpServer, type WorkflowPlan, type WorkflowPlannerTools } from '../core/system-agents/workflow-planner.js'
import { mcpAbilityNames, type GeneratedMcpAbility, type McpAbilityRequest } from '../core/mcp-ability-generator.js'
import type { McpDirectoryServer } from '../core/mcp-directory.js'
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

// ---- MCP servers ----

/** What planning and Create need for steps done by an MCP server. */
export interface WorkflowMcpDeps {
  getServer(id: string): Promise<McpDirectoryServer | undefined>
  /** The workspace ability already made from the server at `url`, with
   * its tools (the server's names and the installed ones). */
  existingFor(url: string): { spec: string; tools: { name: string; remote: string }[] } | undefined
  /** A setting's value, project-wide. */
  keyValue(name: string): string | undefined
}

export interface WorkflowMcpCreateDeps extends WorkflowMcpDeps {
  generate(request: Omit<McpAbilityRequest, 'modelCall'>): Promise<GeneratedMcpAbility>
  /** Stores a generated package as a workspace ability; returns its spec. */
  store(dir: string, source: string): string
  /** Saves a key project-wide. */
  saveKey(name: string, value: string): Promise<void>
}

/** Looks up each MCP server the plan's steps name: a server that can't
 * be found leaves its steps missing; the rest are listed on the plan
 * with the ability each would become and whether its key is set. */
export async function resolveMcpServers(plan: WorkflowPlan, deps: WorkflowMcpDeps): Promise<void> {
  const ids = [...new Set(plan.steps.flatMap((s) => (s.mcp ? [s.mcp] : [])))]
  const servers: PlannedMcpServer[] = []
  for (const id of ids) {
    const server = await deps.getServer(id).catch(() => undefined)
    if (!server) {
      for (const step of plan.steps) {
        if (step.mcp !== id) continue
        delete step.mcp
        step.missing = `the MCP server ${id} couldn't be found`
      }
      plan.gaps = [...plan.gaps, `The MCP server ${id} couldn't be found, so its steps have no tool yet.`].slice(0, 10)
      continue
    }
    const names = mcpAbilityNames(server)
    const existing = deps.existingFor(server.url)
    servers.push({
      id,
      title: server.title,
      url: server.url,
      description: server.description,
      verified: server.verified,
      source: server.source,
      ability: names.name,
      keyEnv: names.keyEnv,
      keySet: deps.keyValue(names.keyEnv) !== undefined,
      ...(existing ? { existing: existing.spec } : {}),
    })
  }
  if (servers.length) plan.mcpServers = servers
  else delete plan.mcpServers
}

/** On Create: each MCP server on the plan becomes a private ability (or
 * reuses the one already made from it), and its steps point at that
 * ability's tools. A server that can't be set up leaves its steps
 * missing and is reported. `keys` are what the person typed per server. */
export async function prepareMcpAbilities(plan: WorkflowPlan, keys: Record<string, string>, deps: WorkflowMcpCreateDeps | undefined): Promise<{ made: string[]; failed: { name: string; error: string }[] }> {
  const made: string[] = []
  const failed: { name: string; error: string }[] = []
  for (const planned of plan.mcpServers ?? []) {
    const steps = plan.steps.map((step, index) => ({ step, index })).filter(({ step }) => step.mcp === planned.id)
    if (!steps.length) continue
    const fail = (error: string) => {
      failed.push({ name: planned.title, error })
      for (const { step } of steps) {
        delete step.mcp
        step.missing = `${planned.title}: ${error}`
      }
    }
    if (!deps) {
      fail('setting up MCP servers isn\'t available on this server')
      continue
    }
    // The app, connected already or connected now; and the server tool for
    // each step (the planner's when the app has it, else worked out).
    const existing = deps.existingFor(planned.url)
    const known = existing && steps.every(({ step }) => step.tool && existing.tools.some((t) => t.remote === step.tool))
    let spec: string
    let stepTools: Record<number, string>
    let names: { remote: string; name: string }[]
    if (existing && known) {
      spec = existing.spec
      stepTools = Object.fromEntries(steps.map(({ step, index }) => [index, step.tool!]))
      names = existing.tools
    } else {
      const server = await deps.getServer(planned.id).catch(() => undefined)
      if (!server) {
        fail('the server couldn\'t be found any more')
        continue
      }
      const typed = keys[planned.id]?.trim()
      const key = typed || deps.keyValue(planned.keyEnv)
      let generated: GeneratedMcpAbility
      try {
        generated = await deps.generate({
          server,
          ...(key ? { key } : {}),
          workflow: { name: plan.name, summary: plan.summary, steps: steps.map(({ step, index }) => ({ index, title: step.title, kind: step.kind, ...(step.detail ? { detail: step.detail } : {}), ...(step.tool ? { tool: step.tool } : {}) })) },
        })
      } catch (err) {
        fail(err instanceof Error ? err.message : String(err))
        continue
      }
      stepTools = generated.stepTools
      names = generated.tools
      if (existing) {
        // Connected already: only the step matching was needed.
        spec = existing.spec
      } else {
        if (typed && generated.keyEnv) {
          try {
            await deps.saveKey(generated.keyEnv, typed)
          } catch (err) {
            failed.push({ name: planned.title, error: `its key wasn't saved (${err instanceof Error ? err.message : String(err)}); add ${generated.keyEnv} from the checklist` })
            if (!plan.keys.includes(generated.keyEnv)) plan.keys.push(generated.keyEnv)
          }
        }
        spec = deps.store(generated.dir, `mcp:${server.url}`)
        made.push(generated.name)
      }
    }
    const installedName = (remote: string) => names.find((t) => t.remote === remote)?.name ?? remote
    const tools: string[] = []
    for (const { step, index } of steps) {
      delete step.mcp
      step.ability = spec
      const remote = stepTools[index]
      if (!remote) {
        delete step.tool
        step.missing = `${planned.title} has no tool for this`
        continue
      }
      step.tool = installedName(remote)
      if (!tools.includes(remote)) tools.push(remote)
      // An approval step's tool asks first, whatever its default.
      if (step.kind === 'approval') {
        const rule = plan.rules.find((r) => r.tool === step.tool)
        if (rule) rule.decision = 'ask'
        else plan.rules.push({ tool: step.tool, decision: 'ask' })
      }
    }
    // The skill was written with the server's own tool names.
    for (const { remote, name } of names) {
      if (remote === name) continue
      plan.skill.body = plan.skill.body.replace(new RegExp(`(?<![A-Za-z0-9_])${remote.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z0-9_])`, 'g'), name)
    }
    // Added to the agent as an app, with just these tools.
    if (tools.length) plan.apps = [...(plan.apps ?? []).filter((a) => a.id !== planned.id), { id: planned.id, title: planned.title, tools }]
  }
  delete plan.mcpServers
  return { made, failed }
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
export async function planWorkflow(description: unknown, modelCall: ModelCall, tools: WorkflowPlannerTools & { agentInfo(): Promise<WorkflowAgentInfo[]>; mcp?: WorkflowMcpDeps }): Promise<PlannedWorkflow> {
  const text = typeof description === 'string' ? description.trim() : ''
  if (text.length < 15) throw new WorkflowError('Describe the workflow in a sentence or two: what starts it, the steps, and where you want to decide.')
  if (text.length > 4000) throw new WorkflowError('That description is too long: keep it under 4000 characters.')
  const result = await planWorkflowWithModel(modelCall, text, tools)
  if (!result.plan) throw new WorkflowError(result.reply || 'The planner did not produce a plan; try describing the steps more plainly.')
  const plan = result.plan
  const agents = await tools.agentInfo()
  resolveConnections(plan, agents)
  if (tools.mcp) await resolveMcpServers(plan, tools.mcp)
  else for (const step of plan.steps) if (step.mcp) { delete step.mcp; step.missing = step.missing ?? 'no ability does this' }
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
  /** Sets up the plan's MCP servers as private abilities. */
  mcp?: WorkflowMcpCreateDeps
  /** Gives an agent that already has an app more of its tools (at their
   * default permission), keeping the ones it has. */
  addAppTools?: (agent: string, spec: string, tools: string[]) => Promise<void>
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
export async function createWorkflow(input: { plan?: unknown; target?: unknown; description?: unknown; mcpKeys?: unknown }, deps: WorkflowCreateDeps): Promise<CreatedWorkflow> {
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
  const keys = input.mcpKeys && typeof input.mcpKeys === 'object' ? Object.fromEntries(Object.entries(input.mcpKeys as Record<string, unknown>).flatMap(([k, v]) => (typeof v === 'string' && v.trim() ? [[k, v.trim()]] : []))) : {}
  const mcp = await prepareMcpAbilities(plan, keys, deps.mcp)
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
      abilities: { installed: [...created.abilities.installed, ...connected.copied], failed: [...mcp.failed, ...created.abilities.failed, ...connected.failed] },
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
  const failed: { name: string; error: string }[] = [...mcp.failed]
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

  // Apps: added with just the tools the steps use, or those tools added
  // to the agent's when it has the app already.
  const appsToConnect: string[] = []
  for (const app of plan.apps ?? []) {
    const spec = deps.prepareApp ? await deps.prepareApp(app.id) : undefined
    if (!spec) {
      appsToConnect.push(app.title)
      continue
    }
    if (!deps.installAbility) {
      failed.push({ name: app.title, error: 'adding apps needs LOOPENGINE_ADMIN_AUTH set on the server' })
      continue
    }
    try {
      await deps.installAbility(agent.name, spec, { mcpTools: app.tools })
      installed.push(app.title)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (/already installed/i.test(message) && deps.addAppTools) {
        try {
          await deps.addAppTools(agent.name, spec, app.tools)
          installed.push(app.title)
        } catch (e) {
          failed.push({ name: app.title, error: e instanceof Error ? e.message : String(e) })
        }
      } else failed.push({ name: app.title, error: installFailureReason(err) })
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
    checklist: withMissingSteps(plan, agent.name, templateChecklist(template, agent.name, deps, failed, appsToConnect)),
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
