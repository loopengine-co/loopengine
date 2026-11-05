// "Describe a workflow": turns a workflow someone already has in mind,
// described in plain words, into a plan for a LoopEngine agent. Each step
// is matched to a real tool (a public or workspace ability's, or the
// built-in system_ask_user), the points where a person decides become
// checkpoints (a question, or a tool set to "ask"), the steps in order
// become a skill, and the trigger a schedule. The plan names the agent it
// belongs in: an existing one when it fits without changing anything that
// agent already does, else a new one.
//
// Like the interviewer (./interviewer.ts), it only reads (agents,
// abilities, connections) and records the plan: creating or changing an
// agent is the person's click, after they've read the plan
// (web/workflow-admin.ts).
import type { ToolSchema } from '#core/agent-config.js'
import type { WorkflowParameter } from '#core/workflows.js'
import type { Message, ModelCall, ModelContentBlock } from '#core/run-agent.js'
import type { StarterTemplate, TemplateApp } from './templates.js'

export type Decision = 'allow' | 'ask' | 'deny'

export interface WorkflowStep {
  title: string
  /** tool: a tool runs. ask: the agent asks a person (system_ask_user).
   * approval: a tool that waits for a person's OK (its rule is "ask").
   * other: the agent's own work, like writing or deciding. */
  kind: 'tool' | 'ask' | 'approval' | 'other'
  tool?: string
  /** The ability that provides `tool`, as it would be installed. */
  ability?: string
  detail?: string
  /** What's missing for this step, when nothing found provides it. */
  missing?: string
  /** For a tool from a connected service (an agent's Composio source, not
   * an ability): the source's name. It's copied to the agent that runs the
   * workflow, not installed. */
  connection?: string
  /** For a step done by an MCP server's tool, when no ability has it: the
   * server's id (search_mcp_servers). `tool` is then the server's own
   * tool name, if the planner could see them. On Create the server
   * becomes a private ability (core/mcp-ability-generator.ts) and the
   * step points at its tool instead. */
  mcp?: string
}

/** An MCP server a plan would set up as a private ability. */
export interface PlannedMcpServer {
  id: string
  title: string
  url: string
  description: string
  /** Saved by the workspace, or on its publisher's verified domain. */
  verified: boolean
  source: 'saved' | 'registry'
  /** The private ability it becomes, e.g. mcp-linear. */
  ability: string
  /** The setting its key is saved as, when it takes one. */
  keyEnv: string
  /** Whether that setting already has a value. */
  keySet: boolean
  /** The workspace already has an ability made from this server. */
  existing?: string
}

export interface WorkflowPlan {
  name: string
  /** lowercase-hyphenated: the workflow's id and its skill's folder. */
  id: string
  summary: string
  trigger: {
    kind: 'schedule' | 'on_request'
    description: string
    /** schedule only: "1h", "24h", "7d". */
    every?: string
    /** schedule only: time of day ("09:00") and weekday (1 = Monday). */
    at?: string
    weekday?: number
  }
  steps: WorkflowStep[]
  /** Abilities to install, as specs: an npm name, or a workspace ability's file: spec. */
  abilities: string[]
  /** Permission each tool the workflow uses should have. */
  rules: { tool: string; decision: Decision }[]
  /** Keys its abilities need (setting names). */
  keys: string[]
  /** Whether a person must be reachable (a question or an approval). */
  needsApprovals: boolean
  /** The steps in order, as the agent's instructions. */
  skill: { description: string; body: string }
  /** What the agent receives when the workflow starts. */
  startMessage: string
  /** Values a run is given, filled into $name in the start message and
   * steps (core/workflows.ts). Empty when every run is the same. */
  parameters: Record<string, WorkflowParameter>
  target: { kind: 'existing' | 'new'; agent?: string; reason: string }
  /** For a new agent. */
  newAgent: { name: string; systemPrompt: string }
  /** What the workspace can't do yet, in plain words. */
  gaps: string[]
  /** MCP servers its steps use, set up on Create (filled in after planning). */
  mcpServers?: PlannedMcpServer[]
  /** Connected apps it adds to the agent, with just the tools its steps
   * use (filled in on Create, from mcpServers). */
  apps?: TemplateApp[]
}

