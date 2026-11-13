// The goal planner, as a pipeline of narrow steps (a prototype for the
// Goals design: one sentence in, a few workflows that each move the goal's
// measure out):
//
//   1. brief    read the goal: in scope or not, literal or a metaphor,
//               which focus (new signups, activation…), the measure,
//               audience and time, as defaults a person would confirm;
//   2. plan     choose levers for that focus (playbook v1, plus new ideas)
//               and draft one workflow request per lever, grounded in
//               what the workspace has connected;
//   3. critique check the plan against the planning rules; when it fails,
//               plan once more with the issues.
//
// Each step is one model call answered with one tool call, so each can be
// tested and scored on its own (tests/evals/ runs all three on the eval
// set). Nothing here builds a workflow: a plan's requests are what the
// workflow planner (workflow-planner.ts) would be given on Build.
import type { Message, ModelCall } from '#core/run-agent.js'
import type { ToolSchema } from '#core/agent-config.js'
import { GOAL_FOCUSES, LEVERS, leversFor, type GoalFocus } from './goal-playbooks.js'

const KNOWN_LEVER_IDS = new Set(LEVERS.map((l) => l.id))

/** What LoopEngine knows about the person: the workspace, the website,
 * what they said. `kind` uses the playbook's vocabulary of needs (email,
 * messaging, web-search, orders-or-crm…). */
export interface GoalContext {
  about: string
  audience?: string
  systems: { name: string; kind: string; connected: boolean }[]
  agents?: { name: string; description: string }[]
  rules?: string
  weeklyHours?: number
}

export type GoalScope = 'in' | 'partial' | 'out'

export interface GoalBrief {
  /** Whether agents can work on it: fully, only the information work
   * around it, or not at all. */
  scope: GoalScope
  scopeReason: string
  /** How the goal was read, e.g. "literal" or "a stretch goal for the business". */
  reading: string
  focus: GoalFocus | 'other'
  measure: string
  /** Where the measure's number comes from (a system, or "none"), and
   * whether that's connected: when it isn't, the plan says how the
   * number will be read. */
  measureSource: string
  measureSourceConnected: boolean
  /** What the goal singles out beyond its main outcome (a segment, a
   * topic, a season…): each must be covered by a workflow. */
  qualifiers: string[]
  audience: string
  weeklyHours: number
  approvals: string
}

/** A workflow already under the goal (suggested, saved, built or
 * discarded), for generating more without repeats. */
export interface SavedGoalWorkflow {
  title: string
  lever: string
  leverId?: string
  state: 'suggested' | 'saved' | 'built' | 'discarded' | 'proposed' | 'dismissed'
}

export interface GoalNeed { name: string; kind: string; connected: boolean }

export interface PlannedGoalWorkflow {
  title: string
  /** The playbook lever's id, when it comes from the playbook. */
  leverId?: string
  /** The lever in a few words, always set: what dedupe and reviews use. */
  lever: string
  focus: GoalFocus | 'other'
  mechanism: string
  /** The request the workflow planner would be given. */
  request: string
  /** The agent it goes into: an existing agent's name, or the new agent's. */
  agent: string
  /** Set when no agent fits and the plan suggests making one. */
  newAgent?: { name: string; instructions: string }
  needs: GoalNeed[]
  humanMinutesPerWeek: number
  startsAfter?: string
  measureLink: string
  /** The brief's qualifiers this workflow addresses. */
  covers: string[]
  newIdea: boolean
}

export interface GoalPlan {
  brief: GoalBrief
  /** One-off steps before or between workflows (tracking, connecting an app). */
  setup: string[]
  workflows: PlannedGoalWorkflow[]
  /** Workflows deliberately left out, and why. */
  leftOut: string[]
  assumptions: string[]
  /** What to tell the person, e.g. why nothing can be planned. */
  message: string
  critique: { passed: boolean; issues: string[]; revised: boolean }
}

export interface GoalPipelineInput {
  goal: string
  context: GoalContext
  saved?: SavedGoalWorkflow[]
  /** The focus the person chose, instead of the one the brief reads. */
  focus?: GoalFocus | 'other'
}

// ---------- prompts ----------

