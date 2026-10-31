// Backs the console's "Find your first agent": saving interviews in the
// project (.interviews/<id>.json, next to .sessions), running each turn
// through the interviewer (core/system-agents/interviewer.ts), and
// turning a chosen candidate into a real agent — the same pieces a
// person would set up by hand: the agent itself (through the adapter's
// own create, passed in), its permission default switched to "ask", and
// a paused schedule when it runs on a timer. Abilities aren't installed
// here: installing one restarts the server, so they head the Finish
// setup checklist instead, each one click away.
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Message, ModelCall } from '../core/run-agent.js'
import { createScheduledTask, pauseScheduledTask } from '../core/scheduler.js'
import { KeyedMutex } from '../core/session-store.js'
import {
  INTERVIEW_OPENING,
  agentNameFrom,
  runInterviewTurn,
  type AgentCandidate,
  type InterviewStage,
  type InterviewTools,
} from '../core/system-agents/interviewer.js'
import type { AgentConfig } from '../core/agent-config.js'
import { describeNotifier } from '../core/http-notifier.js'
import { listInstalledAbilities } from '../bin/ability-manager.js'
import { searchPublicAbilities } from './abilities-admin.js'
import { setDefaultDecision } from './actauth-admin.js'
import { modelKeyEnvVar } from './global-config.js'

export class InterviewError extends Error {}

export interface Interview {
  id: string
  startedAt: string
  updatedAt: string
  stage: InterviewStage
  /** What the person sees: their answers and the interviewer's replies. */
  display: { role: 'user' | 'assistant'; text: string }[]
  /** What the model sees, tool calls included. */
  transcript: Message[]
  candidates: AgentCandidate[]
  /** Candidate index -> the agent created from it. */
  created: Record<string, string>
}

// The project the interviews are saved in. The adapter sets it from its
// own registry's projectDir() (a create-loopengine project's registry is
// the project's own file, not this package's); the working directory
// until then.
let interviewProject = process.cwd()

export function setInterviewProject(projectDir: string): void {
  interviewProject = projectDir
}

function dir(): string {
  return join(interviewProject, '.interviews')
}

function pathFor(id: string): string {
  if (!/^[a-f0-9-]{8,40}$/.test(id)) throw new InterviewError('No such interview')
  return join(dir(), `${id}.json`)
}

function save(interview: Interview): Interview {
  mkdirSync(dir(), { recursive: true })
  interview.updatedAt = new Date().toISOString()
  writeFileSync(pathFor(interview.id), JSON.stringify(interview, null, 2))
  return interview
}

export function getInterview(id: string): Interview {
  const path = pathFor(id)
  if (!existsSync(path)) throw new InterviewError('No such interview')
  return JSON.parse(readFileSync(path, 'utf8')) as Interview
}