export interface WorkflowPlannerTools {
  /** Every agent: its tools, installed abilities, rules and messaging. */
  listAgents(): Promise<unknown>
  searchPublicAbilities(query: string): Promise<{ name: string; description?: string }[]>
  /** The workspace's private abilities. */
  listWorkspaceAbilities(): Promise<{ name: string; description?: string; spec: string }[]>
  /** An ability's tools (with the decision each ships with) and settings. */
  abilityDetails(spec: string): Promise<unknown>
  listConnections(): Promise<Record<string, unknown>>
  /** MCP servers matching a query (core/mcp-directory.ts). Optional: without it the planner only plans with abilities. */
  searchMcpServers?(query: string): Promise<unknown>
  /** A server's tools, when it can be listed without a key (or with one already set). */
  mcpServerTools?(id: string): Promise<unknown>
}

const MAX_TOOL_ROUNDS = 12

export const WORKFLOW_PLANNER_PROMPT = `You turn a workflow a person describes into a plan for a LoopEngine agent.

LoopEngine agents call tools. Tools come from abilities (installable packages: public ones on npm, or the workspace's own private ones) or are built in. Each tool has a permission: allow (runs on its own), ask (waits for a person to approve, edit or deny it) or deny. When nobody is in Chat, questions and approvals go to the agent's messaging app (Slack, Telegram, Lark or email) and the run waits, for days if needed, then carries on.

How to plan:
1. Look before you plan: list_agents (what exists, and what each agent's tools and rules are), list_workspace_abilities, search_public_abilities for each kind of step, ability_details for any ability you might use (its exact tool names and the settings it needs), and list_connections.
2. Split the workflow into steps, in order. For each step:
   - something to fetch or do: kind "tool", with the exact tool name and where it comes from. Pick the source in this order:
     a. A tool the target agent already has (from list_agents): use it, nothing to install.
     b. An ability: a workspace ability (list_workspace_abilities) or a public one (search_public_abilities, e.g. "firecrawl" or "web search" for searching and reading the web). Set "ability" to its install spec (the npm name, or a workspace ability's spec) and use the exact tool name from ability_details.
     c. Only when no ability can do it, and search_mcp_servers is available: an app's MCP server. Search for the app (e.g. "linear", "stripe"), pick the app's own server (official), else a saved or verified one, then call mcp_server_tools. Set "mcp" to the server's id, and "tool" to its exact tool name when mcp_server_tools lists them (leave "tool" empty when it needs a key first, and say in "detail" what the step does). It's set up as a private ability when the workflow is created, which picks its tools and their permissions, so add no rules for MCP tools.
   - the person chooses or answers ("ask me which", "let me pick"): kind "ask", tool "system_ask_user" (built in, no ability). Say what options are offered. It reaches them through the agent's messaging app by itself, so don't add a separate step to post to Slack or another chat first, and don't install a chat ability just to ask.
   - the person reviews or approves before something happens ("let me review it", "before it's sent"): kind "approval", on the tool that does that thing; its rule becomes "ask".
   - the agent's own work (writing, summarising, choosing): kind "other".
   - nothing found can do it: set "missing" to what's needed, and add it to gaps.
3. Rules: every tool the workflow uses gets one. Reading and searching: allow. Anything a person should see first (sending, publishing, paying, creating something others see): ask. Never set deny unless asked.
4. Skill: the steps in order, as numbered instructions the agent follows, naming the tools and saying exactly when to stop and ask. Write it so the agent keeps going after each answer or decision.
5. Trigger: a schedule ("every Monday at 9" is every "7d", at "09:00", weekday 1) or on_request (started from Chat or a message). startMessage is what the agent receives when it starts.
6. Parameters: if the job is about something that changes from run to run (an order, a ticket, an alert, a customer, a date range), declare it as a parameter: a short snake_case name, a one-line description, and required when a run makes no sense without it. Write $name wherever its value goes, in startMessage and in the skill ("Check the refund request for order $order_number."). Apps and people fill them in when they start a run. A scheduled job that finds its own work ("check the inbox every 10 minutes", "last week's sales") needs none. Don't make fixed settings, such as the repository or the channel, parameters: write them into the skill.
7. Target: an existing agent only when it already has (or can install) the tools, none of the workflow's rules would change a decision it already has, and the same people would approve. Otherwise a new agent, with a short lowercase-hyphenated name and a system prompt saying who it is and what it's for. Give the reason either way.
8. keys: the setting names its abilities need that list_connections or the agents don't show as set (from ability_details settings). Not for MCP servers: their keys are asked for on the plan.

Then call save_plan once, with the whole plan. Don't ask the person questions: if something is unclear, plan the most reasonable version and note the assumption in gaps.`

