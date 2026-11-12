// "Describe a workflow": turns a workflow someone already has in mind,
// described in plain words, into a plan for a LoopEngine agent. Each step
// is matched to a real tool (a public or workspace ability's, or the
// built-in system_ask_user), the points where a person decides become
// checkpoints (a question, or a tool set to "ask"), the steps in order
// become a skill, and the trigger a schedule or a webhook (an outside
// service's events start runs). A workflow always goes into an agent the
// person picked first: the plan builds on that agent's tools and apps,
// and names any app or messaging it still needs, for the person to add
// before it's created.
//
// Like the interviewer (./interviewer.ts), it only reads (agents,
// abilities, connections) and records the plan: creating or changing an
// agent is the person's click, after they've read the plan
// (web/workflow-admin.ts).
import type { ToolSchema } from '#core/agent-config.js'
import type { WorkflowParameter } from '#core/workflows.js'
import type { TriggerSender } from '#core/workflow-triggers.js'
import type { Message, ModelCall, ModelContentBlock } from '#core/run-agent.js'
import type { StarterTemplate, TemplateApp, TemplateSkill } from './templates.js'

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
   * app's id (the request's list of apps). `tool` is then the server's own
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
    /** webhook: an outside service's events start runs (see `webhook`). */
    kind: 'schedule' | 'on_request' | 'webhook'
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
  /** A webhook that starts runs: set when the trigger is "webhook", and
   * also when a scheduled workflow should run on an event too. Made on
   * Create, turned off until the person adds the sender's signing secret. */
  webhook?: PlannedWebhook
  /** Whether each scheduled or webhook-started run's result is sent to
   * the person through the agent's messaging app, and why (shown on the
   * review screen). */
  notify: { on: boolean; reason: string }
  /** Rules and facts this workflow needs that the agent's own
   * instructions don't say: put at the top of the workflow's
   * instructions on Create. */
  context?: string
  /** Whether the job is the kind of work the agent does (by its name,
   * description and instructions), and why not when it isn't: the plan
   * screen then suggests a new agent for it, or adding it anyway. */
  fit?: { matches: boolean; reason: string }
  /** Where an older plan or a ready-made example suggested it go. */
  target?: { kind: 'existing' | 'new'; agent?: string; reason: string }
  /** A ready-made example's standing instructions, for an agent made
   * from it as a template (core/system-agents/templates.ts). */
  newAgent?: { name: string; systemPrompt: string }
  /** What the workspace can't do yet, in plain words. */
  gaps: string[]
  /** MCP servers its steps use, set up on Create (filled in after planning). */
  mcpServers?: PlannedMcpServer[]
  /** Connected apps it adds to the agent, with just the tools its steps
   * use (filled in on Create, from mcpServers). */
  apps?: TemplateApp[]
  /** Skills it adds besides its own, such as a policy the person fills
   * in (the examples, core/system-agents/workflow-examples.ts). One the
   * agent already has is kept as it is. */
  skills?: TemplateSkill[]
  /** Non-secret settings it fills in; one the agent already has is kept. */
  env?: Record<string, string>
  /** Setup steps for its checklist, in plain words. */
  notes?: string[]
}

export interface PlannedWebhook {
  /** Whose events: the sender whose signature it checks. "custom" is the
   * person's own app or any other service that signs the body. */
  sender: TriggerSender
  /** "Stripe: new disputes". */
  name: string
  /** custom only: the header the signature comes in, when known. */
  header?: string
  /** Only these events start a run: a dot path into the payload and its values. */
  filter?: { path: string; values: string[] }
  /** Workflow parameter → dot path into the payload. */
  mapping?: Record<string, string>
  /** What to choose in the sender's own webhook settings, in plain words:
   * "In Stripe, listen for charge.dispute.created." */
  setup?: string
}

