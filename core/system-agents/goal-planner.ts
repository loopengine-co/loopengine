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
import { activePlaybook, leversFor, type Focus, type GoalFocus, type Lever } from './goal-playbooks.js'

// The prompt lists at most this many of a focus's levers, so a growing
// playbook never makes a long prompt. (Later: the best-ranked first.)
const MAX_LEVERS_IN_PROMPT = 10

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

export interface GoalProfile {
  /** The number it moves, and which way: up, down, reach a milestone, or keep it steady. */
  metric: string
  direction: 'up' | 'down' | 'reach' | 'keep'
  /** Limits that rule approaches out: budget, time, diet, an injury, a region… */
  constraints: string[]
  timeframe: string
  /** Where they start: first try, tried before, what's already in place. */
  startingPoint: string
  /** What's most likely to stop this goal, and why. */
  bottleneck: string
  bottleneckWhy: string
}

/** How the plan chose its levers: every lever it looked at, chosen or
 * ruled out, and why. */
export interface LeverChoice {
  leverId?: string
  lever: string
  decision: 'chosen' | 'ruled_out'
  reason: string
}

export interface GoalBrief {
  /** Whether agents can work on it: fully, only the information work
   * around it, or not at all. */
  scope: GoalScope
  scopeReason: string
  /** How the goal was read, e.g. "literal" or "a stretch goal for the business". */
  reading: string
  focus: GoalFocus | 'other'
  /** When no focus in the playbook fits: the one the planner named
   * (generic words; saved in the workspace's own playbook). */
  newFocus?: Focus
  measure: string
  /** Where the measure's number comes from (a system, or "none"), and
   * whether that's connected: when it isn't, the plan says how the
   * number will be read. */
  measureSource: string
  measureSourceConnected: boolean
  /** What the goal singles out beyond its main outcome (a segment, a
   * topic, a season…): each must be covered by a workflow. */
  qualifiers: string[]
  /** What makes this goal different from others with the same focus, and
   * what's most likely to stop it: levers are chosen against this. */
  profile?: GoalProfile
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
  state: 'suggested' | 'saved' | 'built' | 'active' | 'done' | 'discarded' | 'proposed' | 'dismissed'
}

export interface GoalNeed { name: string; kind: string; connected: boolean }