export function workflowPlannerTools(withMcp = false): ToolSchema[] {
  const step = {
    type: 'object',
    properties: {
      title: { type: 'string' },
      kind: { type: 'string', enum: ['tool', 'ask', 'approval', 'other'] },
      tool: { type: 'string' },
      ability: { type: 'string' },
      mcp: { type: 'string', description: "an MCP server's id, for a step no ability can do" },
      detail: { type: 'string' },
      missing: { type: 'string' },
    },
    required: ['title', 'kind'],
  }
  return [
    { name: 'list_agents', description: "Every agent in the workspace: its tools, installed abilities, permission rules and messaging app.", input_schema: { type: 'object', properties: {} } },
    { name: 'list_workspace_abilities', description: "The workspace's own private abilities, ready to add to an agent.", input_schema: { type: 'object', properties: {} } },
    { name: 'search_public_abilities', description: 'Search public LoopEngine abilities on npm, e.g. "web search", "wordpress", "slack".', input_schema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } },
    { name: 'ability_details', description: "An ability's exact tool names, what each does, the permission each ships with, and the settings it needs. spec: its npm name or workspace spec.", input_schema: { type: 'object', properties: { spec: { type: 'string' } }, required: ['spec'] } },
    { name: 'list_connections', description: 'What is set up: model providers with keys, messaging apps per agent.', input_schema: { type: 'object', properties: {} } },
    ...(withMcp ? [
      { name: 'search_mcp_servers', description: "Search apps' MCP servers (the workspace's saved ones, then the public MCP Registry), for a step no ability can do. query: the app's name, e.g. \"linear\".", input_schema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } },
      { name: 'mcp_server_tools', description: "An MCP server's tools (name, description, read-only or not), or a note that it needs a key before they can be seen. id: from search_mcp_servers.", input_schema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
    ] : []),
    {
      name: 'save_plan',
      description: 'Save the workflow plan. Call once, at the end.',
      input_schema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          id: { type: 'string', description: 'lowercase-hyphenated' },
          summary: { type: 'string' },
          trigger: {
            type: 'object',
            properties: {
              kind: { type: 'string', enum: ['schedule', 'on_request'] },
              description: { type: 'string' },
              every: { type: 'string' },
              at: { type: 'string' },
              weekday: { type: 'number' },
            },
            required: ['kind', 'description'],
          },
          steps: { type: 'array', items: step },
          abilities: { type: 'array', items: { type: 'string' } },
          rules: { type: 'array', items: { type: 'object', properties: { tool: { type: 'string' }, decision: { type: 'string', enum: ['allow', 'ask', 'deny'] } }, required: ['tool', 'decision'] } },
          keys: { type: 'array', items: { type: 'string' } },
          needsApprovals: { type: 'boolean' },
          skill: { type: 'object', properties: { description: { type: 'string' }, body: { type: 'string' } }, required: ['description', 'body'] },
          startMessage: { type: 'string' },
          parameters: {
            type: 'object',
            description: 'Values each run is given, by snake_case name; use $name in startMessage and the skill. Leave out when every run is the same.',
            additionalProperties: { type: 'object', properties: { description: { type: 'string' }, required: { type: 'boolean' } } },
          },
          target: { type: 'object', properties: { kind: { type: 'string', enum: ['existing', 'new'] }, agent: { type: 'string' }, reason: { type: 'string' } }, required: ['kind', 'reason'] },
          newAgent: { type: 'object', properties: { name: { type: 'string' }, systemPrompt: { type: 'string' } }, required: ['name', 'systemPrompt'] },
          gaps: { type: 'array', items: { type: 'string' } },
        },
        required: ['name', 'summary', 'trigger', 'steps', 'rules', 'skill', 'startMessage', 'target', 'newAgent'],
      },
    },
  ]
}

const str = (value: unknown, max = 2000): string | undefined => (typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : undefined)

/** lowercase-hyphenated, 2–40 characters. */
export function slugify(value: string, fallback = 'workflow'): string {
  const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '')
  return slug.length >= 2 ? slug : fallback
}

const isDecision = (value: unknown): value is Decision => value === 'allow' || value === 'ask' || value === 'deny'