export const GOAL_BRIEF_PROMPT = `You read a goal someone gives LoopEngine, a platform of AI agents that work with information and software: they search, read, write, draft, track, and act in connected apps (email, chat, stores, CRMs, payments, code hosts). They can't do physical work or run large real-world projects on their own.

Call save_brief once:
- scope: "in" when agents can do the work that drives the goal, even though people make the final choice (signups, downloads, sales, donations, replies are all "in"); "partial" only when the core of the goal is physical or offline action the person must do themselves (building, training, travelling), so agents can only do the information work around it; "out" when there is nothing useful an agent could do. scopeReason: one sentence.
- reading: how you read it. When the wording could be a metaphor ("land on the moon", "climb Everest" said of a business), prefer the reading the context supports and say which.
- focus: the one stage of the goal to plan for. Growth of users means "new-signups" unless the goal speaks of using, keeping or activating people. Answering customers sooner is "faster-support". Use "other" only when none fits.
- measure: the number that shows progress, in the person's terms, with what is known about its current value ("unknown" when it isn't).
- measureSource: the system in the context that holds that number ("none" when no system does), and measureSourceConnected: true only when the context lists that system as connected.
- qualifiers: what the goal singles out beyond its main outcome, in its own words ("mostly small e-commerce shops", "especially refunds", "this Christmas"); empty when it singles out nothing.
- audience, weeklyHours (from the context, else 3), approvals (from the context's rules, else "nothing is posted, sent or published without approval").`

export const GOAL_PLAN_PROMPT = `You plan workflows for a confirmed goal brief in LoopEngine. Each workflow is one recurring job for one AI agent; a person reviews what it drafts.

Rules:
1. Levers first, capabilities second. Choose what moves this focus's measure (the playbook's levers, or your own new idea when the context calls for one), then map each to what the workspace has. Never start from what the connected tools could do.
2. Every workflow serves the brief's focus directly and moves its measure. Workflows that only support it (reporting, onboarding for an acquisition goal, support) go in leftOut with a reason, not in workflows.
3. One lever per workflow; no two workflows on the same lever. Never propose a lever already saved under the goal (built, proposed or dismissed): those are listed in the request.
4. Three to five workflows for an "in" goal, ordered by impact against effort, quickest useful one first; startsAfter when one depends on another. Their humanMinutesPerWeek together stay within three quarters of the brief's weeklyHours, so the plan survives a busy week.
4b. Work on a finite list (submitting to a set of directories, a one-time audit) is a setup task, or a workflow that says when it stops; never a weekly job that runs out of things to do.
5. Specific to this context: name the person's own communities, systems, products and channels in each request. A request anyone could use unchanged is wrong.
6. needs: what each workflow uses, each with a kind from the playbook's vocabulary and connected true only when the context lists that kind as connected.
7. Every request that posts, sends or publishes says nothing goes out without the person's approval.
8. The measure must be readable. When measureSourceConnected is false, setup says how the number will be read: connecting that source (name it, e.g. "connect Clerk's user.created webhook so signups and their ref are recorded"), or, when it can't be connected, a light manual record the person updates weekly (kept with the Records ability). Always record a baseline: the number today. Tag what workflows produce (ref=<channel>) so each one's effect can be told apart.
8b. Every qualifier in the brief is covered by at least one workflow that addresses it directly; list it in that workflow's covers.
9. "partial" scope: at most three workflows, only ones that help the person pursue the goal, and say so in the message ("helps you pursue", never "achieves"). "out" scope: no workflows; the message says plainly why, and offers a smaller or related goal.
10. agent: an existing agent's exact name when its work fits. When none fits, or there are no agents yet, suggest a new one: agent and newAgent.name the same short lowercase name with hyphens (e.g. "community-agent"), and newAgent.instructions two or three sentences on what it does and how it behaves. Group workflows that belong together in one agent rather than one agent each.

Call save_plan once.`

export const GOAL_CRITIQUE_PROMPT = `You check a goal plan against its rules before a person sees it. List every issue (be strict, quote the workflow):
- a workflow that doesn't serve the brief's focus or move its measure;
- two workflows on the same lever, or one repeating a lever already saved;
- a request generic enough to fit any business;
- a need marked connected that the context doesn't list as connected;
- a request that posts, sends or publishes without saying it waits for approval;
- review time over three quarters of the weekly budget;
- a measure whose source isn't connected, with no setup step that connects it or a manual record, or no baseline;
- a qualifier from the brief no workflow addresses;
- a weekly workflow on a finite list that will run out;
- a plan claiming to achieve a goal that is only partly in scope, or workflows for an out-of-scope goal.
Call save_review once: passed true only when there are no issues.`