/** Newest first, without the transcripts. */
export function listInterviews(): Omit<Interview, 'transcript' | 'display'>[] {
  if (!existsSync(dir())) return []
  return readdirSync(dir())
    .filter((f) => f.endsWith('.json'))
    .flatMap((f) => {
      try {
        const { transcript: _t, display: _d, ...rest } = JSON.parse(readFileSync(join(dir(), f), 'utf8')) as Interview
        return [rest]
      } catch {
        return []
      }
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export function startInterview(): Interview {
  const now = new Date().toISOString()
  return save({ id: randomUUID(), startedAt: now, updatedAt: now, stage: 'work', display: [{ role: 'assistant', text: INTERVIEW_OPENING }], transcript: [], candidates: [], created: {} })
}

export function deleteInterview(id: string): void {
  rmSync(pathFor(id), { force: true })
}

const locks = new KeyedMutex()

async function turn(id: string, userText: string, shown: string | undefined, modelCall: ModelCall, tools: InterviewTools): Promise<Interview> {
  return locks.run(id, async () => {
    const interview = getInterview(id)
    const result = await runInterviewTurn(modelCall, interview.transcript, userText, tools)
    if (shown !== undefined) interview.display.push({ role: 'user', text: shown })
    interview.display.push({ role: 'assistant', text: result.reply })
    interview.transcript.push(...result.newMessages)
    if (result.stage) interview.stage = result.stage
    if (result.candidates) {
      interview.candidates = result.candidates
      interview.stage = 'done'
    }
    return save(interview)
  })
}

/** The person's answer, and the interviewer's reply. */
export async function answerInterview(id: string, text: unknown, modelCall: ModelCall, tools: InterviewTools): Promise<Interview> {
  if (typeof text !== 'string' || !text.trim()) throw new InterviewError('Write an answer first')
  if (text.length > 4000) throw new InterviewError('That answer is too long; keep it under 4,000 characters')
  return turn(id, text.trim(), text.trim(), modelCall, tools)
}

/** Ends early: the interviewer ranks what it has. */
export async function finishInterview(id: string, modelCall: ModelCall, tools: InterviewTools): Promise<Interview> {
  return turn(id, '[The person chose to finish now. Rank what you have so far: call save_candidates with up to three, then set_stage("done"), then tell them briefly.]', undefined, modelCall, tools)
}

export interface ChecklistItem {
  label: string
  /** A console page or tab where it's done. */
  href?: string
}

function candidateAt(interview: Interview, index: number): AgentCandidate {
  const candidate = interview.candidates[index]
  if (!candidate) throw new InterviewError('No such candidate')
  return candidate
}

/** The first free agent name based on the candidate's. */
export function freeAgentName(base: string, exists: (name: string) => boolean): string {
  const name = agentNameFrom(base)
  if (!exists(name)) return name
  for (let n = 2; n < 100; n++) if (!exists(`${name}-${n}`)) return `${name}-${n}`
  return `${name}-${Date.now()}`
}

export interface CreateDeps {
  agentExists(name: string): boolean
  /** Scaffolds and registers the agent, as Agents → + New does. */
  createAgent(name: string, systemPrompt: string): Promise<void>
}

export interface CandidatePreview {
  name: string
  systemPrompt: string
  /** What the permission default will be, and why. */
  permissions: string
  schedule?: string
  checklist: ChecklistItem[]
}

/** What's still needed once the agent exists, each linked to where it's done. */
export function setupChecklist(candidate: AgentCandidate, agentName: string): ChecklistItem[] {
  const tab = (t: string) => `/agents/config?agent=${encodeURIComponent(agentName)}&tab=${t}`
  const items: ChecklistItem[] = candidate.needs.map((need) => {
    switch (need.kind) {
      case 'ability':
        return { label: `Install the ${need.name ?? need.description} ability`, href: tab('abilities') }
      case 'api':
        return { label: `Connect ${need.description} (an HTTP tool, or an MCP server)`, href: tab('tools') }
      case 'key':
        return { label: `Add ${need.description}`, href: tab('env') }
      case 'messaging':
        return { label: `Connect ${need.name ?? 'Slack'} so it can ask you before acting`, href: tab('messaging') }
      default:
        return { label: need.description }
    }
  })
  if (candidate.trigger.kind === 'schedule') items.push({ label: `Check when it runs (${candidate.trigger.description}), then turn its schedule on`, href: tab('schedules') })
  return items
}

export function previewCandidate(id: string, index: number, deps: Pick<CreateDeps, 'agentExists'>): CandidatePreview {
  return describeCandidate(candidateAt(getInterview(id), index), deps)
}

/** What creating `candidate` would make, under the first free name.
 * Shared with templates (web/templates-admin.ts). */
export function describeCandidate(candidate: AgentCandidate, deps: Pick<CreateDeps, 'agentExists'>): CandidatePreview {
  const name = freeAgentName(candidate.agent.name, deps.agentExists)
  return {
    name,
    systemPrompt: candidate.agent.systemPrompt,
    permissions: `Every tool asks you first until you change it${candidate.asksFirst.length ? `, including ${candidate.asksFirst.join(', ')}` : ''}.`,
    ...(candidate.trigger.kind === 'schedule' ? { schedule: `${candidate.trigger.description} (created paused)` } : {}),
    checklist: setupChecklist(candidate, name),
  }
}

export interface CreatedAgent {
  name: string
  checklist: ChecklistItem[]
  exampleMessage?: string
  /** Set when the schedule couldn't be created; the agent still was. */
  scheduleError?: string
}

/** Creates the agent: unmatched tools ask (a new agent's default is to
 * deny), and a schedule, if any, is created paused until setup is done. */
export async function createFromCandidate(id: string, index: number, deps: CreateDeps): Promise<CreatedAgent> {
  return locks.run(id, async () => {
    const interview = getInterview(id)
    const candidate = candidateAt(interview, index)
    if (interview.created[String(index)] && deps.agentExists(interview.created[String(index)])) {
      throw new InterviewError(`Already created as ${interview.created[String(index)]}`)
    }
    const created = await createAgentFromCandidate(candidate, deps)
    interview.created[String(index)] = created.name
    save(interview)
    return created
  })
}

/** Creates `candidate` as an agent under the first free name: the agent
 * itself, its permission default switched to "ask", and a paused
 * schedule when it runs on a timer. Shared with templates
 * (web/templates-admin.ts). */
export async function createAgentFromCandidate(candidate: AgentCandidate, deps: CreateDeps): Promise<CreatedAgent> {
  const name = freeAgentName(candidate.agent.name, deps.agentExists)
  await deps.createAgent(name, candidate.agent.systemPrompt)
  setDefaultDecision(name, 'ask')
  let scheduleError: string | undefined
  if (candidate.trigger.kind === 'schedule') {
    try {
      const task = await createScheduledTask({
        agent: name,
        message: candidate.agent.scheduleMessage ?? candidate.summary,
        schedule: { every: candidate.trigger.every ?? '1d' },
        task_name: candidate.title,
      })
      await pauseScheduledTask(task.task_id)
    } catch (err) {
      scheduleError = err instanceof Error ? err.message : String(err)
    }
  }
  return { name, checklist: setupChecklist(candidate, name), ...(candidate.agent.exampleMessage ? { exampleMessage: candidate.agent.exampleMessage } : {}), ...(scheduleError ? { scheduleError } : {}) }
}

/** A registered agent, as the adapter's registry has it. */
export interface InterviewAgentSource {
  name: string
  config: AgentConfig
  createModelCall: () => ModelCall
}

export interface InterviewModel {
  modelCall: ModelCall
  /** For the agents it creates: the same provider and model. */
  model: { provider: string; model?: string }
}

/** The interviewer runs on the workspace's own model: borrowed from an
 * agent that has one set, preferring one whose provider key is set.
 * undefined when no agent names a model. */
export function pickInterviewModel(agents: InterviewAgentSource[]): InterviewModel | undefined {
  const chosen = pickModelAgent(agents)
  if (!chosen) return undefined
  return { modelCall: chosen.agent.createModelCall(), model: chosen.model }
}

/** The model a new agent should start on: the same one the interviewer
 * would pick, without building a model call (which throws when its key
 * isn't set). Templates use it. */
export function pickAgentModel(agents: InterviewAgentSource[]): InterviewModel['model'] | undefined {
  return pickModelAgent(agents)?.model
}

function pickModelAgent(agents: InterviewAgentSource[]): { agent: InterviewAgentSource; model: InterviewModel['model'] } | undefined {
  const withModel = agents.filter((a) => a.config.model && typeof a.config.model === 'object' && 'provider' in a.config.model)
  const keyed = withModel.find((a) => {
    const envVar = modelKeyEnvVar((a.config.model as { provider: string }).provider)
    return envVar ? Boolean(process.env[envVar]) : false
  })
  const chosen = keyed ?? withModel[0]
  if (!chosen) return undefined
  const m = chosen.config.model as { provider: string; model?: string }
  return { agent: chosen, model: { provider: m.provider, ...(m.model ? { model: m.model } : {}) } }
}

/** The interviewer's read-only tools over this workspace. */
export function interviewTools(agents: InterviewAgentSource[]): InterviewTools {
  return {
    async listInstalledAbilities() {
      return agents.flatMap((a) => {
        try {
          return listInstalledAbilities(a.name).map((ability) => ({ agent: a.name, name: ability.name }))
        } catch {
          return []
        }
      })
    },
    async searchPublicAbilities(query) {
      const results = await searchPublicAbilities(query)
      return results.slice(0, 10).map((r) => ({ name: r.name, ...(r.description ? { description: r.description } : {}) }))
    },
    async listConnections() {
      const providers = ['openai', 'anthropic', 'gemini', 'meta', 'xai', 'deepseek', 'kimi', 'glm'].filter((p) => {
        const envVar = modelKeyEnvVar(p)
        return envVar ? Boolean(process.env[envVar]) : false
      })
      const messaging = agents.flatMap((a) => {
        try {
          const n = describeNotifier(a.config)
          return n.source === 'none' ? [] : [{ agent: a.name, app: n.channel }]
        } catch {
          return []
        }
      })
      return { modelProvidersWithKey: providers, messaging, agents: agents.map((a) => a.name) }
    },
  }
}
