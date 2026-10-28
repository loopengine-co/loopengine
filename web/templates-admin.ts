// Backs the console's Templates page (/templates): the ready-made agents
// in core/system-agents/templates.ts, previewed and created with their
// whole setup in one go — instructions, permission rules, abilities,
// skills, settings and a paused schedule — before the agent first loads,
// so nothing needs a restart. What only the person can do (their keys,
// where approvals go, turning the schedule on) becomes the checklist.
//
// Every agent made from a template asks before anything not covered by a
// rule. Its template's rules are written before its abilities' own, so
// they take precedence where both name the same tool.
import { createScheduledTask, pauseScheduledTask } from '../core/scheduler.js'
import { workspaceTimeZone } from '../core/time-zone.js'
import { STARTER_TEMPLATES, starterTemplate, templateScheduleStart, type StarterTemplate, type TemplateSchedule } from '../core/system-agents/templates.js'
import { ActauthRuleExistsError, addActauthRule, setDefaultDecision } from './actauth-admin.js'
import { setAgentEnvVar } from './env-admin.js'
import { freeAgentName } from './interview-admin.js'
import { writeSkill } from './skills-admin.js'

export class TemplateError extends Error {}

export interface TemplateCreateDeps {
  agentExists(name: string): boolean
  /** Writes agents/<name>/index.ts, as Agents → + New does, without loading it. */
  scaffoldAgent(name: string, systemPrompt: string): Promise<void>
  /** Loads the finished agent into the running server. */
  registerAgent(name: string): Promise<void>
  /** Installs an ability (an npm spec) into the agent. Absent where
   * installing isn't allowed (no admin login): the abilities then head the
   * checklist instead. */
  installAbility?: (name: string, spec: string) => Promise<void>
  /** A setting as the agent sees it (its own, else the shared one). */
  envValue(name: string, variable: string): string | undefined
  /** Whether approval requests from the agent reach anyone. */
  messagingConfigured(name: string): boolean
}

/** What a project's adapters/http.ts from before full template setups
 * (create-loopengine 0.1.74) passes: one call that writes and loads the
 * agent. Still accepted, so upgrading loopengine alone doesn't break the
 * Templates page; it just can't install abilities before the agent loads. */
export interface LegacyTemplateCreateDeps {
  agentExists(name: string): boolean
  createAgent(name: string, systemPrompt: string): Promise<void>
}

export interface TemplateChecklistItem {
  label: string
  href?: string
}

/** A template as the page's cards show it. */
export interface TemplateSummary {
  id: string
  category: string
  title: string
  summary: string
  trigger: string
  asksFirst: string[]
  abilities: string[]
  schedule: string | null
}

export interface TemplatePreview {
  name: string
  systemPrompt: string
  abilities: string[]
  skills: string[]
  rules: { tool: string; decision: string }[]
  keys: { names: string[]; set: boolean }[]
  settings: Record<string, string>
  schedule: string | null
  needsApprovals: boolean
  notes: string[]
}

export interface CreatedTemplateAgent {
  name: string
  abilities: { installed: string[]; failed: { name: string; error: string }[] }
  checklist: TemplateChecklistItem[]
  exampleMessage?: string
  schedule?: { description: string; timeZone?: string; next_run_at?: string }
  /** Set when the schedule couldn't be created; the agent still was. */
  scheduleError?: string
  /** Set when the agent was written but couldn't be loaded. */
  loadError?: string
}

/** A failed install, in a line the checklist can show: npm's own output
 * runs to many lines of command and log paths. */
export function installFailureReason(err: unknown): string {
  const text = err instanceof Error ? err.message : String(err)
  if (/E404|404 Not Found|is not in this registry/i.test(text)) return "it isn't published on npm yet"
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN/.test(text)) return 'npm could not be reached; try again from the Abilities tab'
  const line = text.split('\n').map((l) => l.trim()).find((l) => l && !/^Command failed:/.test(l)) ?? text.split('\n')[0]
  return line.length > 200 ? `${line.slice(0, 200)}…` : line
}

function templateAt(id: string): StarterTemplate {
  const template = starterTemplate(id)
  if (!template) throw new TemplateError('No such template')
  return template
}

const UNITS: Record<string, [string, string]> = { s: ['second', 'seconds'], m: ['minute', 'minutes'], h: ['hour', 'hours'], d: ['day', 'days'] }
const WEEKDAYS = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays']