// ---------- tools ----------

const focusEnum = [...GOAL_FOCUSES, 'other']

const BRIEF_TOOL: ToolSchema = {
  name: 'save_brief',
  description: 'Save how the goal was read.',
  input_schema: {
    type: 'object',
    properties: {
      scope: { type: 'string', enum: ['in', 'partial', 'out'] },
      scopeReason: { type: 'string' },
      reading: { type: 'string' },
      focus: { type: 'string', enum: focusEnum },
      measure: { type: 'string' },
      measureSource: { type: 'string' },
      measureSourceConnected: { type: 'boolean' },
      qualifiers: { type: 'array', items: { type: 'string' } },
      audience: { type: 'string' },
      weeklyHours: { type: 'number' },
      approvals: { type: 'string' },
    },
    required: ['scope', 'scopeReason', 'reading', 'focus', 'measure', 'measureSource', 'measureSourceConnected', 'qualifiers', 'audience', 'weeklyHours', 'approvals'],
  },
}

const PLAN_TOOL: ToolSchema = {
  name: 'save_plan',
  description: 'Save the plan.',
  input_schema: {
    type: 'object',
    properties: {
      setup: { type: 'array', items: { type: 'string' } },
      workflows: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            leverId: { type: 'string', description: "the playbook lever's id; empty for a new idea" },
            lever: { type: 'string', description: 'the lever in a few words' },
            focus: { type: 'string', enum: focusEnum },
            mechanism: { type: 'string', description: 'why it moves the measure, one sentence' },
            request: { type: 'string', description: 'the workflow request, specific to this context' },
            agent: { type: 'string' },
            newAgent: { type: 'object', properties: { name: { type: 'string' }, instructions: { type: 'string' } }, required: ['name', 'instructions'], description: 'only when no existing agent fits' },
            needs: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, kind: { type: 'string' }, connected: { type: 'boolean' } }, required: ['name', 'kind', 'connected'] } },
            humanMinutesPerWeek: { type: 'number' },
            startsAfter: { type: 'string' },
            measureLink: { type: 'string' },
            covers: { type: 'array', items: { type: 'string' }, description: "the brief's qualifiers it addresses" },
          },
          required: ['title', 'lever', 'focus', 'mechanism', 'request', 'agent', 'needs', 'humanMinutesPerWeek', 'measureLink'],
        },
      },
      leftOut: { type: 'array', items: { type: 'string' } },
      assumptions: { type: 'array', items: { type: 'string' } },
      message: { type: 'string' },
    },
    required: ['setup', 'workflows', 'leftOut', 'assumptions', 'message'],
  },
}

const REVIEW_TOOL: ToolSchema = {
  name: 'save_review',
  description: 'Save the check.',
  input_schema: {
    type: 'object',
    properties: { passed: { type: 'boolean' }, issues: { type: 'array', items: { type: 'string' } } },
    required: ['passed', 'issues'],
  },
}

// ---------- the pipeline ----------

/** One model call answered with one tool: asks again, up to twice, when
 * the model answers in words. */
async function callTool(modelCall: ModelCall, system: string, user: string, tool: ToolSchema): Promise<Record<string, unknown>> {
  const messages: Message[] = [{ role: 'user', content: user }]
  for (let attempt = 0; attempt < 4; attempt++) {
    let response
    try {
      response = await modelCall(messages, system, [tool])
    } catch (err) {
      // A reply cut off part-way (its arguments end mid-JSON) ran out of
      // room: ask again, shorter. A dropped connection: just ask again.
      const message = err instanceof Error ? err.message : String(err)
      if (attempt < 3 && /JSON|Unterminated|Unexpected end|after array element|after property value/i.test(message)) {
        messages.splice(1)
        messages[0] = { role: 'user', content: `${user}\n\nYour last answer was cut off before it finished. Keep every field short: requests under 80 words, one sentence elsewhere.` }
        continue
      }
      if (attempt < 3 && /terminated|ECONNRESET|socket|fetch failed|timeout/i.test(message)) continue
      throw err
    }
    const call = response.content.find((b) => b.type === 'tool_use' && b.name === tool.name)
    if (call && call.type === 'tool_use') return (call.input ?? {}) as Record<string, unknown>
    // Only a reply with something in it goes back: providers refuse an
    // empty assistant message.
    const said = response.content.filter((b) => (b.type === 'text' && b.text?.trim()) || b.type === 'tool_use')
    if (said.length) messages.push({ role: 'assistant', content: said })
    messages.push({ role: 'user', content: `Call ${tool.name} now, with your answer.` })
  }
  throw new Error(`The model didn't call ${tool.name}.`)
}