/** A plan from the model's save_plan input, or undefined when it lacks a
 * name, steps, a skill or a new-agent prompt. Fills in what can be derived. */
export function validateWorkflowPlan(raw: unknown): WorkflowPlan | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const r = raw as Record<string, unknown>
  const name = str(r.name, 80)
  const summary = str(r.summary, 600)
  const skillRaw = (r.skill ?? {}) as Record<string, unknown>
  const skillBody = str(skillRaw.body, 12000)
  const agentRaw = (r.newAgent ?? {}) as Record<string, unknown>
  const systemPrompt = str(agentRaw.systemPrompt, 8000)
  if (!name || !summary || !skillBody || !systemPrompt) return undefined

  const steps: WorkflowStep[] = (Array.isArray(r.steps) ? r.steps : []).flatMap((s): WorkflowStep[] => {
    const step = (s ?? {}) as Record<string, unknown>
    const title = str(step.title, 200)
    const kind = ['tool', 'ask', 'approval', 'other'].includes(step.kind as string) ? (step.kind as WorkflowStep['kind']) : 'other'
    if (!title) return []
    return [{
      title,
      kind,
      ...(str(step.tool, 120) ? { tool: str(step.tool, 120) } : {}),
      ...(str(step.ability, 300) ? { ability: str(step.ability, 300) } : {}),
      ...(str(step.detail, 600) ? { detail: str(step.detail, 600) } : {}),
      ...(str(step.missing, 300) ? { missing: str(step.missing, 300) } : {}),
      ...(str(step.connection, 120) ? { connection: str(step.connection, 120) } : {}),
      ...(str(step.mcp, 200) && !str(step.ability, 300) ? { mcp: str(step.mcp, 200) } : {}),
    }]
  })
  if (!steps.length) return undefined

  const triggerRaw = (r.trigger ?? {}) as Record<string, unknown>
  const scheduled = triggerRaw.kind === 'schedule' && typeof triggerRaw.every === 'string' && /^\d+[mhd]$/.test(triggerRaw.every)
  const trigger: WorkflowPlan['trigger'] = scheduled
    ? {
        kind: 'schedule',
        description: str(triggerRaw.description, 200) ?? `every ${triggerRaw.every}`,
        every: triggerRaw.every as string,
        ...(typeof triggerRaw.at === 'string' && /^\d{1,2}:\d{2}$/.test(triggerRaw.at) ? { at: triggerRaw.at } : {}),
        ...(typeof triggerRaw.weekday === 'number' && triggerRaw.weekday >= 0 && triggerRaw.weekday <= 7 ? { weekday: triggerRaw.weekday } : {}),
      }
    : { kind: 'on_request', description: str(triggerRaw.description, 200) ?? 'when asked' }

  // An MCP step's permissions are set when its server becomes an ability.
  const mcpTools = new Set(steps.flatMap((s) => (s.mcp && s.tool ? [s.tool] : [])))
  const rules = (Array.isArray(r.rules) ? r.rules : []).flatMap((x) => {
    const rule = (x ?? {}) as Record<string, unknown>
    const tool = str(rule.tool, 120)
    return tool && isDecision(rule.decision) && tool !== 'system_ask_user' ? [{ tool, decision: rule.decision }] : []
  }).filter((rule) => !mcpTools.has(rule.tool))
  // An approval step's tool always asks first (an MCP step's tool gets
  // that when its ability is made).
  for (const step of steps) {
    if (step.kind !== 'approval' || !step.tool || step.mcp) continue
    const rule = rules.find((x) => x.tool === step.tool)
    if (rule) rule.decision = 'ask'
    else rules.push({ tool: step.tool, decision: 'ask' })
  }

  const abilities = [...new Set([
    ...(Array.isArray(r.abilities) ? r.abilities.flatMap((a) => (str(a, 300) ? [str(a, 300)!] : [])) : []),
    ...steps.flatMap((s) => (s.ability ? [s.ability] : [])),
  ])].filter((spec) => !steps.some((s) => s.connection === spec && s.ability !== spec))
  const targetRaw = (r.target ?? {}) as Record<string, unknown>
  const id = slugify(str(r.id, 60) ?? name)
  const startMessage = str(r.startMessage, 1000) ?? `Run the "${name}" workflow.`
  const gaps = Array.isArray(r.gaps) ? r.gaps.flatMap((g) => (str(g, 400) ? [str(g, 400)!] : [])).slice(0, 10) : []
  const planned = planParameters(r.parameters, { startMessage, skillBody, scheduled: trigger.kind === 'schedule' })
  return {
    name,
    id,
    summary,
    trigger,
    steps,
    abilities,
    rules,
    keys: Array.isArray(r.keys) ? [...new Set(r.keys.flatMap((k) => (str(k, 80) ? [str(k, 80)!] : [])))] : [],
    needsApprovals: r.needsApprovals === true || steps.some((s) => s.kind === 'ask' || s.kind === 'approval'),
    skill: { description: str(skillRaw.description, 400) ?? summary, body: skillBody },
    startMessage,
    parameters: planned.parameters,
    target: {
      kind: targetRaw.kind === 'existing' && str(targetRaw.agent, 80) ? 'existing' : 'new',
      ...(targetRaw.kind === 'existing' && str(targetRaw.agent, 80) ? { agent: str(targetRaw.agent, 80) } : {}),
      reason: str(targetRaw.reason, 600) ?? '',
    },
    newAgent: { name: slugify(str(agentRaw.name, 60) ?? id, id), systemPrompt },
    gaps: [...gaps, ...planned.notes].slice(0, 12),
  }
}

