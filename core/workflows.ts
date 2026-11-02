// An agent's workflows: jobs it does, each a skill (its steps), a trigger
// (a schedule, or a message) and checkpoints (questions, and tools set to
// "ask"). Recorded in agents/<name>/workflows.yml when one is added from
// "Describe a workflow", so the agent's Overview can list them; the skill,
// the schedule and the rules themselves live where they always do.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'
import type { WorkflowStep } from './system-agents/workflow-planner.js'

export interface WorkflowRecord {
  /** lowercase-hyphenated; also its skill's folder name. */
  id: string
  name: string
  summary: string
  trigger: { kind: 'schedule' | 'on_request'; description: string }
  steps: WorkflowStep[]
  /** The message each run starts with. */
  startMessage: string
  /** Its schedule's name, when it has one (the Schedules tab's task_name). */
  scheduleName?: string
  /** What the person wrote, kept for reference. */
  description?: string
  createdAt: string
}

export function workflowsPath(agentDir: string): string {
  return join(agentDir, 'workflows.yml')
}

/** The agent's workflows; none when it has no workflows.yml or it can't be read. */
export function readWorkflows(agentDir: string): WorkflowRecord[] {
  const path = workflowsPath(agentDir)
  if (!existsSync(path)) return []
  try {
    const parsed = parseYaml(readFileSync(path, 'utf8')) as { workflows?: unknown } | null
    return Array.isArray(parsed?.workflows) ? (parsed!.workflows as WorkflowRecord[]).filter((w) => w && typeof w.id === 'string' && typeof w.name === 'string') : []
  } catch {
    return []
  }
}

/** Adds a workflow, replacing one with the same id. */
export function saveWorkflow(agentDir: string, workflow: WorkflowRecord): void {
  const workflows = readWorkflows(agentDir).filter((w) => w.id !== workflow.id)
  workflows.push(workflow)
  const header = "# This agent's workflows, added from the console's \"Describe a workflow\". Each one's\n# steps are its skill (skills/<id>/SKILL.md); its schedule and rules are in the Schedules and Permissions tabs.\n"
  writeFileSync(workflowsPath(agentDir), header + stringifyYaml({ workflows }))
}

/** Forgets a workflow. Its skill, schedule and rules are left as they are. */
export function removeWorkflow(agentDir: string, id: string): void {
  const workflows = readWorkflows(agentDir)
  if (!workflows.some((w) => w.id === id)) return
  const rest = workflows.filter((w) => w.id !== id)
  writeFileSync(workflowsPath(agentDir), stringifyYaml({ workflows: rest }))
}