export interface WorkflowPlannerTools {
  /** Every agent: its tools, installed abilities, rules and messaging. */
  listAgents(): Promise<unknown>
  /** Every official ability on npm (@loopengine-co), listed in the request. */
  listOfficialAbilities(): Promise<{ name: string; description?: string }[]>
  /** The workspace's private abilities, listed in the request. */
  listWorkspaceAbilities(): Promise<{ name: string; description?: string; spec: string }[]>
  /** An ability's tools (with the decision each ships with) and settings. */
  abilityDetails(spec: string): Promise<unknown>
  listConnections(): Promise<Record<string, unknown>>
  /** The apps the workspace can connect (the Apps page's catalog, and
   * servers it has connected or saved), listed in the request. Optional:
   * without it the planner only plans with abilities. */
  listApps?(): Promise<{ id: string; title: string; description?: string; connected: boolean }[]>
  /** A server's tools, when it can be listed without a key (or with one already set). */
  mcpServerTools?(id: string): Promise<unknown>
}

const MAX_TOOL_ROUNDS = 12

export const WORKFLOW_PLANNER_PROMPT = `You turn a workflow a person describes into a plan for one LoopEngine agent: the agent named in the request, which the workflow is added to. The request also says what that agent has: its instructions, tools, apps and messaging.

LoopEngine agents call tools. Tools come from abilities (installable packages: public ones on npm, or the workspace's own private ones) or are built in. Each tool has a permission: allow (runs on its own), ask (waits for a person to approve, edit or deny it) or deny. When nobody is in Chat, questions and approvals go to the agent's messaging app (Slack, Telegram, Lark or email) and the run waits, for days if needed, then carries on.

How to plan:
1. Look before you plan: start from what the agent has and every ability that can be added (both in the request), then ability_details for any ability you might use (its exact tool names and the settings it needs), and list_connections. list_agents shows the other agents, for a connected service one of them has.
2. Split the workflow into steps, in order. For each step:
   - something to fetch or do: kind "tool", with the exact tool name and where it comes from. A step about a named service (Reddit, X, Gmail, Shopify, GitHub...) uses that service's own tools: its ability when the request lists one, else its app from the request's list of apps, even when the agent can already search or scrape the web. They read the service directly, see what web search can't, and give each action its own permission. Web search and scraping are for the open web, or for a service nothing else covers. Pick the source in this order:
     a. A tool the agent already has, its apps' turned-on tools included: use it, nothing to install. A tool one of its apps can turn on (listed in the request) is planned the same way, with "mcp" set to that app's id: Create turns it on.
     b. An ability from the request's lists: an official one or one of the workspace's own. Set "ability" to its install spec (the npm name, or a workspace ability's spec) and use the exact tool name from ability_details.
     c. Only when no ability can do it: an app from the request's list of apps (each is the app's own MCP server). Use its id, then call mcp_server_tools. Set "mcp" to the app's id, and "tool" to its exact tool name when mcp_server_tools lists them (leave "tool" empty when it needs a key first, and say in "detail" what the step does). An app the agent doesn't have yet is still planned: when it's connected to the workspace, Create adds it to the agent with the tools its steps use; otherwise the person connects it first. The app sets its tools' permissions, so add no rules for MCP tools. An app that isn't on the list can't be planned: set "missing" (e.g. "an app for Pipedrive") and say in gaps that it can be added on the Apps page, as their own server if the app publishes one.
   - the person chooses or answers ("ask me which", "let me pick"): kind "ask", tool "system_ask_user" (built in, no ability). Say what options are offered. It reaches them through the agent's messaging app by itself, so don't add a separate step to post to Slack or another chat first, and don't install a chat ability just to ask.
   - the person reviews or approves before something happens ("let me review it", "before it's sent"): kind "approval", on the tool that does that thing; its rule becomes "ask".
   - the agent's own work (writing, summarising, choosing): kind "other".
   - nothing found can do it: set "missing" to what's needed, and add it to gaps.
3. Rules: every tool the workflow uses gets one. Reading and searching: allow. Anything a person should see first (sending, publishing, paying, creating something others see): ask. Never set deny unless asked.
4. Skill: the steps in order, as numbered instructions. Each step says what to get done, naming the tool to use. It doesn't say how to call it: no argument values, query strings or field names unless the step goes wrong without them (the filter that picks the right items, the field that keeps a reply in its thread). Leave judgment to the agent: what to look up, how to word things, how to handle an ordinary odd case. Spell out only the hard edges: when to stop and ask, what never to do, and what to do when something is missing or fails. Parameters are not argument values: write $name wherever its value is used. Write it so the agent keeps going after each answer or decision.
5. Trigger: how a run starts. startMessage is what the agent receives when it starts.
   - schedule: a time or interval ("every Monday at 9" is every "7d", at "09:00", weekday 1).
   - webhook: when something happens in another service that can call a URL ("when a Stripe dispute comes in", "when a GitHub issue is opened", "when a Shopify order is paid", "when our app sends a new signup"). Fill in "webhook" (below). Prefer it over polling on a schedule whenever the service sends webhooks.
   - on_request: started by a person, from Chat, a message, the Run button or an app's API call.
   A workflow that runs on a schedule and on an event as well: trigger schedule, and fill in "webhook" too.
   webhook: sender ("stripe", "github", "shopify", "standard" for Standard Webhooks senders such as Clerk, Resend or Svix, else "custom" for the person's own app or any other service); a short name ("Stripe: new disputes"); setup: one sentence on what to pick in the sender's webhook settings; filter: which events start a run; mapping: each parameter from a dot path in the payload. What senders send:
   - Stripe: one endpoint can get many event types, so filter path "type", values the event names (charge.dispute.created, checkout.session.completed, invoice.payment_failed, customer.subscription.deleted). The object is at data.object: data.object.id, data.object.customer, data.object.amount, data.object.charge.
   - GitHub: the event type is chosen in GitHub's settings (Issues, Pull requests, Pushes), so say it in setup; filter path "action", values such as opened, closed, created. Fields: issue.number, issue.title, pull_request.number, repository.full_name, sender.login.
   - Shopify: one webhook per topic (orders/paid, orders/create, customers/create), chosen in Shopify, so say it in setup and use no filter. The body is the object itself: id, name (the order number, like #1001), email, total_price, financial_status.
   - standard: filter path "type" (user.created, email.bounced); fields under data (data.id, data.email_addresses).
   - custom: whatever the person's app sends; say in setup what to post (JSON with these fields) and use the paths you described. Set "header" when the person names the signature header.
   Every required parameter should come from the payload through mapping; parameters are the only way event details reach the run.
6. Notify (scheduled and webhook workflows): whether each run's result is sent to the person through the agent's messaging app. true when the result is for them and no step already delivers it ("tell me", "send me", "let me know", a summary or findings that no step posts or emails). false when a step already sends it (posting to a channel, emailing a report): it would arrive twice. false when the work itself is the outcome (answering emails, filing tasks), where a message every run is noise; questions and approvals reach them either way. Say why in one short sentence.
7. Parameters: if the job is about something that changes from run to run (an order, a ticket, an alert, a customer, a date range), declare it as a parameter: a short snake_case name, a one-line description, and required when a run makes no sense without it. Write $name wherever its value goes, in startMessage and in the skill ("Check the refund request for order $order_number."). Apps and people fill them in when they start a run. A scheduled job that finds its own work ("check the inbox every 10 minutes", "last week's sales") needs none. Don't make fixed settings, such as the repository or the channel, parameters: write them into the skill.
8. context: rules and facts this workflow needs that the agent's instructions don't already say, read at the top of the workflow on every run: facts the person must fill in, as "[...] (edit this)" ("Our repository on GitHub: [owner/name] (edit this)."), and rules that always hold for this job ("Never refund more than $refund_limit yourself."). Don't repeat the agent's instructions, the steps, the tools or the schedule. Under 10 lines; empty when there's nothing to add.
9. fit: whether this job is the kind of work the agent does, judged from its name, description and instructions (not its tools or apps: missing ones get added). matches false only when the job is clearly a different line of work (a customer support agent asked to run payroll); a related or broader job still matches, and so does any job for an agent with no description or instructions yet. reason: one short sentence the person reads, naming what the agent does and what the job is ("Support desk answers customers' questions; this workflow runs payroll."); empty when it matches. Plan the workflow fully either way.
10. Messaging: questions, approvals and results reach the person through the agent's messaging app when they're not in Chat. You don't set it up; if the agent has none, plan as usual and the person sets it up before Create. If the person names a different app ("send them to me in Slack") than the agent's messaging app, say in gaps that results will arrive in the agent's app, and that they can change it on the agent's Messaging tab.
11. keys: the setting names its abilities need that list_connections or the agents don't show as set (from ability_details settings). Leave out a setting its description calls optional unless the workflow uses what it's for (a setting only for posting, in a workflow that never posts). Not for MCP servers: their keys are asked for on the plan.

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
    { name: 'ability_details', description: "An ability's exact tool names, what each does, the permission each ships with, and the settings it needs. spec: its npm name or workspace spec.", input_schema: { type: 'object', properties: { spec: { type: 'string' } }, required: ['spec'] } },
    { name: 'list_connections', description: 'What is set up: model providers with keys, messaging apps per agent.', input_schema: { type: 'object', properties: {} } },
    ...(withMcp ? [
      { name: 'mcp_server_tools', description: "An app's tools (name, description, read-only or not), or a note that it needs a key or sign-in before they can be seen. id: from the request's list of apps.", input_schema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
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
              kind: { type: 'string', enum: ['schedule', 'webhook', 'on_request'] },
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
          webhook: {
            type: 'object',
            description: 'When an outside service\'s events start runs: its sender, which events, and the payload fields that fill each parameter.',
            properties: {
              sender: { type: 'string', enum: ['stripe', 'github', 'shopify', 'standard', 'custom'] },
              name: { type: 'string' },
              header: { type: 'string', description: 'custom only: the signature header, when known' },
              setup: { type: 'string', description: 'one sentence: what to pick in the sender\'s webhook settings' },
              filter: { type: 'object', properties: { path: { type: 'string' }, values: { type: 'array', items: { type: 'string' } } }, required: ['path', 'values'] },
              mapping: { type: 'object', description: 'parameter name -> dot path in the payload', additionalProperties: { type: 'string' } },
            },
            required: ['sender', 'name'],
          },
          notify: {
            type: 'object',
            description: 'Scheduled and webhook workflows: whether each run\'s result goes to the person through the agent\'s messaging app, and why in one short sentence.',
            properties: { on: { type: 'boolean' }, reason: { type: 'string' } },
            required: ['on', 'reason'],
          },
          parameters: {
            type: 'object',
            description: 'Values each run is given, by snake_case name; use $name in startMessage and the skill. Leave out when every run is the same.',
            additionalProperties: { type: 'object', properties: { description: { type: 'string' }, required: { type: 'boolean' } } },
          },
          context: { type: 'string', description: "rules and facts this workflow needs that the agent's instructions don't say; empty when none" },
          fit: { type: 'object', properties: { matches: { type: 'boolean' }, reason: { type: 'string' } }, required: ['matches', 'reason'] },
          gaps: { type: 'array', items: { type: 'string' } },
        },
        required: ['name', 'summary', 'trigger', 'steps', 'rules', 'skill', 'startMessage', 'fit'],
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
  // A name for people: one written as an id ("daily-hn-digest") becomes
  // words ("Daily hn digest").
  const rawName = str(r.name, 80)
  const name = rawName && /^[a-z0-9]+(-[a-z0-9]+)+$/.test(rawName) ? rawName.charAt(0).toUpperCase() + rawName.slice(1).replace(/-/g, ' ') : rawName
  const summary = str(r.summary, 600)
  const skillRaw = (r.skill ?? {}) as Record<string, unknown>
  const skillBody = str(skillRaw.body, 12000)
  if (!name || !summary || !skillBody) return undefined

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
    : triggerRaw.kind === 'webhook'
      ? { kind: 'webhook', description: str(triggerRaw.description, 200) ?? 'when an event comes in' }
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
  const id = slugify(str(r.id, 60) ?? name)
  const startMessage = str(r.startMessage, 1000) ?? `Run the "${name}" workflow.`
  const gaps = Array.isArray(r.gaps) ? r.gaps.flatMap((g) => (str(g, 400) ? [str(g, 400)!] : [])).slice(0, 10) : []
  const planned = planParameters(r.parameters, { startMessage, skillBody, scheduled: trigger.kind === 'schedule' })
  const webhook = planWebhook(r.webhook, planned.parameters)
  // A webhook described means events start it; a webhook start with none
  // described is started by hand.
  if (webhook && trigger.kind === 'on_request') trigger.kind = 'webhook'
  if (!webhook && trigger.kind === 'webhook') trigger.kind = 'on_request'
  if (webhook) planned.notes.push(...webhookNotes(webhook, planned.parameters))
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
    ...(webhook ? { webhook } : {}),
    notify: planNotify(r.notify),
    context: str(r.context, 6000) ?? '',
    ...(r.fit ? { fit: planFit(r.fit) } : {}),
    gaps: [...gaps, ...planned.notes].slice(0, 12),
  }
}

const SENDERS: TriggerSender[] = ['stripe', 'github', 'shopify', 'standard', 'custom']

/** A plan's webhook, tidied: a known sender, a filter with values, and a
 * mapping only for parameters the workflow has. Undefined without a
 * sender. Also used on a plan edited before Create. */
export function planWebhook(raw: unknown, parameters: Record<string, WorkflowParameter>): PlannedWebhook | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const w = raw as Record<string, unknown>
  if (!SENDERS.includes(w.sender as TriggerSender)) return undefined
  const sender = w.sender as TriggerSender
  const filterRaw = (w.filter ?? {}) as Record<string, unknown>
  const filterPath = str(filterRaw.path, 120)
  const values = Array.isArray(filterRaw.values) ? filterRaw.values.flatMap((v) => (str(v, 120) ? [str(v, 120)!] : [])).slice(0, 10) : []
  const mapping: Record<string, string> = {}
  if (w.mapping && typeof w.mapping === 'object' && !Array.isArray(w.mapping)) {
    for (const [param, path] of Object.entries(w.mapping as Record<string, unknown>)) {
      const p = str(path, 200)
      if (p && parameters[param] && /^[A-Za-z0-9_.-]+$/.test(p)) mapping[param] = p
    }
  }
  const header = sender === 'custom' ? str(w.header, 80) : undefined
  return {
    sender,
    name: str(w.name, 80) ?? `${sender === 'custom' ? 'App' : sender[0]!.toUpperCase() + sender.slice(1)} events`,
    ...(header && /^[A-Za-z0-9-]{1,80}$/.test(header) ? { header } : {}),
    ...(filterPath && values.length ? { filter: { path: filterPath, values } } : {}),
    ...(Object.keys(mapping).length ? { mapping } : {}),
    ...(str(w.setup, 300) ? { setup: str(w.setup, 300) } : {}),
  }
}

/** Parameters are the only way an event's details reach a run. */
export const WEBHOOK_WITHOUT_PARAMETERS = "This workflow takes no parameters, so a webhook call can't tell a run which event it's about (which dispute, order or issue). Add a parameter for it, use it in the instructions, and map it from the payload on the workflow's Webhooks."

/** What the person should know about a planned webhook: required
 * parameters nothing in the payload fills. */
export function webhookNotes(webhook: PlannedWebhook, parameters: Record<string, WorkflowParameter>): string[] {
  if (!Object.keys(parameters).length) return [WEBHOOK_WITHOUT_PARAMETERS]
  const unfilled = Object.entries(parameters).filter(([name, p]) => p.required && !webhook.mapping?.[name]).map(([name]) => name)
  return unfilled.length ? [`Nothing in the webhook's payload fills ${unfilled.join(', ')}, so those runs would fail; map ${unfilled.length > 1 ? 'them' : 'it'} on the workflow's Webhooks after it's created.`] : []
}