/** A plan's parameters, tidied: names made snake_case (or dropped), a
 * $name the start message or skill uses but doesn't declare added as an
 * optional one, and, for a scheduled workflow, required ones made
 * optional (a schedule has no one to fill them in), with a note saying
 * so. Also used on a plan edited before Create. */
export function planParameters(raw: unknown, context: { startMessage: string; skillBody: string; scheduled: boolean }): { parameters: Record<string, WorkflowParameter>; notes: string[] } {
  const parameters: Record<string, WorkflowParameter> = {}
  const notes: string[] = []
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    for (const [rawName, spec] of Object.entries(raw as Record<string, unknown>)) {
      const name = rawName.trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^[^a-z_]+/, '').replace(/_+/g, '_').replace(/_$/, '').slice(0, 40)
      if (!name || parameters[name]) continue
      const s = spec && typeof spec === 'object' ? (spec as Record<string, unknown>) : {}
      parameters[name] = { description: typeof s.description === 'string' ? s.description.trim().slice(0, 300) : '', required: s.required === true }
    }
  }
  for (const match of `${context.startMessage}\n${context.skillBody}`.matchAll(/\$([a-z_][a-z0-9_]*)/g)) {
    parameters[match[1]!] ??= { description: '', required: false }
  }
  if (context.scheduled) {
    const required = Object.entries(parameters).filter(([, p]) => p.required)
    for (const [, p] of required) p.required = false
    if (required.length) notes.push(`A schedule can't fill in ${required.map(([n]) => n).join(', ')}, so ${required.length > 1 ? 'they are' : 'it is'} optional; give ${required.length > 1 ? 'them' : 'it'} a value on the schedule, or start runs by hand or from an app.`)
  }
  return { parameters, notes }
}

export interface WorkflowPlanResult {
  plan?: WorkflowPlan
  /** The planner's last words when it didn't save a plan. */
  reply?: string
}