export function contextText(context: GoalContext): string {
  const systems = context.systems.map((s) => `- ${s.name} (kind ${s.kind}): ${s.connected ? 'connected' : 'not connected'}`).join('\n') || '(none)'
  const agents = (context.agents ?? []).map((a) => `- ${a.name}: ${a.description}`).join('\n') || '(none yet)'
  return [
    `About: ${context.about}`,
    context.audience ? `Audience: ${context.audience}` : '',
    `Systems:\n${systems}`,
    `Agents:\n${agents}`,
    context.rules ? `Rules: ${context.rules}` : '',
    context.weeklyHours ? `Time to review drafts: about ${context.weeklyHours} hours a week` : '',
  ].filter(Boolean).join('\n')
}

function leversText(focus: GoalBrief['focus']): string {
  if (focus === 'other') return 'Playbook levers: none for this focus; use your own ideas, each marked as a new idea.'
  return 'Playbook levers for this focus (id: name; why; fits when; not when; needs; minutes a week):\n' + leversFor(focus).map((l) =>
    `- ${l.id}: ${l.name}. ${l.mechanism} Fits when: ${l.fitsWhen.join('; ')}. Not when: ${l.notWhen.join('; ')}. Needs: ${[...(l.needs.anyOf?.length ? [`one of ${l.needs.anyOf.join('/')}`] : []), ...(l.needs.plus ?? [])].join(' + ')}. About ${l.humanMinutesPerWeek} min/week. Template: ${l.template}`,
  ).join('\n')
}

function savedText(saved: SavedGoalWorkflow[] | undefined): string {
  if (!saved?.length) return 'Already saved under this goal: nothing yet.'
  return 'Already saved under this goal (never propose these levers again):\n' + saved.map((s) => `- ${s.title} (lever: ${s.lever}${s.leverId ? `, ${s.leverId}` : ''}; ${s.state})`).join('\n')
}

/** A suggested agent's name as a folder name: lowercase, hyphens. */
export function agentName(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)
}

const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v.trim() : fallback)
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).map((x) => x.trim()) : [])
const focusOf = (v: unknown): GoalBrief['focus'] => (typeof v === 'string' && (focusEnum as string[]).includes(v) ? (v as GoalBrief['focus']) : 'other')

export async function readGoalBrief(modelCall: ModelCall, goal: string, context: GoalContext): Promise<GoalBrief> {
  const raw = await callTool(modelCall, GOAL_BRIEF_PROMPT, `${contextText(context)}\n\nThe goal, as the person said it:\n${goal}`, BRIEF_TOOL)
  const scope = raw.scope === 'partial' || raw.scope === 'out' ? raw.scope : 'in'
  return {
    scope,
    scopeReason: str(raw.scopeReason),
    reading: str(raw.reading),
    focus: focusOf(raw.focus),
    measure: str(raw.measure, 'unknown'),
    measureSource: str(raw.measureSource, 'none'),
    measureSourceConnected: raw.measureSourceConnected === true,
    qualifiers: strings(raw.qualifiers),
    audience: str(raw.audience, context.audience ?? ''),
    weeklyHours: typeof raw.weeklyHours === 'number' && raw.weeklyHours > 0 ? raw.weeklyHours : context.weeklyHours ?? 3,
    approvals: str(raw.approvals, 'nothing is posted, sent or published without approval'),
  }
}

function briefText(brief: GoalBrief): string {
  return `Confirmed brief:\n- scope: ${brief.scope} (${brief.scopeReason})\n- reading: ${brief.reading}\n- focus: ${brief.focus}\n- measure: ${brief.measure}\n- measure source: ${brief.measureSource} (${brief.measureSourceConnected ? 'connected' : 'not connected'})\n- qualifiers: ${brief.qualifiers.join('; ') || 'none'}\n- audience: ${brief.audience}\n- weekly review time: ${brief.weeklyHours} hours\n- approvals: ${brief.approvals}`
}