export function describeTemplateSchedule(schedule: TemplateSchedule): string {
  if (schedule.at && schedule.weekday !== undefined && schedule.every === '7d') return `${WEEKDAYS[schedule.weekday]} at ${schedule.at}`
  if (schedule.at && schedule.every === '1d') return `daily at ${schedule.at}`
  const match = /^(\d+)([smhd])$/.exec(schedule.every)
  if (!match) return `every ${schedule.every}`
  const n = Number(match[1])
  const [one, many] = UNITS[match[2]]
  return `every ${n === 1 ? one : `${n} ${many}`}${schedule.at ? `, from ${schedule.at}` : ''}`
}

export function listTemplates(): TemplateSummary[] {
  return STARTER_TEMPLATES.map(({ id, category, candidate: c, setup }) => ({
    id,
    category,
    title: c.title,
    summary: c.summary,
    trigger: setup.schedule ? describeTemplateSchedule(setup.schedule) : c.trigger.description,
    asksFirst: c.asksFirst,
    abilities: setup.abilities,
    schedule: setup.schedule ? describeTemplateSchedule(setup.schedule) : null,
  }))
}

function keyGroups(template: StarterTemplate): string[][] {
  return template.setup.keys.map((k) => (Array.isArray(k) ? k : [k]))
}

export function previewTemplate(id: string, deps: Pick<TemplateCreateDeps, 'agentExists'> & Partial<Pick<TemplateCreateDeps, 'envValue'>>): TemplatePreview {
  const template = templateAt(id)
  const name = freeAgentName(template.candidate.agent.name, deps.agentExists)
  const envValue = deps.envValue ?? (() => undefined)
  const { setup } = template
  return {
    name,
    systemPrompt: template.candidate.agent.systemPrompt,
    abilities: setup.abilities,
    skills: (setup.skills ?? []).map((s) => s.id),
    rules: setup.rules.map((r) => ({ tool: r.tool, decision: r.decision })),
    // A key set for the whole project already counts for a new agent.
    keys: keyGroups(template).map((names) => ({ names, set: names.some((n) => Boolean(envValue(name, n))) })),
    settings: setup.env ?? {},
    schedule: setup.schedule ? `${describeTemplateSchedule(setup.schedule)} (created paused)` : null,
    needsApprovals: setup.needsApprovals,
    notes: setup.notes ?? [],
  }
}

/** What's left once the agent exists, each linked to where it's done. */
export function templateChecklist(template: StarterTemplate, name: string, deps: Pick<TemplateCreateDeps, 'envValue' | 'messagingConfigured'>, failed: { name: string; error: string }[] = []): TemplateChecklistItem[] {
  const tab = (t: string) => `/agents/config?agent=${encodeURIComponent(name)}&tab=${t}`
  const items: TemplateChecklistItem[] = []
  for (const f of failed) items.push({ label: `Install the ${f.name} ability (it couldn't be installed: ${f.error})`, href: tab('abilities') })

  const missing = keyGroups(template).filter((names) => !names.some((n) => deps.envValue(name, n)))
  const single = missing.filter((g) => g.length === 1).map((g) => g[0])
  if (single.length) items.push({ label: `Add ${single.length === 1 ? 'its key' : 'its keys'}: ${single.join(', ')}`, href: tab('env') })
  for (const group of missing.filter((g) => g.length > 1)) {
    items.push({ label: `Add one of ${group.slice(0, -1).join(', ')} or ${group.at(-1)}`, href: tab('env') })
  }

  if (template.setup.needsApprovals && !deps.messagingConfigured(name)) {
    items.push({ label: 'Choose where approval requests go: Slack, email, Lark or a webhook', href: tab('messaging') })
  }
  for (const note of template.setup.notes ?? []) items.push({ label: note })
  if (template.setup.schedule) {
    items.push({ label: `Turn on its schedule (${describeTemplateSchedule(template.setup.schedule)}) once it works in Chat`, href: tab('schedules') })
  }
  return items
}

/** Creates a new agent from the template, with its whole setup, under the
 * first free name, so the same template can be used more than once. */