/** Runs the planner on a description until it saves a plan. */
export async function planWorkflowWithModel(modelCall: ModelCall, description: string, tools: WorkflowPlannerTools): Promise<WorkflowPlanResult> {
  const messages: Message[] = [{ role: 'user', content: `Plan this workflow:\n\n${description}` }]
  let nudges = 0
  let retries = 0
  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    let response
    try {
      response = await modelCall(messages, WORKFLOW_PLANNER_PROMPT, workflowPlannerTools(Boolean(tools.searchMcpServers)))
    } catch (err) {
      // A reply cut off part-way (its tool arguments end mid-JSON) usually
      // means it ran out of room: ask again, for a shorter plan.
      const message = err instanceof Error ? err.message : String(err)
      if (retries < 3 && /JSON|Unterminated|Unexpected end/i.test(message)) {
        retries++
        messages.push({ role: 'user', content: 'Your last reply was cut off before it finished. Call save_plan again, shorter: one line per step, and a skill body under 1500 characters.' })
        continue
      }
      throw err
    }
    const calls = response.content.filter((b) => b.type === 'tool_use')
    const text = response.content.filter((b) => b.type === 'text' && b.text).map((b) => b.text).join('\n').trim()
    // An empty reply (no words, no tool calls) is left out: providers
    // refuse a conversation holding an empty assistant message.
    if (calls.length || text) messages.push({ role: 'assistant', content: response.content })
    if (!calls.length) {
      // Some models answer in words instead of saving: ask for the plan,
      // with what it has, a couple of times before giving up.
      if (nudges < 2) {
        nudges++
        messages.push({ role: 'user', content: 'Save the plan now: call save_plan with the whole plan, using what you have found. Note anything you assumed in gaps.' })
        continue
      }
      return { reply: text || 'The planner stopped without a plan.' }
    }
    const results: ModelContentBlock[] = []
    let plan: WorkflowPlan | undefined
    for (const call of calls) {
      const input = (call.input ?? {}) as Record<string, unknown>
      let output: unknown
      try {
        switch (call.name) {
          case 'list_agents':
            output = await tools.listAgents()
            break
          case 'list_workspace_abilities':
            output = await tools.listWorkspaceAbilities()
            break
          case 'search_public_abilities':
            output = await tools.searchPublicAbilities(String(input.query ?? ''))
            break
          case 'ability_details':
            output = await tools.abilityDetails(String(input.spec ?? ''))
            break
          case 'list_connections':
            output = await tools.listConnections()
            break
          case 'search_mcp_servers':
            output = tools.searchMcpServers ? await tools.searchMcpServers(String(input.query ?? '')) : 'not available'
            break
          case 'mcp_server_tools':
            output = tools.mcpServerTools ? await tools.mcpServerTools(String(input.id ?? '')) : 'not available'
            break
          case 'save_plan':
            plan = validateWorkflowPlan(input)
            output = plan ? 'saved' : 'that plan needs a name, summary, at least one step, a skill body and newAgent.systemPrompt; fix and call again'
            break
          default:
            output = `unknown tool ${call.name}`
        }
      } catch (err) {
        output = `error: ${err instanceof Error ? err.message : String(err)}`
      }
      results.push({ type: 'tool_result', tool_use_id: call.id!, content: typeof output === 'string' ? output : JSON.stringify(output) })
    }
    if (plan) return { plan }
    messages.push({ role: 'user', content: results })
  }
  return { reply: 'The planner ran out of steps before saving a plan. Try describing the workflow more briefly.' }
}

/** A plan as a starter template, for creating it as a new agent. */
export function workflowTemplate(plan: WorkflowPlan): StarterTemplate {
  return {
    id: `workflow-${plan.id}`,
    category: 'Workflow',
    candidate: {
      title: plan.name,
      summary: plan.summary,
      trigger: { kind: plan.trigger.kind === 'schedule' ? 'schedule' : 'on_request', description: plan.trigger.description, ...(plan.trigger.every ? { every: plan.trigger.every } : {}) },
      hoursPerWeek: 1,
      fit: 6,
      risk: plan.rules.some((r) => r.decision === 'allow') && plan.needsApprovals ? 'medium' : 'low',
      asksFirst: plan.steps.filter((s) => s.kind === 'approval' || s.kind === 'ask').map((s) => s.title),
      needs: plan.abilities.map((spec) => ({ kind: 'ability' as const, name: spec, description: spec })),
      agent: { name: plan.newAgent.name, systemPrompt: plan.newAgent.systemPrompt, scheduleMessage: plan.startMessage, exampleMessage: plan.startMessage },
    },
    setup: {
      abilities: plan.abilities,
      ...(plan.apps?.length ? { apps: plan.apps } : {}),
      keys: plan.keys,
      skills: [{ id: plan.id, description: plan.skill.description, body: plan.skill.body }],
      rules: plan.rules.map((r) => ({ name: slugify(`${plan.id}-${r.tool}`, `${plan.id}-rule`), tool: r.tool, decision: r.decision })),
      ...(plan.trigger.kind === 'schedule' && plan.trigger.every
        ? { schedule: { every: plan.trigger.every, ...(plan.trigger.at ? { at: plan.trigger.at } : {}), ...(plan.trigger.weekday !== undefined ? { weekday: plan.trigger.weekday } : {}), name: plan.name, message: plan.startMessage, workflowId: plan.id } }
        : {}),
      needsApprovals: plan.needsApprovals,
    },
  }
}