function parsePlan(raw: Record<string, unknown>): Omit<GoalPlan, 'brief' | 'critique'> {
  const workflows = (Array.isArray(raw.workflows) ? raw.workflows : []).flatMap((w): PlannedGoalWorkflow[] => {
    if (!w || typeof w !== 'object') return []
    const x = w as Record<string, unknown>
    const title = str(x.title)
    const request = str(x.request)
    if (!title || !request) return []
    // Some models put the playbook id in lever and leave leverId empty.
    const leverId = str(x.leverId) || (KNOWN_LEVER_IDS.has(str(x.lever)) ? str(x.lever) : '')
    const na = x.newAgent && typeof x.newAgent === 'object' ? (x.newAgent as Record<string, unknown>) : undefined
    const newAgentName = na ? agentName(str(na.name) || str(x.agent)) : ''
    const needs = (Array.isArray(x.needs) ? x.needs : []).flatMap((n): GoalNeed[] => {
      if (!n || typeof n !== 'object') return []
      const y = n as Record<string, unknown>
      return str(y.name) || str(y.kind) ? [{ name: str(y.name, str(y.kind)), kind: str(y.kind, str(y.name)).toLowerCase(), connected: y.connected === true }] : []
    })
    return [{
      title,
      ...(leverId ? { leverId } : {}),
      // An empty label falls back to the playbook lever's name, else the title.
      lever: (leverId && (str(x.lever) === leverId || !str(x.lever)) ? LEVERS.find((l) => l.id === leverId)?.name : str(x.lever)) || title,
      focus: focusOf(x.focus),
      mechanism: str(x.mechanism),
      request,
      agent: newAgentName || str(x.agent),
      ...(newAgentName ? { newAgent: { name: newAgentName, instructions: str(na!.instructions) } } : {}),
      needs,
      humanMinutesPerWeek: typeof x.humanMinutesPerWeek === 'number' ? x.humanMinutesPerWeek : 0,
      ...(str(x.startsAfter) ? { startsAfter: str(x.startsAfter) } : {}),
      measureLink: str(x.measureLink),
      covers: strings(x.covers),
      newIdea: !leverId,
    }]
  })
  return { setup: strings(raw.setup), workflows, leftOut: strings(raw.leftOut), assumptions: strings(raw.assumptions), message: str(raw.message) }
}

export async function draftGoalPlan(modelCall: ModelCall, input: GoalPipelineInput, brief: GoalBrief, issues: string[] = []): Promise<Omit<GoalPlan, 'brief' | 'critique'>> {
  const user = [
    contextText(input.context),
    briefText(brief),
    leversText(brief.focus),
    savedText(input.saved),
    `The goal, as the person said it:\n${input.goal}`,
    issues.length ? `A check found these issues in your last plan; fix every one:\n${issues.map((i) => `- ${i}`).join('\n')}` : '',
  ].filter(Boolean).join('\n\n')
  return parsePlan(await callTool(modelCall, GOAL_PLAN_PROMPT, user, PLAN_TOOL))
}

export async function critiqueGoalPlan(modelCall: ModelCall, input: GoalPipelineInput, brief: GoalBrief, plan: Omit<GoalPlan, 'brief' | 'critique'>): Promise<{ passed: boolean; issues: string[] }> {
  const user = [contextText(input.context), briefText(brief), savedText(input.saved), `The plan:\n${JSON.stringify(plan, null, 2)}`].join('\n\n')
  const raw = await callTool(modelCall, GOAL_CRITIQUE_PROMPT, user, REVIEW_TOOL)
  const issues = strings(raw.issues)
  return { passed: raw.passed === true && issues.length === 0, issues }
}

/** Brief, plan, critique, and one revision when the critique fails. */
export async function runGoalPipeline(modelCall: ModelCall, input: GoalPipelineInput): Promise<GoalPlan> {
  const read = await readGoalBrief(modelCall, input.goal, input.context)
  const brief = input.focus ? { ...read, focus: input.focus } : read
  let plan = await draftGoalPlan(modelCall, input, brief)
  let review = await critiqueGoalPlan(modelCall, input, brief, plan)
  let revised = false
  if (!review.passed) {
    plan = await draftGoalPlan(modelCall, input, brief, review.issues)
    revised = true
    review = await critiqueGoalPlan(modelCall, input, brief, plan)
  }
  return { brief, ...plan, critique: { ...review, revised } }
}
