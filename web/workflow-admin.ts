// Backs "Describe a workflow" (web/workflow-page.ts) and the Workflows list
// on an agent's Overview: plans a workflow from a description
// (core/system-agents/workflow-planner.ts) for the agent the person picked,
// lists what that agent still needs (apps, messaging) for the person to
// add first, and creates it in that agent without changing anything the
// agent already does.
import { existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { addGatewayTool, readGatewayToolsFromDir } from '../core/gateway-tools.js'
import { applyPlannedRules } from './actauth-admin.js'
import { writeSkill } from './skills-admin.js'
import { setAgentEnvVar } from './env-admin.js'
import { installFailureReason, templateChecklist, type CreatedTemplateAgent, type TemplateChecklistItem, type TemplateCreateDeps } from './templates-admin.js'
import { templateScheduleStart } from '../core/system-agents/templates.js'
import { planParameters, planWebhook, planWorkflowWithModel, workflowTemplate, type PlannedMcpServer, type WorkflowPlan, type WorkflowPlannerTools } from '../core/system-agents/workflow-planner.js'
import { createTrigger, getTriggerStore, listTriggers, publicTrigger, type PublicTrigger } from '../core/workflow-triggers.js'
import { mcpAbilityNames, type GeneratedMcpAbility, type McpAbilityRequest } from '../core/mcp-ability-generator.js'
import type { McpDirectoryServer } from '../core/mcp-directory.js'
import { clearWorkflowFields, migrateWorkflowsFile, readWorkflow, readWorkflows, setWorkflowFields, validateParams, workflowRunMessage, type Workflow, type WorkflowModel } from '../core/workflows.js'
import { readEvals, workflowScores, type WorkflowEvals, type WorkflowScores } from './workflow-evidence.js'
import { isUnderWay, listRuns, type WorkflowRun } from '../core/workflow-runs.js'
import { cancelScheduledTask, createScheduledTask, deleteScheduledTask, describeSchedule, getSchedulerStore, listScheduledTasks, pauseScheduledTask, type ScheduledTask } from '../core/scheduler.js'
import { wallTimeAt, workspaceTimeZone } from '../core/time-zone.js'
import type { ModelCall } from '../core/run-agent.js'

export class WorkflowError extends Error {}

/** What the planner and the checks need to know about an agent. */
export interface WorkflowAgentInfo {
  name: string
  /** The name people see, when it isn't `name`. */
  displayName?: string
  /** What it's for, as told to other agents (toolDescription). */
  description?: string
  tools: string[]
  abilities: string[]
  rules: { tool: string; decision: 'allow' | 'ask' | 'deny'; scope: string }[]
  defaultDecision: 'allow' | 'ask' | 'deny'
  /** Its primary messaging app, if any. */
  messaging: string | null
  /** Tools from its connected services (gateway-tools.yml), by source. */
  connected?: { source: string; tools: string[] }[]
  /** Its apps (MCP servers it has), with the tools it has from each and
   * every tool the app offers (`all`, installed name and the server's own),
   * so a step can use one that's only to be turned on. */
  apps?: { id?: string; title: string; url: string; tools: string[]; all?: { name: string; remote: string }[] }[]
  /** Its own instructions (system prompt). */
  instructions?: string
}

/** Something the agent needs before the workflow can be created in it:
 * an app its steps use, or messaging to reach the person. */
export interface WorkflowRequirement {
  kind: 'app' | 'messaging'
  /** An app's id (the catalog's, or an MCP server's). */
  id?: string
  title: string
  ready: boolean
  /** What to do, when it isn't ready, and where. */
  todo?: string
  /** What Create does about it, when it's ready (adds a connected app to
   * the agent, or turns on its tools). */
  note?: string
  href?: string
}

/** Where an app stands for an agent: on it, connected to the workspace
 * but not on it (Create adds it, with the tools the steps use), or not
 * connected at all (the person connects it first). */
export type WorkflowAppStatus = { state: 'ready' | 'connected' | 'missing'; title?: string }

/** Whether runs need the agent's messaging app: to send each result, or
 * to ask the person something when a run isn't started from Chat. */
function messagingNeed(plan: WorkflowPlan): string | undefined {
  const unattended = plan.trigger.kind !== 'on_request' || Boolean(plan.webhook)
  if (!unattended) return undefined
  if (plan.needsApprovals) return plan.notify?.on ? 'its questions, approvals and results reach you' : 'its questions and approvals reach you'
  if (plan.notify?.on) return 'its results reach you'
  return undefined
}

/** The apps and messaging a plan needs from the agent, each saying
 * whether the agent has it, and if not, what to do and where. */
export async function workflowRequirements(plan: WorkflowPlan, agent: WorkflowAgentInfo, appStatus: (agent: string, id: string) => Promise<WorkflowAppStatus>): Promise<WorkflowRequirement[]> {
  const tab = (t: string) => `/agents/config?agent=${encodeURIComponent(agent.name)}&tab=${t}`
  const apps = new Map<string, string>()
  for (const s of plan.mcpServers ?? []) apps.set(s.id, s.title)
  for (const a of plan.apps ?? []) if (!apps.has(a.id)) apps.set(a.id, a.title)
  const out: WorkflowRequirement[] = []
  for (const [id, planned] of apps) {
    const status = await appStatus(agent.name, id).catch((): WorkflowAppStatus => ({ state: 'missing' }))
    const title = status.title ?? planned
    const off = status.state === 'ready' ? appToolsOff(plan, agent, id) : []
    // The tools to tick when adding it: just the ones the steps use.
    const used = appToolsUsed(plan, id)
    const withTools = used.length ? `, with ${listWords(used)}` : ''
    if (off.length) out.push({ kind: 'app', id, title, ready: true, note: `${listWords(off)} ${off.length === 1 ? 'is' : 'are'} turned on for ${agent.name} when you create it` })
    else if (status.state === 'ready') out.push({ kind: 'app', id, title, ready: true })
    else if (status.state === 'connected') out.push({ kind: 'app', id, title, ready: true, note: `Added to ${agent.name} when you create it${withTools}` })
    else out.push({ kind: 'app', id, title, ready: false, todo: `Connect ${title} on the Apps page; it's added to ${agent.name} when you create it${withTools}`, href: '/config?section=apps' })
  }
  const need = messagingNeed(plan)
  if (need) {
    out.push(agent.messaging
      ? { kind: 'messaging', title: `Messaging (${agent.messaging})`, ready: true }
      : { kind: 'messaging', title: 'Messaging', ready: false, todo: `Set up ${agent.name}'s Messaging (Slack, email, Lark or a webhook), so ${need} when you're not in Chat`, href: tab('messaging') })
  }
  return out
}

/** The tools a plan's steps use from app `id`. */
function appToolsUsed(plan: WorkflowPlan, id: string): string[] {
  return [...new Set([
    ...(plan.apps ?? []).filter((a) => a.id === id).flatMap((a) => a.tools),
    ...plan.steps.flatMap((step) => (step.mcp === id && step.tool ? [step.tool] : [])),
  ])]
}

/** "a", "a and b", "a, b and c". */
function listWords(items: string[]): string {
  return items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

/** The tools a plan uses from app `id` that the agent has the app for but
 * not those tools turned on, by their installed names. */
function appToolsOff(plan: WorkflowPlan, agent: WorkflowAgentInfo, id: string): string[] {
  const app = agent.apps?.find((a) => a.id === id)
  if (!app) return []
  const wanted = appToolsUsed(plan, id)
  const off: string[] = []
  for (const tool of wanted) {
    const known = app.all?.find((t) => t.remote === tool || t.name === tool)
    const name = known?.name ?? tool
    if (!app.tools.includes(name) && !off.includes(name)) off.push(name)
  }
  return off
}

/** A step on a tool of one of the agent's own apps that it hasn't turned
 * on, whether the planner names the app (its id as "mcp") or only the
 * tool: made one of that app's tools, so the review lists it to turn on
 * before Create, rather than looked up as a server to connect. */
export function resolveAgentAppTools(plan: WorkflowPlan, agent: WorkflowAgentInfo): void {
  for (const step of plan.steps) {
    const tool = step.tool
    if (!tool || step.ability || step.connection || agent.tools.includes(tool)) continue
    const app = agent.apps?.find((a) => a.id && (!step.mcp || step.mcp === a.id) && a.all?.some((t) => t.name === tool || t.remote === tool))
    if (!app?.id) continue
    const known = app.all!.find((t) => t.name === tool || t.remote === tool)!
    const remote = known.remote
    delete step.mcp
    step.tool = known.name
    const entry = plan.apps?.find((a) => a.id === app.id)
    if (entry) {
      if (!entry.tools.includes(remote)) entry.tools.push(remote)
    } else plan.apps = [...(plan.apps ?? []), { id: app.id, title: app.title, tools: [remote] }]
  }
}

/** What the planner reads about the agent first. */
function agentBrief(agent: WorkflowAgentInfo): string {
  const lines = [`The workflow is added to the agent "${agent.name}"${agent.displayName && agent.displayName !== agent.name ? ` (shown as "${agent.displayName}")` : ''}.`]
  if (agent.description?.trim()) lines.push(`Its description: ${agent.description.trim().slice(0, 600)}`)
  if (agent.instructions?.trim()) lines.push(`Its instructions:\n${agent.instructions.trim().slice(0, 3000)}`)
  lines.push(`Its tools: ${agent.tools.slice(0, 60).join(', ') || 'none yet'}.`)
  lines.push(agent.apps?.length
    ? `Its apps: ${agent.apps.map((a) => {
      const off = (a.all ?? []).map((t) => t.name).filter((n) => !a.tools.includes(n))
      return `${a.title} (${a.id ? `id ${a.id}, ` : ''}${a.url}; tools turned on: ${a.tools.slice(0, 30).join(', ') || 'none'}${off.length ? `; can be turned on: ${off.slice(0, 30).join(', ')}` : ''})`
    }).join('; ')}.`
    : 'Its apps: none yet.')
  lines.push(`Its messaging: ${agent.messaging ?? 'none set up'}.`)
  const ruled = agent.rules.filter((r) => r.decision !== agent.defaultDecision).slice(0, 40).map((r) => `${r.tool}: ${r.decision}`)
  if (ruled.length) lines.push(`Its permission rules (default ${agent.defaultDecision}): ${ruled.join(', ')}.`)
  return lines.join('\n')
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

/** A connected app, found by the workspace ability made from it. */
export interface WorkflowAppAbility {
  id: string
  title: string
  tools: { name: string; remote: string }[]
}
export type AppForSpec = (spec: string) => WorkflowAppAbility | undefined

/** A step on a connected app's ability (the planner can find it among the
 * workspace's abilities) is a step on that app: installing the ability
 * would add only its read-only tools, and apps are added by the person
 * first. So it becomes one of the plan's apps, with the tools its steps
 * use, and leaves the abilities to install. */
export function resolveAppAbilities(plan: WorkflowPlan, appForSpec: AppForSpec | undefined): void {
  if (!appForSpec) return
  const specs = new Set<string>()
  for (const spec of new Set([...plan.abilities, ...plan.steps.flatMap((s) => (s.ability ? [s.ability] : []))])) {
    const app = appForSpec(spec)
    if (!app) continue
    specs.add(spec)
    for (const step of plan.steps) {
      if (step.ability !== spec) continue
      delete step.ability
      const known = step.tool ? app.tools.find((t) => t.name === step.tool || t.remote === step.tool) : undefined
      if (!known) continue
      step.tool = known.name
      const entry = plan.apps?.find((a) => a.id === app.id)
      if (entry) {
        if (!entry.tools.includes(known.remote)) entry.tools.push(known.remote)
      } else plan.apps = [...(plan.apps ?? []), { id: app.id, title: app.title, tools: [known.remote] }]
    }
    // An app the steps don't name a tool of is still the app.
    if (!plan.apps?.some((a) => a.id === app.id)) plan.apps = [...(plan.apps ?? []), { id: app.id, title: app.title, tools: [] }]
  }
  plan.abilities = plan.abilities.filter((spec) => !specs.has(spec))
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
  /** Matches the steps to the server's tools, when the plan doesn't name
   * them (the server needed a key before they could be seen). */
  generate(request: Omit<McpAbilityRequest, 'modelCall'>): Promise<GeneratedMcpAbility>
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

/** On Create: each MCP server on the plan is an app connected already
 * (the person connects it first), and its steps point at that app's
 * tools. One that isn't connected leaves its steps missing and is
 * reported. */
export async function prepareMcpAbilities(plan: WorkflowPlan, deps: WorkflowMcpCreateDeps | undefined): Promise<{ failed: { name: string; error: string }[] }> {
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
    // The app, connected already; and the server tool for each step (the
    // planner's when the app has it, else worked out).
    const existing = deps.existingFor(planned.url)
    if (!existing) {
      fail(`connect ${planned.title} on the Apps page first`)
      continue
    }
    const known = existing && steps.every(({ step }) => step.tool && existing.tools.some((t) => t.remote === step.tool))
    let spec: string
    let stepTools: Record<number, string>
    let names: { remote: string; name: string }[]
    if (known) {
      spec = existing.spec
      stepTools = Object.fromEntries(steps.map(({ step, index }) => [index, step.tool!]))
      names = existing.tools
    } else {
      const server = await deps.getServer(planned.id).catch(() => undefined)
      if (!server) {
        fail('the server couldn\'t be found any more')
        continue
      }
      const key = deps.keyValue(planned.keyEnv)
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
      // Only the step matching was needed: the app is the one connected.
      stepTools = generated.stepTools
      names = existing.tools
      spec = existing.spec
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
  return { failed }
}

export interface PlannedWorkflow {
  plan: WorkflowPlan
  /** The agent it goes into. */
  agent: string
  /** The plan checked against that agent. */
  check: WorkflowCheck
  /** The apps and messaging it needs from the agent. */
  requirements: WorkflowRequirement[]
}

export interface WorkflowPlanDeps extends WorkflowPlannerTools {
  agentInfo(): Promise<WorkflowAgentInfo[]>
  mcp?: WorkflowMcpDeps
  appStatus(agent: string, id: string): Promise<WorkflowAppStatus>
  /** The connected app a workspace ability was made from. */
  appForSpec?: AppForSpec
}

/** Plans a workflow from a description for the agent the person picked,
 * then checks the plan against it: the apps and messaging it still needs
 * are listed, for the person to add before Create. */
export async function planWorkflow(description: unknown, agentName: unknown, modelCall: ModelCall, tools: WorkflowPlanDeps): Promise<PlannedWorkflow> {
  const text = typeof description === 'string' ? description.trim() : ''
  if (text.length < 15) throw new WorkflowError('Describe the workflow in a sentence or two: what starts it, the steps, and where you want to decide.')
  if (text.length > 4000) throw new WorkflowError('That description is too long: keep it under 4000 characters.')
  const agents = await tools.agentInfo()
  const agent = agents.find((a) => a.name === agentName)
  if (!agent) throw new WorkflowError(typeof agentName === 'string' && agentName ? `There's no agent named ${agentName}.` : 'Choose the agent the workflow goes into.')
  const result = await planWorkflowWithModel(modelCall, text, tools, agentBrief(agent))
  if (!result.plan) throw new WorkflowError(result.reply || 'Could not draft this workflow; try describing the steps more plainly.')
  const plan = result.plan
  resolveConnections(plan, agents)
  resolveAppAbilities(plan, tools.appForSpec)
  resolveAgentAppTools(plan, agent)
  if (tools.mcp) await resolveMcpServers(plan, tools.mcp)
  else for (const step of plan.steps) if (step.mcp) { delete step.mcp; step.missing = step.missing ?? 'no ability does this' }
  return { plan, agent: agent.name, check: checkWorkflowForAgent(plan, agent), requirements: await workflowRequirements(plan, agent, tools.appStatus) }
}

/** The requirements of a plan (planned, or a ready-made example) for an
 * agent: what the review screen lists, and checks again. */
export async function checkWorkflowRequirements(input: { plan?: unknown; agent?: unknown }, deps: { agentInfo(): Promise<WorkflowAgentInfo[]>; appStatus(agent: string, id: string): Promise<WorkflowAppStatus>; appForSpec?: AppForSpec }): Promise<{ agent: string; check: WorkflowCheck; requirements: WorkflowRequirement[] }> {
  const plan = input.plan as WorkflowPlan | undefined
  if (!plan || typeof plan !== 'object' || !Array.isArray(plan.steps) || !Array.isArray(plan.rules)) throw new WorkflowError('Plan the workflow first.')
  const agents = await deps.agentInfo()
  const agent = agents.find((a) => a.name === input.agent)
  if (!agent) throw new WorkflowError(typeof input.agent === 'string' && input.agent ? `There's no agent named ${input.agent}.` : 'Choose the agent the workflow goes into.')
  resolveAppAbilities(plan, deps.appForSpec)
  return { agent: agent.name, check: checkWorkflowForAgent(plan, agent), requirements: await workflowRequirements(plan, agent, deps.appStatus) }
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
  workflow: string
  /** The workflow's skill id. */
  workflowId: string
  abilities: { installed: string[]; failed: { name: string; error: string }[] }
  /** Rules left as the agent already had them. */
  keptDecisions: WorkflowConflict[]
  checklist: TemplateChecklistItem[]
  schedule?: CreatedTemplateAgent['schedule']
  scheduleError?: string
  /** The plan's webhook, made turned off until its signing secret is
   * added. `token` makes its URL, shown once (the server turns it into
   * `url`). */
  webhook?: { trigger: PublicTrigger; token: string; setup?: string }
  webhookError?: string
  loadError?: string
}

const SENDER_NAMES: Record<string, string> = { stripe: 'Stripe', github: 'GitHub', shopify: 'Shopify', standard: 'the sender', custom: 'your app' }

/** Makes the plan's webhook for the created workflow: turned off, since
 * the sender's signing secret comes from the sender, after the URL is
 * pasted there. */
async function makePlannedWebhook(plan: WorkflowPlan, agent: string, agentDir: string): Promise<Pick<CreatedWorkflow, 'webhook' | 'webhookError' | 'checklist'>> {
  const workflow = readWorkflow(agentDir, plan.id)
  const webhook = workflow && planWebhook(plan.webhook, workflow.parameters)
  if (!plan.webhook) return { checklist: [] }
  if (!workflow || !webhook) return { webhookError: 'The webhook could not be set up from the plan; add it on the workflow’s Webhooks.', checklist: [] }
  try {
    const { trigger, token } = await createTrigger(agent, workflow, {
      name: webhook.name,
      enabled: false,
      verify: { sender: webhook.sender, ...(webhook.header ? { header: webhook.header } : {}) },
      ...(webhook.filter ? { filter: webhook.filter } : {}),
      ...(webhook.mapping ? { mapping: webhook.mapping } : {}),
      ...(plan.notify?.on && plan.trigger.kind === 'webhook' ? { notify: true } : {}),
    })
    return {
      webhook: { trigger: publicTrigger(trigger), token, ...(webhook.setup ? { setup: webhook.setup } : {}) },
      checklist: [{
        label: `Turn on the ${webhook.name} webhook: paste its URL into ${SENDER_NAMES[webhook.sender]}'s webhook settings, then add the signing secret ${webhook.sender === 'custom' ? 'your app signs with' : 'it shows'}`,
        href: `/agents/config?agent=${encodeURIComponent(agent)}&tab=workflows`,
      }],
    }
  } catch (err) {
    return { webhookError: err instanceof Error ? err.message : String(err), checklist: [] }
  }
}

export interface WorkflowCreateDeps extends Pick<TemplateCreateDeps, 'installAbility' | 'prepareApp' | 'envValue' | 'messagingConfigured'> {
  agentDir(name: string): string
  agentInfo(): Promise<WorkflowAgentInfo[]>
  /** Where an app stands for an agent (checked again before creating). */
  appStatus(agent: string, id: string): Promise<WorkflowAppStatus>
  /** Makes sure the agent is loaded once its new tools and skill are in place. */
  reloadAgent(name: string): Promise<void>
  /** Points the plan's MCP steps at the apps' tools. */
  mcp?: WorkflowMcpCreateDeps
  /** Gives an agent that already has an app more of its tools (at their
   * default permission), keeping the ones it has. */
  addAppTools?: (agent: string, spec: string, tools: string[]) => Promise<void>
  /** The connected app a workspace ability was made from. */
  appForSpec?: AppForSpec
}

/** A to-do for each step nothing could be found for, first in the list. */
function withMissingSteps(plan: WorkflowPlan, agent: string, checklist: TemplateChecklistItem[]): TemplateChecklistItem[] {
  const href = `/agents/config?agent=${encodeURIComponent(agent)}&tab=abilities`
  const missing = plan.steps.flatMap((s) => (s.missing ? [{ label: `Find or add a tool for "${s.title}": ${s.missing}`, href }] : []))
  return [...missing, ...checklist]
}

/** Rules and facts carried into a workflow added to an existing agent,
 * which keeps its own instructions: between the start line and the steps,
 * so every run of this workflow reads them. */
export function withWorkflowContext(instructions: string, startMessage: string, context: string): string {
  const text = context.trim()
  if (!text) return instructions
  const start = startMessage.trim()
  const steps = instructions.trim().startsWith(start) ? instructions.trim().slice(start.length).trim() : instructions.trim()
  return `${start}\n\nRules and facts for this workflow:\n${text}\n\n${steps}`
}

/** A checklist note pointing at a new agent's instructions, pointed at the
 * workflow's own instead, for a workflow added to an existing agent. */
export function noteForExistingAgent(note: string): string {
  return note.replace(/(at the top of )?its instructions \(Overview tab\)/, "in the workflow's instructions (its Edit, on the Workflows tab)")
}

/** Creates the workflow in the agent the person picked, once it has the
 * apps and messaging the plan needs. The agent keeps every decision it
 * already has: a conflicting rule is left alone and reported, not
 * changed. `target` ({ agent }) is still taken for `agent`. */
export async function createWorkflow(input: { plan?: unknown; agent?: unknown; target?: unknown; description?: unknown; workflowContext?: unknown }, deps: WorkflowCreateDeps): Promise<CreatedWorkflow> {
  const plan = input.plan as WorkflowPlan | undefined
  if (!plan || typeof plan !== 'object' || !Array.isArray(plan.steps) || !plan.skill) throw new WorkflowError('Plan the workflow first.')
  const agentName = input.agent ?? (input.target as { agent?: unknown } | undefined)?.agent
  // The plan's skill becomes a workflow: how a run starts, in its front
  // matter. Its parameters are tidied again, as the plan may have been
  // edited on the review screen.
  const { parameters } = planParameters(plan.parameters, { startMessage: plan.startMessage, skillBody: plan.skill.body, scheduled: plan.trigger.kind === 'schedule' })
  // One text, as the editor shows it: the start message, then the steps.
  const instructions = plan.skill.body.trim().startsWith(plan.startMessage.trim()) ? plan.skill.body : `${plan.startMessage.trim()}\n\n${plan.skill.body.trim()}`
  const originalRequest = typeof input.description === 'string' ? input.description.trim() : ''
  // Its contract as planned, or as edited on the review screen.
  const contract = contractFields({
    ...(plan.model !== undefined ? { model: plan.model } : {}),
    ...(plan.output !== undefined ? { output: plan.output } : {}),
  })
  const markWorkflow = (agentDir: string, context = '') => setWorkflowFields(agentDir, plan.id, {
    title: plan.name,
    instructions: withWorkflowContext(instructions, plan.startMessage, context),
    parameters,
    ...(originalRequest ? { originalRequest } : {}),
    ...contract,
  })
  const agents = await deps.agentInfo()
  const agent = agents.find((a) => a.name === agentName)
  if (!agent) throw new WorkflowError(typeof agentName === 'string' && agentName ? `There's no agent named ${agentName}.` : 'Choose the agent the workflow goes into.')
  // What it needs from the agent, checked again: it may have changed
  // since the plan was shown. An app planned as an ability is an app.
  resolveAppAbilities(plan, deps.appForSpec)
  const missing = (await workflowRequirements(plan, agent, deps.appStatus)).filter((r) => !r.ready)
  if (missing.length) throw new WorkflowError(`Before creating it: ${missing.map((r) => r.todo).join('; ')}.`)
  resolveConnections(plan, agents)
  const mcp = await prepareMcpAbilities(plan, deps.mcp)
  const template = workflowTemplate(plan)
  const check = checkWorkflowForAgent(plan, agent)

  // 1. Abilities it doesn't have yet (their rules come with them).
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

  // Apps (connected to the workspace, checked above): added with just the
  // tools the steps use, or those tools turned on when the agent has the
  // app already.
  const appsToConnect: string[] = []
  for (const app of plan.apps ?? []) {
    const spec = deps.prepareApp ? await deps.prepareApp(app.id) : undefined
    if (!spec) {
      appsToConnect.push(app.title)
      continue
    }
    const has = agent.apps?.find((a) => a.id === app.id)
    const toAdd = has ? app.tools.filter((remote) => !has.tools.includes(has.all?.find((t) => t.remote === remote)?.name ?? remote)) : app.tools
    if (has && !toAdd.length) continue
    if (!deps.installAbility) {
      failed.push({ name: app.title, error: 'adding apps needs LOOPENGINE_ADMIN_AUTH set on the server' })
      continue
    }
    try {
      if (has && deps.addAppTools) {
        await deps.addAppTools(agent.name, spec, toAdd)
        installed.push(app.title)
        continue
      }
      await deps.installAbility(agent.name, spec, toAdd.length ? { mcpTools: toAdd } : {})
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

  // 2. Rules, now that what was installed has added its own: none twice,
  //    a stricter one (ask where an ability allows) placed so it counts,
  //    and a decision the agent already has never loosened.
  const ruled = applyPlannedRules(agent.name, plan.rules)

  // 3. Its steps, as a skill; then load the agent again with all of it.
  writeSkill(agent.name, plan.id, { description: plan.skill.description, body: plan.skill.body })
  // The skills and settings it comes with, where the agent has none:
  // its own policies and values stay as they are.
  for (const skill of plan.skills ?? []) {
    if (skill.id === plan.id || existsSync(join(deps.agentDir(agent.name), 'skills', skill.id, 'SKILL.md'))) continue
    writeSkill(agent.name, skill.id, { description: skill.description, body: skill.body })
  }
  for (const [variable, value] of Object.entries(plan.env ?? {})) {
    if (!deps.envValue(agent.name, variable)) await setAgentEnvVar(agent.name, variable, value)
  }
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
        workflow_id: plan.id,
        ...(plan.notify?.on ? { notify: true } : {}),
        schedule: { every: template.setup.schedule.every, ...(startAt ? { start_at: startAt } : {}) },
        task_name: plan.name,
      })
      await pauseScheduledTask(task.task_id)
      schedule = { description: plan.trigger.description, timeZone: workspaceTimeZone(), ...(startAt ? { next_run_at: startAt } : {}) }
    } catch (err) {
      scheduleError = err instanceof Error ? err.message : String(err)
    }
  }

  markWorkflow(deps.agentDir(agent.name), typeof input.workflowContext === 'string' ? input.workflowContext.slice(0, 6000) : '')
  const hook = await makePlannedWebhook(plan, agent.name, deps.agentDir(agent.name))
  return {
    agent: agent.name,
    workflow: plan.name,
    workflowId: plan.id,
    abilities: { installed, failed },
    keptDecisions: ruled.kept,
    // Its notes point at the workflow's instructions, where the rules and
    // facts went, not the agent's own.
    checklist: [...withMissingSteps(plan, agent.name, templateChecklist({ ...template, setup: { ...template.setup, ...(template.setup.notes ? { notes: template.setup.notes.map(noteForExistingAgent) } : {}) } }, agent.name, deps, failed, appsToConnect)), ...hook.checklist],
    ...(hook.webhook ? { webhook: hook.webhook } : {}),
    ...(hook.webhookError ? { webhookError: hook.webhookError } : {}),
    ...(schedule ? { schedule } : {}),
    ...(scheduleError ? { scheduleError } : {}),
    ...(loadError ? { loadError } : {}),
  }
}

type WorkflowScheduleView = { taskId: string; status: string; repeating: boolean; describe: string; name?: string; notify: boolean; params?: Record<string, string>; nextRunAt?: string; lastRunAt?: string; lastStatus?: string; waiting: boolean }

export interface AgentWorkflowView extends Workflow {
  /** Its main schedule: a repeating one if it has one. */
  schedule?: WorkflowScheduleView
  /** Every live task that runs it, repeating ones first. */
  schedules: WorkflowScheduleView[]
  /** Its latest runs started by hand or by an app, newest first. */
  recentRuns: WorkflowRun[]
  /** Its webhook triggers that are on. */
  webhooks: number
  /** Its webhooks waiting for the sender's signing secret before they turn on. */
  webhooksWaiting: number
  /** Its webhooks turned off. */
  webhooksOff: number
  /** Its evidence: live scores from its runs, and its eval cases and rounds. */
  scores: WorkflowScores
  evals: WorkflowEvals
}

const RECENT_RUNS = 5

/** The live tasks that run a workflow: those carrying its id. */
function workflowTasks(id: string, tasks: ScheduledTask[]): ScheduledTask[] {
  return tasks
    .filter((t) => t.workflow_id === id && t.status !== 'cancelled' && t.status !== 'done')
    .sort((a, b) => Number('every' in b.schedule) - Number('every' in a.schedule))
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** A schedule in words, in its time zone: "every day at 18:05", "every
 * Monday at 09:00", "every 10 minutes", "once on Nov 6 at 18:05". */
export function plainSchedule(schedule: ScheduledTask['schedule']): string {
  const zone = ('time_zone' in schedule && schedule.time_zone) || workspaceTimeZone()
  const at = (iso: string) => {
    const t = wallTimeAt(Date.parse(iso), zone)
    return { ...t, clock: `${String(t.hour).padStart(2, '0')}:${String(t.minute).padStart(2, '0')}` }
  }
  if ('run_at' in schedule) {
    if (Number.isNaN(Date.parse(schedule.run_at))) return `once at ${schedule.run_at}`
    const t = at(schedule.run_at)
    return `once on ${MONTHS[t.month - 1]} ${t.day} at ${t.clock}`
  }
  const m = /^(\d+)([mhdw])$/.exec(schedule.every)
  if (!m) return describeSchedule(schedule)
  const n = Number(m[1])
  const unit = m[2] as 'm' | 'h' | 'd' | 'w'
  const anchor = schedule.anchor && !Number.isNaN(Date.parse(schedule.anchor)) ? at(schedule.anchor) : undefined
  if (unit === 'm') return n === 1 ? 'every minute' : `every ${n} minutes`
  if (unit === 'h') return (n === 1 ? 'every hour' : `every ${n} hours`) + (anchor && n === 1 ? ` at :${String(anchor.minute).padStart(2, '0')}` : '')
  if (unit === 'd') return (n === 1 ? 'every day' : `every ${n} days`) + (anchor ? ` at ${anchor.clock}` : '')
  if (n === 1 && anchor) return `every ${WEEKDAYS[anchor.weekday]} at ${anchor.clock}`
  return (n === 1 ? 'every week' : `every ${n} weeks`) + (anchor ? ` on ${WEEKDAYS[anchor.weekday]} at ${anchor.clock}` : '')
}

function scheduleView(task: ScheduledTask): WorkflowScheduleView {
  return {
    taskId: task.task_id,
    status: task.status,
    repeating: 'every' in task.schedule,
    describe: plainSchedule(task.schedule),
    ...(task.task_name ? { name: task.task_name } : {}),
    notify: Boolean(task.notify),
    ...(task.params ? { params: task.params } : {}),
    ...(task.next_run_at ? { nextRunAt: task.next_run_at } : {}),
    ...(task.last_run_at ? { lastRunAt: task.last_run_at } : {}),
    ...(task.last_status ? { lastStatus: task.last_status } : {}),
    waiting: Boolean(task.pending) || task.status === 'awaiting_approval',
  }
}

/** Moves an agent's workflows.yml, from before workflows were skills, into
 * its skills, and points the schedules it linked by name at the workflows
 * they run. Safe to call any time: it does nothing once the file is gone. */
export async function migrateAgentWorkflows(agentName: string, agentDir: string): Promise<void> {
  const moved = migrateWorkflowsFile(agentDir)
  if (!moved.length) return
  for (const task of await listScheduledTasks({ agent: agentName })) {
    const match = !task.workflow_id && task.status !== 'cancelled' && moved.find((m) => m.scheduleName && m.scheduleName === task.task_name)
    if (!match) continue
    await getSchedulerStore().update(task.task_id, (t) => t && { ...t, workflow_id: match.id, message: '' })
  }
}

/** An agent's workflows, each with the state of the tasks that run it. */
export async function listAgentWorkflows(agentName: string, agentDir: string): Promise<AgentWorkflowView[]> {
  await migrateAgentWorkflows(agentName, agentDir)
  const workflows = readWorkflows(agentDir)
  if (!workflows.length) return []
  const tasks = await listScheduledTasks({ agent: agentName })
  const runs = await listRuns(agentName)
  const triggers = await listTriggers(agentName)
  return workflows.map((w) => {
    const schedules = workflowTasks(w.id, tasks).map(scheduleView)
    const recentRuns = runs.filter((r) => r.workflow_id === w.id).slice(0, RECENT_RUNS)
    const own = triggers.filter((t) => t.workflow_id === w.id)
    const webhooks = own.filter((t) => t.enabled).length
    // Made by the planner, waiting for the sender's signing secret.
    const webhooksWaiting = own.filter((t) => !t.enabled && t.verify && !t.verify.secret).length
    const ownRuns = runs.filter((r) => r.workflow_id === w.id)
    return {
      ...w, schedules, recentRuns, webhooks, webhooksWaiting, webhooksOff: own.length - webhooks - webhooksWaiting, ...(schedules[0] ? { schedule: schedules[0] } : {}),
      scores: workflowScores(ownRuns), evals: readEvals(agentDir, w.id),
    }
  })
}

function sameParams(a: Record<string, string> | undefined, b: Record<string, string>): boolean {
  const left = a ?? {}
  const keys = new Set([...Object.keys(left), ...Object.keys(b)])
  return [...keys].every((k) => (left[k] ?? '') === (b[k] ?? ''))
}

/** Gets a run of a workflow ready to start, with these parameters: checks
 * them, and that a run with the same parameters isn't already under way
 * (runs with other parameters go ahead), and works out the message it
 * starts with — the workflow's start message and steps as they are now.
 * The server starts it (core/workflow-runs.ts). */
export async function prepareWorkflowRun(agentName: string, agentDir: string, id: string, rawParams?: unknown, compose?: (workflow: Workflow, params: Record<string, string>) => Promise<string>): Promise<{ workflow: Workflow; params: Record<string, string>; message: string }> {
  const workflow = readWorkflow(agentDir, id)
  if (!workflow) throw new WorkflowError(`No workflow ${id} in ${agentName}.`)
  let params: Record<string, string>
  try {
    params = validateParams(workflow, rawParams)
  } catch (err) {
    throw new WorkflowError(err instanceof Error ? err.message : String(err))
  }
  const runs = await listRuns(agentName, { workflowId: id })
  if (runs.some((r) => isUnderWay(r) && sameParams(r.params, params))) {
    throw new WorkflowError(`${workflow.title} is already running${Object.keys(params).length ? ' with these parameters' : ''}, or waiting for a decision.`)
  }
  // The server composes it with the workspace's policies and the
  // workflow's lookups (adapters/http.ts); without, just the workflow.
  return { workflow, params, message: compose ? await compose(workflow, params) : workflowRunMessage(workflow, params) }
}

/** Changes a workflow from the console's editor: its title, its
 * instructions (the skill body, which an older workflow's start message
 * and label are folded into), and its parameters. The skill's other front
 * matter is kept. A body with `start_message` (and no `instructions`) is
 * still taken, as before. */
/** The contract fields an edit gives: `model` ({ provider, model }, or
 * null for the agent's) and `output` (text). Left out, each keeps what's
 * saved. */
export function contractFields(input: Record<string, unknown>): { model?: WorkflowModel | null; output?: string | null } {
  const fields: { model?: WorkflowModel | null; output?: string | null } = {}
  if (input.model !== undefined) {
    const m = input.model as Record<string, unknown> | null | string
    if (m === null || m === '') fields.model = null
    else if (typeof m === 'object' && typeof m.provider === 'string' && typeof m.model === 'string' && m.provider.trim() && m.model.trim()) fields.model = { provider: m.provider.trim(), model: m.model.trim() }
    else throw new WorkflowError("model must be { provider, model }, or null for the agent's own.")
  }
  if (input.output !== undefined) {
    if (input.output !== null && typeof input.output !== 'string') throw new WorkflowError('The result format must be text.')
    if (typeof input.output === 'string' && input.output.length > 2000) throw new WorkflowError('The result format is too long: keep it under 2000 characters.')
    fields.output = typeof input.output === 'string' ? input.output : null
  }
  return fields
}

export function updateWorkflow(agentDir: string, id: string, input: Record<string, unknown>): Workflow {
  if (!readWorkflow(agentDir, id)) throw new WorkflowError(`No workflow ${id}.`)
  const text = (value: unknown, field: string, max: number): string => {
    if (value !== undefined && value !== null && typeof value !== 'string') throw new WorkflowError(`${field} must be text.`)
    const trimmed = (value ?? '').toString().trim()
    if (trimmed.length > max) throw new WorkflowError(`${field} is too long: keep it under ${max} characters.`)
    return trimmed
  }
  const title = text(input.title, 'The title', 120)
  const description = input.description === undefined ? undefined : text(input.description, 'The description', 500)
  if (description !== undefined && !description) throw new WorkflowError('Write a one-line description: what this job is, e.g. "Daily digest of AI-agent stories on Hacker News". The agent uses it to recognise the job in Chat.')
  const instructions = input.instructions === undefined ? undefined : text(input.instructions, 'The instructions', 30000)
  if (instructions !== undefined && !instructions) throw new WorkflowError('Write the instructions: what the agent does, e.g. "Check the refund request for order $order_number: look up the order, then…"')
  const startMessage = instructions === undefined ? text(input.start_message, 'The start message', 4000) : ''
  if (instructions === undefined && !startMessage) throw new WorkflowError('Write the instructions: what the agent does each run.')
  const trigger = instructions === undefined ? text(input.trigger, 'When it runs', 200) : ''
  const raw = input.parameters ?? {}
  if (typeof raw !== 'object' || Array.isArray(raw)) throw new WorkflowError('parameters must be an object of names to { description, required }.')
  const parameters: Record<string, { description: string; required: boolean }> = {}
  for (const [name, spec] of Object.entries(raw as Record<string, unknown>)) {
    if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new WorkflowError(`Parameter "${name}": use lowercase letters, digits and _, starting with a letter, e.g. "order_number".`)
    const s = spec && typeof spec === 'object' ? (spec as Record<string, unknown>) : {}
    parameters[name] = { description: text(s.description, `The description of "${name}"`, 300), required: s.required === true }
  }
  const named = { ...(title ? { title } : {}), ...(description ? { description: description.replace(/\s+/g, ' ') } : {}), ...contractFields(input) }
  setWorkflowFields(agentDir, id, instructions !== undefined ? { ...named, instructions, parameters } : { ...named, startMessage, ...(trigger ? { trigger } : {}), parameters })
  return readWorkflow(agentDir, id)!
}

/** Removes a workflow: its skill stays, as a plain skill the agent can
 * still use in chat, and what started it goes: its schedules are
 * cancelled and its webhooks deleted (their URLs stop working). Returns
 * how many of each. */
export async function forgetWorkflow(agentName: string, agentDir: string, id: string): Promise<{ cancelled: number; webhooks: number }> {
  clearWorkflowFields(agentDir, id)
  let cancelled = 0
  for (const task of workflowTasks(id, await listScheduledTasks({ agent: agentName }))) {
    await cancelScheduledTask(task.task_id)
    cancelled++
  }
  let webhooks = 0
  for (const trigger of await listTriggers(agentName, id)) {
    await getTriggerStore().remove(trigger.trigger_id)
    webhooks++
  }
  return { cancelled, webhooks }
}

/** What deleting an agent removes besides itself. */
export interface ForgottenAgent {
  schedules: number
  webhooks: number
}

/** Deletes an agent made in the console (a folder with an index.ts):
 * its schedules and webhooks, so nothing starts it again, then its folder
 * (instructions, workflows, skills, tools, abilities, permissions,
 * messaging and its own .env). Past runs and chats are kept. The caller
 * takes it out of the live registry. An agent written as a single file
 * (agents/<name>.ts) is refused: that's code to remove by hand. */
export async function forgetAgent(agentName: string, agentDir: string): Promise<ForgottenAgent> {
  if (!existsSync(join(agentDir, 'index.ts'))) {
    throw new WorkflowError(`${agentName} isn't in its own folder (agents/${agentName}/index.ts), so it can't be deleted here. Remove its file from agents/ yourself.`)
  }
  let schedules = 0
  for (const task of await listScheduledTasks({ agent: agentName })) {
    await deleteScheduledTask(task.task_id)
    schedules++
  }
  let webhooks = 0
  for (const trigger of await listTriggers(agentName)) {
    await getTriggerStore().remove(trigger.trigger_id)
    webhooks++
  }
  rmSync(agentDir, { recursive: true, force: true })
  return { schedules, webhooks }
}

export function agentDirIn(projectDir: string, name: string): string {
  return join(projectDir, 'agents', name)
}