export interface PlannedGoalWorkflow {
  title: string
  /** recurring: a workflow runs it again and again. once: one piece of
   * work (a finite list, a one-time audit) an agent does once. */
  kind: 'recurring' | 'once'
  /** The job's own number ("replies per week"), or for a once job what
   * done looks like ("done when: 20 communities are listed"). */
  measure: string
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
  /** The playbook version the plan was made with. */
  playbookVersion: number
  /** Every lever the plan looked at, chosen or ruled out, and why. */
  considered?: LeverChoice[]
  /** Levers the planner wrote because the playbook had none that fit
   * (generic, like the playbook's own; saved in the workspace's own
   * playbook, and the jobs made from them refer to them). */
  newLevers?: Lever[]
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
- focus: the one stage of the goal to plan for, from the focuses listed in the request. Growth of users means "new-signups" unless the goal speaks of using, keeping or activating people. Answering customers sooner is "faster-support". When none fits, focus "other" and newFocus: name the stage in a few generic words (label, e.g. "Hiring", "Closing sales deals", "Personal health habits") with a one-sentence hint of what goals with this focus are about. No names of the business, its products, people or places.
- measure: the number that shows progress, in the person's terms, with what is known about its current value ("unknown" when it isn't).
- measureSource: the system in the context that holds that number ("none" when no system does), and measureSourceConnected: true only when the context lists that system as connected.
- qualifiers: what the goal singles out beyond its main outcome, in its own words ("mostly small e-commerce shops", "especially refunds", "this Christmas"); empty when it singles out nothing.
- profile: what makes this goal different from others with the same focus. metric: the number it moves; direction: "up", "down", "reach" (a milestone) or "keep"; constraints: limits that rule approaches out (no budget, night shifts, vegetarian, an injury, only one market), from the goal and the context, empty when none; timeframe ("by March", "unknown"); startingPoint (first try, tried before, what's already in place, or "unknown"); bottleneck: what's most likely to stop this particular goal (for most weight goals it's sticking with it; for a new product it may be that nobody knows it exists), and bottleneckWhy in a sentence.
- A listed focus is the same focus when the goal is the same kind of work, even worded differently or aimed the other way (losing and gaining weight; hiring support staff and hiring engineers): use it rather than naming a new one.
- audience, weeklyHours (from the context, else 3), approvals (from the context's rules, else "nothing is posted, sent or published without approval").`

export const GOAL_PLAN_PROMPT = `You plan workflows for a confirmed goal brief in LoopEngine. Each workflow is one recurring job for one AI agent; a person reviews what it drafts.

Rules:
1. Levers first, capabilities second. Choose what moves this focus's measure (the playbook's levers, or your own when the context calls for one), then map each to what the workspace has. Never start from what the connected tools could do.
1b. When the request lists no playbook levers for this focus (none yet, or every one already under this goal), write the levers you need first, in newLevers (two to five), then make each workflow from one of them (its leverId is the lever's key). When levers are listed but one this goal clearly needs is missing, you may add up to two. A new lever is like the playbook's: one distinct approach (one reason it works), in generic words that fit many goals of this focus (no names of this business, its products, people, places or sites; no direction, target or amount when the approach works either way: "a weekly meal routine toward the target", not "eat less"), with when it fits and doesn't, what it needs, review time, how its effect shows up, guardrails (approval before anything is sent, posted or published), and a generic template with {placeholders}. The workflow's request is where this business's specifics go.
2. Every workflow serves the brief's focus directly and moves its measure. Workflows that only support it (reporting, onboarding for an acquisition goal, support) go in leftOut with a reason, not in workflows.
3. One lever per workflow, named in a few generic words (no business, product, person, place or site names: "list in app marketplaces", not "list Wick & Ember on Shopify"); no two workflows on the same lever. Never propose a lever already saved under the goal (built, proposed or dismissed): those are listed in the request.
3b. Choose levers for this goal, not for the focus in general. Look at every lever listed: rule out one whose "not when", needs or the profile's constraints don't fit; prefer the ones that address the profile's bottleneck; pick ones that work in different ways (not three kinds of tracking). In considered, list every lever you looked at with chosen or ruled_out and a short reason tied to this goal ("addresses sticking with it", "no gym: ruled out"). Reuse a listed lever whenever its approach fits, even if it was written for a goal aimed the other way: put what's specific to this goal (the direction, the target, the details) in the workflow's request. Write a new lever only for what no listed lever covers.
4. Three to five workflows for an "in" goal, ordered by impact against effort, quickest useful one first; startsAfter when one depends on another. Their humanMinutesPerWeek together stay within three quarters of the brief's weeklyHours, so the plan survives a busy week.
4b. Each one is a job: kind "recurring" when it runs again and again (a weekly scan, a reply to each signup), kind "once" for work on a finite list or done one time (submitting to a set of directories, a one-time audit, researching a list of communities). A once job is done by an agent once, in Chat; never make it a weekly job that runs out of things to do.
4c. measure: the job's own number, in the person's terms, that shows it's working ("replies per week", "signups tagged ref=directories"); for a once job, what done looks like ("done when: listed in 15 directories"). A playbook lever says the kind and measure it usually has: start from those, and change them only when the context calls for it.
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
- a recurring job on a finite list that will run out (it should be kind "once");
- a lever in newLevers that names this business, its products, people, places or sites, mixes several approaches, or has no way to see its effect;
- a workflow made from no lever when the request listed none for this focus (it should come from one of newLevers);
- a plan claiming to achieve a goal that is only partly in scope, or workflows for an out-of-scope goal.
Call save_review once: passed true only when there are no issues.`

// ---------- tools ----------

/** The focus ids the planner may pick: the playbook in use's, and "other". */
const focusEnum = () => [...activePlaybook().focuses.map((f) => f.id), 'other']

const briefTool = (): ToolSchema => ({
  name: 'save_brief',
  description: 'Save how the goal was read.',
  input_schema: {
    type: 'object',
    properties: {
      scope: { type: 'string', enum: ['in', 'partial', 'out'] },
      scopeReason: { type: 'string' },
      reading: { type: 'string' },
      focus: { type: 'string', enum: focusEnum() },
      newFocus: { type: 'object', properties: { label: { type: 'string' }, hint: { type: 'string' } }, required: ['label', 'hint'], description: 'only when focus is "other": the stage, named in generic words' },
      profile: {
        type: 'object',
        properties: {
          metric: { type: 'string' }, direction: { type: 'string', enum: ['up', 'down', 'reach', 'keep'] }, constraints: { type: 'array', items: { type: 'string' } },
          timeframe: { type: 'string' }, startingPoint: { type: 'string' }, bottleneck: { type: 'string' }, bottleneckWhy: { type: 'string' },
        },
        required: ['metric', 'direction', 'constraints', 'timeframe', 'startingPoint', 'bottleneck', 'bottleneckWhy'],
      },
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
})

const NEW_LEVER_SCHEMA = {
  type: 'object',
  description: 'a lever the playbook lacks, in generic words (no names of the business, its products, people, places or sites)',
  properties: {
    key: { type: 'string', description: 'a short lowercase-hyphenated key; workflows made from it put this key in leverId' },
    name: { type: 'string', description: 'the approach in a few words' },
    kind: { type: 'string', enum: ['recurring', 'once'] },
    mechanism: { type: 'string', description: 'why it tends to move the measure, one sentence' },
    fitsWhen: { type: 'array', items: { type: 'string' } },
    notWhen: { type: 'array', items: { type: 'string' } },
    needs: { type: 'array', items: { type: 'string' }, description: 'kinds of app or ability it uses (email, messaging, web-search, records, …)' },
    humanMinutesPerWeek: { type: 'number' },
    firstResultDays: { type: 'number' },
    measureLink: { type: 'string', description: 'how its effect shows up, generically' },
    guardrails: { type: 'array', items: { type: 'string' } },
    template: { type: 'string', description: 'the request it starts from, generic, with {placeholders}' },
  },
  required: ['key', 'name', 'kind', 'mechanism', 'fitsWhen', 'notWhen', 'needs', 'humanMinutesPerWeek', 'firstResultDays', 'measureLink', 'guardrails', 'template'],
}

const planTool = (): ToolSchema => ({
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
            kind: { type: 'string', enum: ['recurring', 'once'] },
            measure: { type: 'string', description: "the job's own number, or for a once job what done looks like" },
            leverId: { type: 'string', description: "the playbook lever's id, or the key of one of your newLevers" },
            lever: { type: 'string', description: 'the lever in a few generic words, with no names of the business, its products, people, places or sites' },
            focus: { type: 'string' },
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
      newLevers: { type: 'array', items: NEW_LEVER_SCHEMA, description: 'levers the playbook lacks; required when the request lists none for this focus' },
      considered: {
        type: 'array',
        description: 'every lever you looked at (listed ones, and any you wrote), chosen or ruled out, with a short reason tied to this goal',
        items: { type: 'object', properties: { lever: { type: 'string', description: 'its id, or for one you wrote its key' }, decision: { type: 'string', enum: ['chosen', 'ruled_out'] }, reason: { type: 'string' } }, required: ['lever', 'decision', 'reason'] },
      },
      leftOut: { type: 'array', items: { type: 'string' } },
      assumptions: { type: 'array', items: { type: 'string' } },
      message: { type: 'string' },
    },
    required: ['setup', 'workflows', 'leftOut', 'assumptions', 'message'],
  },
})

/** A job a person added in their own words, shaped like a planned one. */
export const GOAL_ADD_JOB_PROMPT = `A person adds a job of their own to a goal in LoopEngine, in their own words. Shape it into one job like a planner's, and judge it honestly; it's their business, so advise, don't lecture.

Shape it:
- title, kind ("recurring" when it repeats, "once" for finite work), measure (its own number, or for a once job what done looks like), why it moves the goal (mechanism), the agent (an existing agent's exact name when its work fits, else newAgent with a short name and two or three sentences of instructions), needs (connected only when the context lists it), humanMinutesPerWeek, and a request specific to this business that the agent can act on. Anything that posts, sends or publishes says nothing goes out without the person's approval.
- lever: when it's one of the playbook levers listed, its id in leverId. When none fits, write one generic lever in newLever (one approach, no names of this business, its products, people, places or sites; when it fits and doesn't; what it needs; how its effect shows up; guardrails; a generic template) and put its key in leverId.

Judge it, in verdict:
- "added": it fits the goal and is safe.
- "changed": a sound idea with risky details you changed (an approval added, volume limited, a platform's rules respected); say what you changed in note.
- "warned": it's safe but unlikely to move the goal's measure, repeats a job already under the goal, or is unlikely to work; say why in note and give a better-aimed alternative.
- "refused": it's deceptive, illegal or against a platform's rules (fake reviews or accounts, spam, buying followers, harvesting private data, impersonation, misleading claims) or could harm people. Don't shape it; say why in note, plainly and briefly, and give a legitimate alternative.

When there is no goal (a job added on its own), judge it on its own: "added" when it suits this business and is safe; "warned" when it's unlikely to work or repeats a job already listed. Its mechanism is what the job gets done for the business, and it has no lever: leave leverId and newLever out.

Call save_job once.`

const addJobTool = (): ToolSchema => {
  const plan = planTool().input_schema as { properties: { workflows: { items: unknown } } }
  return {
    name: 'save_job',
    description: 'Save the shaped job and your verdict.',
    input_schema: {
      type: 'object',
      properties: {
        verdict: { type: 'string', enum: ['added', 'changed', 'warned', 'refused'] },
        note: { type: 'string', description: 'for changed, warned or refused: one or two sentences for the person' },
        alternative: { type: 'string', description: 'for warned or refused: a better-aimed or legitimate job, in a sentence' },
        job: plan.properties.workflows.items,
        newLever: NEW_LEVER_SCHEMA,
      },
      required: ['verdict'],
    },
  }
}

export interface ShapedJob {
  verdict: 'added' | 'changed' | 'warned' | 'refused'
  note: string
  alternative: string
  /** Missing when refused, or when the answer had no usable job. */
  job?: PlannedGoalWorkflow
  /** The lever the planner wrote for it, when none fit. */
  newLever?: Lever
}

/** Shapes a job a person typed, under a goal already planned: its kind,
 * measure, agent, request and lever (an existing one, or a new generic
 * one), and judges it: added, changed, warned or refused. */
export async function shapeJob(modelCall: ModelCall, input: { goal?: string; brief?: GoalBrief; context: GoalContext; saved?: SavedGoalWorkflow[]; idea: string }): Promise<ShapedJob> {
  // A job added on its own (the Jobs page) has no goal: no brief, no levers.
  const focus = input.brief?.focus ?? 'other'
  const levers = focus === 'other' ? [] : leversFor(focus)
  const user = [
    contextText(input.context),
    input.brief ? briefText(input.brief) : '',
    input.brief ? (levers.length ? `Playbook levers for this focus:\n${levers.slice(0, MAX_LEVERS_IN_PROMPT * 2).map((l) => `- ${l.id}: ${l.name}. ${l.mechanism} Usually ${l.kind === 'once' ? 'a once job' : 'a recurring job'}; its measure: ${l.measureLink}.`).join('\n')}` : 'Playbook levers: none for this focus yet.') : '',
    savedText(input.saved),
    input.goal ? `The goal:\n${input.goal}` : 'There is no goal: the person is adding this job on its own.',
    `The job the person wants to add, in their words:\n${input.idea}`,
  ].filter(Boolean).join('\n\n')
  const raw = await callTool(modelCall, GOAL_ADD_JOB_PROMPT, user, addJobTool())
  const verdict = raw.verdict === 'changed' || raw.verdict === 'warned' || raw.verdict === 'refused' ? raw.verdict : 'added'
  const note = str(raw.note).slice(0, 600)
  const alternative = str(raw.alternative).slice(0, 400)
  if (verdict === 'refused') return { verdict, note, alternative }
  const shaped = parsePlan({ workflows: raw.job ? [raw.job] : [], newLevers: raw.newLever ? [raw.newLever] : [] }, focus)
  const job = shaped.workflows[0]
  return { verdict, note, alternative, ...(job ? { job } : {}), ...(job && shaped.newLevers?.[0] ? { newLever: shaped.newLevers[0] } : {}) }
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

/** The focus's levers the plan may still use (none already under the
 * goal). With none left, the planner writes new ones, as for a new focus,
 * so Generate more keeps finding approaches. */
function leversText(focus: GoalBrief['focus'], saved: SavedGoalWorkflow[] = []): string {
  const used = new Set(saved.flatMap((s) => (s.leverId ? [s.leverId] : [])))
  const all = focus === 'other' ? [] : leversFor(focus)
  const levers = all.filter((l) => !used.has(l.id))
  if (!levers.length) return all.length
    ? 'Playbook levers: every one for this focus is already under this goal. Write new levers in newLevers (rule 1b: two to five, each a different approach from those already saved), and make each workflow from one of them.'
    : 'Playbook levers: none for this focus yet. Write the levers this goal needs in newLevers (rule 1b), and make each workflow from one of them.'
  return 'Playbook levers for this focus (id: name; why; fits when; not when; needs; minutes a week):\n' + levers.slice(0, MAX_LEVERS_IN_PROMPT).map((l) =>
    `- ${l.id}: ${l.name}. ${l.mechanism} Fits when: ${l.fitsWhen.join('; ')}. Not when: ${l.notWhen.join('; ')}. Needs: ${[...(l.needs.anyOf?.length ? [`one of ${l.needs.anyOf.join('/')}`] : []), ...(l.needs.plus ?? [])].join(' + ')}. About ${l.humanMinutesPerWeek} min/week. Usually ${l.kind === 'once' ? 'a once job' : 'a recurring job'}; its measure: ${l.measureLink}. Template: ${l.template}`,
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
const focusOf = (v: unknown): GoalBrief['focus'] => (typeof v === 'string' && focusEnum().includes(v) ? (v as GoalBrief['focus']) : 'other')
function profileFrom(raw: unknown): GoalProfile | undefined {
  const p = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : undefined
  if (!p || !str(p.bottleneck)) return undefined
  const direction = p.direction === 'down' || p.direction === 'reach' || p.direction === 'keep' ? p.direction : 'up'
  return {
    metric: str(p.metric).slice(0, 200), direction, constraints: strings(p.constraints).slice(0, 8), timeframe: str(p.timeframe, 'unknown').slice(0, 100),
    startingPoint: str(p.startingPoint, 'unknown').slice(0, 300), bottleneck: str(p.bottleneck).slice(0, 200), bottleneckWhy: str(p.bottleneckWhy).slice(0, 400),
  }
}

const slug = (v: string) => v.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '')
/** Text that shouldn't leave the workspace in a lever: links, addresses,
 * handles, long numbers. */
const UNSAFE_LEVER_TEXT = /https?:|www\.|@|\.(com|co|io|app|net|org|ai)\b|\d{4,}/i

/** The focus the brief named, as a workspace's own focus ("x-..."). */
function newFocusFrom(raw: unknown): Focus | undefined {
  const f = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const label = str(f.label).slice(0, 60)
  const hint = str(f.hint).slice(0, 300)
  const id = `x-${slug(label)}`
  if (!label || !hint || id === 'x-' || UNSAFE_LEVER_TEXT.test(`${label} ${hint}`)) return undefined
  return { id, label, hint }
}

/** The levers a plan wrote, as a workspace's own levers under the focus
 * (ids "<focus>.x-<key>"), keyed by the key its workflows use. One with
 * unsafe text or a missing part is dropped. */
function newLeversFrom(raw: unknown, focus: string): Map<string, Lever> {
  const out = new Map<string, Lever>()
  if (!Array.isArray(raw) || focus === 'other') return out
  for (const item of raw.slice(0, 5)) {
    const x = item && typeof item === 'object' ? (item as Record<string, unknown>) : {}
    const key = slug(str(x.key) || str(x.name))
    const lever: Lever = {
      id: `${focus}.x-${key}`,
      focus,
      name: str(x.name).slice(0, 80),
      kind: x.kind === 'once' ? 'once' : 'recurring',
      mechanism: str(x.mechanism).slice(0, 400),
      fitsWhen: strings(x.fitsWhen).slice(0, 5),
      notWhen: strings(x.notWhen).slice(0, 5),
      needs: { ...(strings(x.needs).length ? { anyOf: strings(x.needs).map((n) => n.toLowerCase()).slice(0, 5) } : {}) },
      humanMinutesPerWeek: typeof x.humanMinutesPerWeek === 'number' && x.humanMinutesPerWeek >= 0 ? Math.round(x.humanMinutesPerWeek) : 20,
      firstResultDays: typeof x.firstResultDays === 'number' && x.firstResultDays >= 0 ? Math.round(x.firstResultDays) : 7,
      measureLink: str(x.measureLink).slice(0, 200),
      guardrails: strings(x.guardrails).slice(0, 5),
      template: str(x.template).slice(0, 800),
    }
    const text = [lever.name, lever.mechanism, ...lever.fitsWhen, ...lever.notWhen, lever.measureLink, ...lever.guardrails, lever.template].join(' ')
    if (!key || !lever.name || !lever.mechanism || !lever.measureLink || !lever.template || !lever.fitsWhen.length || UNSAFE_LEVER_TEXT.test(text)) continue
    if (!lever.guardrails.length) lever.guardrails = ['Nothing is posted, sent or published without the person\u2019s approval.']
    out.set(key, lever)
  }
  return out
}

export async function readGoalBrief(modelCall: ModelCall, goal: string, context: GoalContext): Promise<GoalBrief> {
  const focuses = activePlaybook().focuses.map((f) => `- ${f.id}: ${f.label} (${f.hint})`).join('\n')
  const raw = await callTool(modelCall, GOAL_BRIEF_PROMPT, `${contextText(context)}\n\nFocuses in the playbook:\n${focuses}\n\nThe goal, as the person said it:\n${goal}`, briefTool())
  const scope = raw.scope === 'partial' || raw.scope === 'out' ? raw.scope : 'in'
  // A focus the planner named becomes the workspace's own, unless one by
  // that name is already in use.
  let focus = focusOf(raw.focus)
  const named = focus === 'other' ? newFocusFrom(raw.newFocus) : undefined
  const existing = named && activePlaybook().focuses.find((f) => f.id === named.id || f.label.toLowerCase() === named.label.toLowerCase())
  if (existing) focus = existing.id
  else if (named) focus = named.id
  return {
    scope,
    scopeReason: str(raw.scopeReason),
    reading: str(raw.reading),
    focus,
    ...(named && !existing ? { newFocus: named } : {}),
    measure: str(raw.measure, 'unknown'),
    measureSource: str(raw.measureSource, 'none'),
    measureSourceConnected: raw.measureSourceConnected === true,
    qualifiers: strings(raw.qualifiers),
    ...(profileFrom(raw.profile) ? { profile: profileFrom(raw.profile) } : {}),
    audience: str(raw.audience, context.audience ?? ''),
    weeklyHours: typeof raw.weeklyHours === 'number' && raw.weeklyHours > 0 ? raw.weeklyHours : context.weeklyHours ?? 3,
    approvals: str(raw.approvals, 'nothing is posted, sent or published without approval'),
  }
}

function profileText(p: GoalProfile | undefined): string {
  if (!p) return ''
  return `\n- profile: ${p.metric}, ${p.direction}; constraints: ${p.constraints.join('; ') || 'none'}; timeframe: ${p.timeframe}; starting point: ${p.startingPoint}\n- bottleneck: ${p.bottleneck} (${p.bottleneckWhy})`
}

function briefText(brief: GoalBrief): string {
  return profileText(brief.profile).length ? `${briefTextCore(brief)}${profileText(brief.profile)}` : briefTextCore(brief)
}

function briefTextCore(brief: GoalBrief): string {
  return `Confirmed brief:\n- scope: ${brief.scope} (${brief.scopeReason})\n- reading: ${brief.reading}\n- focus: ${brief.focus}${brief.newFocus ? ` (${brief.newFocus.label}: ${brief.newFocus.hint}; new, not in the playbook yet)` : ''}\n- measure: ${brief.measure}\n- measure source: ${brief.measureSource} (${brief.measureSourceConnected ? 'connected' : 'not connected'})\n- qualifiers: ${brief.qualifiers.join('; ') || 'none'}\n- audience: ${brief.audience}\n- weekly review time: ${brief.weeklyHours} hours\n- approvals: ${brief.approvals}`
}

function parsePlan(raw: Record<string, unknown>, focus: string): Omit<GoalPlan, 'brief' | 'critique' | 'playbookVersion'> {
  const { levers } = activePlaybook()
  const KNOWN_LEVER_IDS = new Set(levers.map((l) => l.id))
  const written = newLeversFrom(raw.newLevers, focus)
  const workflows = (Array.isArray(raw.workflows) ? raw.workflows : []).flatMap((w): PlannedGoalWorkflow[] => {
    if (!w || typeof w !== 'object') return []
    const x = w as Record<string, unknown>
    const title = str(x.title)
    const request = str(x.request)
    if (!title || !request) return []
    // Some models put the playbook id in lever and leave leverId empty. A
    // key of one of the plan's own levers means that lever.
    const own = written.get(slug(str(x.leverId))) ?? written.get(slug(str(x.lever)))
    const leverId = own?.id || str(x.leverId) && KNOWN_LEVER_IDS.has(str(x.leverId)) && str(x.leverId) || (KNOWN_LEVER_IDS.has(str(x.lever)) ? str(x.lever) : '')
    const na = x.newAgent && typeof x.newAgent === 'object' ? (x.newAgent as Record<string, unknown>) : undefined
    const newAgentName = na ? agentName(str(na.name) || str(x.agent)) : ''
    const needs = (Array.isArray(x.needs) ? x.needs : []).flatMap((n): GoalNeed[] => {
      if (!n || typeof n !== 'object') return []
      const y = n as Record<string, unknown>
      return str(y.name) || str(y.kind) ? [{ name: str(y.name, str(y.kind)), kind: str(y.kind, str(y.name)).toLowerCase(), connected: y.connected === true }] : []
    })
    return [{
      title,
      kind: x.kind === 'once' ? 'once' : 'recurring',
      measure: str(x.measure),
      ...(leverId ? { leverId } : {}),
      // An empty label falls back to the playbook lever's name, else the title.
      lever: (leverId && (str(x.lever) === leverId || !str(x.lever)) ? levers.find((l) => l.id === leverId)?.name : str(x.lever)) || title,
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
  // The plan's own levers that a workflow is made from: the ones to keep.
  const used = [...written.values()].filter((l) => workflows.some((w) => w.leverId === l.id))
  // How it chose: each lever it looked at, named for people.
  const considered = (Array.isArray(raw.considered) ? raw.considered : []).flatMap((c): LeverChoice[] => {
    const x = c && typeof c === 'object' ? (c as Record<string, unknown>) : {}
    const ref = str(x.lever)
    const own = written.get(slug(ref))
    const known = levers.find((l) => l.id === ref)
    const name = own?.name ?? known?.name ?? ref
    if (!name || !str(x.reason)) return []
    return [{ ...(own || known ? { leverId: (own ?? known)!.id } : {}), lever: name, decision: x.decision === 'ruled_out' ? 'ruled_out' : 'chosen', reason: str(x.reason).slice(0, 300) }]
  }).slice(0, 20)
  return { setup: strings(raw.setup), workflows, leftOut: strings(raw.leftOut), assumptions: strings(raw.assumptions), message: str(raw.message), ...(used.length ? { newLevers: used } : {}), ...(considered.length ? { considered } : {}) }
}

export async function draftGoalPlan(modelCall: ModelCall, input: GoalPipelineInput, brief: GoalBrief, issues: string[] = []): Promise<Omit<GoalPlan, 'brief' | 'critique' | 'playbookVersion'>> {
  const user = [
    contextText(input.context),
    briefText(brief),
    leversText(brief.focus, input.saved),
    savedText(input.saved),
    `The goal, as the person said it:\n${input.goal}`,
    issues.length ? `A check found these issues in your last plan; fix every one:\n${issues.map((i) => `- ${i}`).join('\n')}` : '',
  ].filter(Boolean).join('\n\n')
  return parsePlan(await callTool(modelCall, GOAL_PLAN_PROMPT, user, planTool()), brief.focus)
}

export async function critiqueGoalPlan(modelCall: ModelCall, input: GoalPipelineInput, brief: GoalBrief, plan: Omit<GoalPlan, 'brief' | 'critique' | 'playbookVersion'>): Promise<{ passed: boolean; issues: string[] }> {
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
  return { brief, ...plan, critique: { ...review, revised }, playbookVersion: activePlaybook().version }
}