/** A plan's notify choice; off when the planner gave none. */
export function planNotify(raw: unknown): WorkflowPlan['notify'] {
  const n = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  return { on: n.on === true, reason: typeof n.reason === 'string' ? n.reason.trim().slice(0, 200) : '' }
}

/** A plan's parameters, tidied: names made snake_case (or dropped), a
 * $name the start message or skill uses but doesn't declare added as an
 * optional one, and, for a scheduled workflow, required ones made
 * optional (a schedule has no one to fill them in), with a note saying
 * so. Also used on a plan edited before Create. */
/** The planner's fit verdict; a mismatch without a reason counts as a
 * match, since there's nothing to show the person. */
function planFit(raw: unknown): { matches: boolean; reason: string } | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const f = raw as { matches?: unknown; reason?: unknown }
  const reason = typeof f.reason === 'string' ? f.reason.trim().slice(0, 400) : ''
  return f.matches === false && reason ? { matches: false, reason } : { matches: true, reason: '' }
}

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
/** Everything that can be added, for the request: LoopEngine's official
 * abilities, the workspace's own, and the apps it can connect. There are
 * few enough to list whole, so the planner picks from what exists instead
 * of guessing search words. */
async function abilityList(tools: WorkflowPlannerTools): Promise<string> {
  const line = (a: { name: string; description?: string; spec?: string }) =>
    `- ${a.name}${a.spec && a.spec !== a.name ? ` (spec ${a.spec})` : ''}${a.description ? `: ${a.description.replace(/\s+/g, ' ').slice(0, 300)}` : ''}`
  const [official, workspace, apps] = await Promise.all([
    tools.listOfficialAbilities().then((list) => list.map(line), () => undefined),
    tools.listWorkspaceAbilities().then((list) => list.map(line), () => undefined),
    tools.listApps?.().then((list) => list.map((a) => `- ${a.id}: ${a.title}${a.description ? `, ${a.description.replace(/\s+/g, ' ').slice(0, 160)}` : ''}${a.connected ? ' (connected)' : ''}`), () => undefined),
  ])
  const section = (title: string, lines: string[] | undefined) => `${title}\n${lines ? lines.join('\n') || '(none)' : '(the list could not be loaded)'}`
  return [
    section('Official abilities that can be added:', official),
    section("The workspace's own abilities that can be added:", workspace),
    ...(tools.listApps ? [section('Apps (by id) the workspace can connect, each through its own MCP server; "connected" ones are ready to add:', apps)] : []),
  ].join('\n\n')
}

