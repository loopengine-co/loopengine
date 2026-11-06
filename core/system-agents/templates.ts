// Templates: what creating a workflow as a new agent is made of
// (web/templates-admin.ts applies one): instructions, abilities, apps,
// skills, permission rules, settings, and a paused schedule. A workflow
// plan becomes one (workflowTemplate in ./workflow-planner.ts).
//
// The ready-made templates people picked from are now workflow examples
// (./workflow-examples.ts); STARTER_TEMPLATES below only serves a project
// server from an older template.
import type { AgentCandidate } from './interviewer.js'
import type { WorkflowParameter } from '../workflows.js'
import { nextTimeOfDay, parseTimeOfDay, workspaceTimeZone } from '../time-zone.js'
import { WORKFLOW_EXAMPLES } from './workflow-examples.js'
import { workflowTemplate } from './workflow-planner.js'

export interface TemplateRule {
  name: string
  tool: string
  decision: 'allow' | 'ask' | 'deny'
}

export interface TemplateSkill {
  /** Folder name under agents/<name>/skills/: lowercase-hyphenated. */
  id: string
  description: string
  body: string
  /** Makes it a workflow, with `body` as its instructions. `webhook`: its
   * checklist says to add a webhook that sends each result (the URL and
   * the sender's signing secret are set up with the sender). */
  workflow?: { title: string; parameters?: Record<string, WorkflowParameter>; webhook?: boolean }
}

export interface TemplateSchedule {
  /** How often, in the scheduler's terms: "10m", "1h", "7d". */
  every: string
  /** Optional first run, as a time of day in the workspace's time zone
   * ("09:00"), and for weekly schedules a weekday (1 = Monday). Without
   * it, the first run is one interval after the schedule is turned on. */
  at?: string
  weekday?: number
  name: string
  /** What the agent receives on each run. */
  message: string
  /** Set when the template comes from a workflow: the schedule runs that
   * workflow (its start message at run time) rather than `message`. */
  workflowId?: string
  /** Send each run's result through the agent's notifier. */
  notify?: boolean
}

/** An app (core/mcp-apps.ts) a template works through, and the server
 * tools it relies on: switched on when the agent is created, if the app is
 * connected; otherwise connecting it heads the checklist. */
export interface TemplateApp {
  /** Its MCP Registry name, as in the Apps catalog. */
  id: string
  title: string
  tools: string[]
}

export interface TemplateSetup {
  /** npm names of the abilities to install. */
  abilities: string[]
  /** Apps it uses (connected on the Apps page). */
  apps?: TemplateApp[]
  /** Keys the agent needs before it can work, from its abilities' declared
   * settings: a name, or a list where any one of them will do. */
  keys: (string | string[])[]
  /** Non-secret settings filled in for this agent. */
  env?: Record<string, string>
  skills?: TemplateSkill[]
  rules: TemplateRule[]
  schedule?: TemplateSchedule
  /** Whether a person must be reachable for approvals (the Messaging tab). */
  needsApprovals: boolean
  /** Extra setup steps, in plain words, for the checklist. */
  notes?: string[]
}

export interface StarterTemplate {
  /** Stable id, used in URLs: lowercase-hyphenated. */
  id: string
  /** Groups templates on the page: "Customer service", "Operations"… */
  category: string
  candidate: AgentCandidate
  setup: TemplateSetup
}

/** @deprecated Templates are now workflow examples
 * (./workflow-examples.ts). Kept for a project server from an older
 * template, whose Templates page still lists these: each example as the
 * template it creates as a new agent. */
export const STARTER_TEMPLATES: readonly StarterTemplate[] = WORKFLOW_EXAMPLES.map(({ id, category, plan }) => {
  const template = workflowTemplate(plan)
  const [own, ...rest] = template.setup.skills ?? []
  return {
    ...template,
    id,
    category,
    setup: {
      ...template.setup,
      // Its own skill is the workflow its schedule runs.
      skills: [{ ...own!, workflow: { title: plan.name, ...(Object.keys(plan.parameters).length ? { parameters: plan.parameters } : {}) } }, ...rest],
    },
  }
})

export function starterTemplate(id: string): StarterTemplate | undefined {
  return STARTER_TEMPLATES.find((t) => t.id === id)
}

/** The first run of a template's schedule: its time of day (and weekday)
 * next, in the workspace's time zone; undefined when it has none. */
export function templateScheduleStart(schedule: TemplateSchedule, nowMs = Date.now(), timeZone = workspaceTimeZone()): string | undefined {
  const at = schedule.at ? parseTimeOfDay(schedule.at) : undefined
  if (!at) return undefined
  return new Date(nextTimeOfDay(at, nowMs, timeZone, schedule.weekday)).toISOString()
}