export async function createFromTemplate(id: string, deps: TemplateCreateDeps | LegacyTemplateCreateDeps): Promise<CreatedTemplateAgent> {
  if (!('scaffoldAgent' in deps)) return createFromTemplateLegacy(id, deps)
  const template = templateAt(id)
  const { candidate, setup } = template
  const name = freeAgentName(candidate.agent.name, deps.agentExists)

  // 1. The agent, and its permissions: everything asks unless a rule says
  //    otherwise, and the template's rules come first.
  await deps.scaffoldAgent(name, candidate.agent.systemPrompt)
  setDefaultDecision(name, 'ask')
  for (const rule of setup.rules) {
    try {
      addActauthRule(name, { name: rule.name, scope: '*/*', tool: rule.tool, decision: rule.decision })
    } catch (err) {
      if (!(err instanceof ActauthRuleExistsError)) throw err
    }
  }

  // 2. Abilities: their tools, skills and rules. One failing doesn't stop
  //    the rest; it heads the checklist.
  const installed: string[] = []
  const failed: { name: string; error: string }[] = []
  for (const spec of setup.abilities) {
    if (!deps.installAbility) {
      failed.push({ name: spec, error: 'installing abilities needs LOOPENGINE_ADMIN_AUTH set on the server' })
      continue
    }
    try {
      await deps.installAbility(name, spec)
      installed.push(spec)
    } catch (err) {
      failed.push({ name: spec, error: installFailureReason(err) })
    }
  }

  // 3. Its own skills and non-secret settings.
  for (const skill of setup.skills ?? []) writeSkill(name, skill.id, { description: skill.description, body: skill.body })
  for (const [variable, value] of Object.entries(setup.env ?? {})) await setAgentEnvVar(name, variable, value)

  // 4. Load it, now that everything is in place.
  let loadError: string | undefined
  try {
    await deps.registerAgent(name)
  } catch (err) {
    loadError = err instanceof Error ? err.message : String(err)
  }

  // 5. Its schedule, paused until the person turns it on.
  let schedule: CreatedTemplateAgent['schedule']
  let scheduleError: string | undefined
  if (setup.schedule) {
    try {
      const startAt = templateScheduleStart(setup.schedule)
      const task = await createScheduledTask({
        agent: name,
        message: setup.schedule.message,
        schedule: { every: setup.schedule.every, ...(startAt ? { start_at: startAt } : {}) },
        task_name: setup.schedule.name,
      })
      await pauseScheduledTask(task.task_id)
      schedule = { description: describeTemplateSchedule(setup.schedule), timeZone: workspaceTimeZone(), ...(startAt ? { next_run_at: startAt } : {}) }
    } catch (err) {
      scheduleError = err instanceof Error ? err.message : String(err)
    }
  }

  return {
    name,
    abilities: { installed, failed },
    checklist: templateChecklist(template, name, deps, failed),
    ...(candidate.agent.exampleMessage ? { exampleMessage: candidate.agent.exampleMessage } : {}),
    ...(schedule ? { schedule } : {}),
    ...(scheduleError ? { scheduleError } : {}),
    ...(loadError ? { loadError } : {}),
  }
}

/** An older project adapter's create: the agent with its instructions,
 * permissions and paused schedule, as before; its abilities head the
 * checklist with how to get them installed automatically. */
async function createFromTemplateLegacy(id: string, deps: LegacyTemplateCreateDeps): Promise<CreatedTemplateAgent> {
  const template = templateAt(id)
  const { candidate, setup } = template
  const name = freeAgentName(candidate.agent.name, deps.agentExists)
  await deps.createAgent(name, candidate.agent.systemPrompt)
  setDefaultDecision(name, 'ask')
  for (const rule of setup.rules) {
    try {
      addActauthRule(name, { name: rule.name, scope: '*/*', tool: rule.tool, decision: rule.decision })
    } catch (err) {
      if (!(err instanceof ActauthRuleExistsError)) throw err
    }
  }
  const failed = setup.abilities.map((spec) => ({ name: spec, error: "this project's server is from an older LoopEngine template; update it from Settings → Upgrade to have templates install abilities" }))
  let schedule: CreatedTemplateAgent['schedule']
  let scheduleError: string | undefined
  if (setup.schedule) {
    try {
      const startAt = templateScheduleStart(setup.schedule)
      const task = await createScheduledTask({ agent: name, message: setup.schedule.message, schedule: { every: setup.schedule.every, ...(startAt ? { start_at: startAt } : {}) }, task_name: setup.schedule.name })
      await pauseScheduledTask(task.task_id)
      schedule = { description: describeTemplateSchedule(setup.schedule), timeZone: workspaceTimeZone(), ...(startAt ? { next_run_at: startAt } : {}) }
    } catch (err) {
      scheduleError = err instanceof Error ? err.message : String(err)
    }
  }
  return {
    name,
    abilities: { installed: [], failed },
    checklist: templateChecklist(template, name, { envValue: () => undefined, messagingConfigured: () => false }, failed),
    ...(candidate.agent.exampleMessage ? { exampleMessage: candidate.agent.exampleMessage } : {}),
    ...(schedule ? { schedule } : {}),
    ...(scheduleError ? { scheduleError } : {}),
  }
}