export async function planWorkflowWithModel(modelCall: ModelCall, description: string, tools: WorkflowPlannerTools, agentBrief = ''): Promise<WorkflowPlanResult> {
  const abilities = await abilityList(tools)
  const messages: Message[] = [{ role: 'user', content: `${agentBrief ? `${agentBrief}\n\n` : ''}${abilities}\n\nPlan this workflow:\n\n${description}` }]
  let nudges = 0
  let retries = 0
  let sentBackWebhook = false
  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    let response
    try {
      response = await modelCall(messages, WORKFLOW_PLANNER_PROMPT, workflowPlannerTools(Boolean(tools.listApps)))
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
          case 'ability_details':
            output = await tools.abilityDetails(String(input.spec ?? ''))
            break
          case 'list_connections':
            output = await tools.listConnections()
            break
          case 'mcp_server_tools':
            output = tools.mcpServerTools ? await tools.mcpServerTools(String(input.id ?? '')) : 'not available'
            break
          case 'save_plan':
            plan = validateWorkflowPlan(input)
            // Sent back once: a webhook with no parameters starts runs
            // that don't know which event they're about. Saved as it is
            // the second time, with a note saying so.
            if (plan?.webhook && !Object.keys(plan.parameters).length && !sentBackWebhook) {
              sentBackWebhook = true
              plan = undefined
              output = 'not saved: the webhook fills no parameters, so a run would not know which event it is about. Declare a parameter for what each event is about (e.g. dispute_id), write $name in startMessage and the skill where it is used, map it in webhook.mapping, and call save_plan again.'
              break
            }
            output = plan ? 'saved' : 'that plan needs a name, summary, at least one step and a skill body; fix and call again'
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
      agent: { name: plan.newAgent?.name ?? plan.id, systemPrompt: plan.newAgent?.systemPrompt ?? plan.context ?? '', scheduleMessage: plan.startMessage, exampleMessage: plan.startMessage },
    },
    setup: {
      abilities: plan.abilities,
      ...(plan.apps?.length ? { apps: plan.apps } : {}),
      keys: plan.keys,
      skills: [{ id: plan.id, description: plan.skill.description, body: plan.skill.body }, ...(plan.skills ?? []).filter((s) => s.id !== plan.id)],
      ...(plan.env && Object.keys(plan.env).length ? { env: plan.env } : {}),
      ...(plan.notes?.length ? { notes: plan.notes } : {}),
      // Named after the tool: readable, and made unique if taken.
      rules: plan.rules.map((r) => ({ name: r.tool, tool: r.tool, decision: r.decision })),
      ...(plan.trigger.kind === 'schedule' && plan.trigger.every
        ? { schedule: { every: plan.trigger.every, ...(plan.trigger.at ? { at: plan.trigger.at } : {}), ...(plan.trigger.weekday !== undefined ? { weekday: plan.trigger.weekday } : {}), name: plan.name, message: plan.startMessage, workflowId: plan.id, ...(plan.notify?.on ? { notify: true } : {}) } }
        : {}),
      needsApprovals: plan.needsApprovals,
    },
  }
}
