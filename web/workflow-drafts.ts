// A workflow's draft: changes to what its runs do, saved but not yet live.
// Runs keep using the published workflow until the draft is published,
// which applies it all, numbers it as the workflow's next version
// (core/audit-store.ts) with the person's note, and removes the draft.
//
// Drafted: the instructions, inputs, result format, output schema and
// model (the editor); the success criteria; where messages go; and
// adding, changing or removing a schedule or a webhook. Not drafted, as
// they don't change what a run does: the name and description, saved
// straight away; and operations: pausing or resuming a schedule, turning a
// webhook on or off, a new URL, its signing secret, and Run now.
//
// A webhook added in a draft is made at once, so its URL can be set up in
// the sending app, but marked `draft`: its calls are answered and not run
// until the draft is published (discarding the draft deletes it).
//
// Before publishing, the person sees what it changes, field by field
// (web/change-log.ts's describeChanges), and the version it will be.
// One draft per workflow, kept in the project at
// .loopengine/workflow-drafts/<agent>/<workflow>.json.
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describeChanges, type FieldChange } from './change-log.js'
import { inputSchemaOf } from '../core/input-schema.js'
import type { Workflow, WorkflowDelivery, WorkflowFields } from '../core/workflows.js'

/** A schedule added in the draft, created when it's published. */
export interface DraftSchedule {
  /** "d-…", to refer to it before it exists. */
  id: string
  task_name?: string
  /** As given ({ every, at } or { run_at }), checked when added. */
  schedule: Record<string, unknown>
  params?: Record<string, string>
  notify?: boolean
}

export interface WorkflowDraft {
  /** The editor's edit, checked (web/workflow-admin.ts's workflowEdit),
   * less the name and description, which are saved straight away. */
  fields?: WorkflowFields
  /** The success criteria, all of them, checked. */
  criteria?: { id?: string; text: string; kind: string; value?: string }[]
  /** Where messages go: its delivery, or null for the messaging app's
   * defaults. */
  messages?: { delivery: WorkflowDelivery | null }
  schedules?: { add: DraftSchedule[]; remove: string[] }
  /** Webhooks made in the draft (not live yet), changes to live ones (each
   * one's checked settings), and live ones to delete. */
  webhooks?: { added: string[]; update: Record<string, Record<string, unknown>>; remove: string[] }
  savedAt: string
  savedBy?: string
  /** The published version it was started from. */
  basedOn?: number
  /** The earlier version restored into it, for publishing's default note. */
  restoredFrom?: number
}

const draftPath = (projectDir: string, agent: string, workflowId: string) => join(projectDir, '.loopengine', 'workflow-drafts', agent, `${workflowId}.json`)

export function readDraft(projectDir: string, agent: string, workflowId: string): WorkflowDraft | undefined {
  const path = draftPath(projectDir, agent, workflowId)
  if (!existsSync(path)) return undefined
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as WorkflowDraft
  } catch {
    return undefined
  }
}

/** A draft with nothing in it. */
export function isEmptyDraft(d: WorkflowDraft): boolean {
  return !d.fields && !d.criteria && !d.messages &&
    !d.schedules?.add.length && !d.schedules?.remove.length &&
    !d.webhooks?.added.length && !Object.keys(d.webhooks?.update ?? {}).length && !d.webhooks?.remove.length
}

/** Changes the draft (making one when there's none), saving who changed
 * it and when; an empty draft is removed. `basedOn` stays the version the
 * draft began from. */
export function changeDraft(projectDir: string, agent: string, workflowId: string, about: { by?: string; basedOn?: number }, change: (d: WorkflowDraft) => WorkflowDraft): WorkflowDraft | undefined {
  const before = readDraft(projectDir, agent, workflowId)
  const start: WorkflowDraft = before ?? { savedAt: '', ...(about.basedOn ? { basedOn: about.basedOn } : {}) }
  const next: WorkflowDraft = { ...change(start), savedAt: new Date().toISOString(), ...(about.by ? { savedBy: about.by } : {}) }
  if (before?.basedOn !== undefined) next.basedOn = before.basedOn
  const path = draftPath(projectDir, agent, workflowId)
  if (isEmptyDraft(next)) {
    if (existsSync(path)) unlinkSync(path)
    return undefined
  }
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(`${path}.tmp`, JSON.stringify(next, null, 2) + '\n')
  renameSync(`${path}.tmp`, path)
  return next
}

/** Saves a whole draft (tests, and replacing one outright). */
export function saveDraft(projectDir: string, agent: string, workflowId: string, draft: WorkflowDraft): WorkflowDraft | undefined {
  return changeDraft(projectDir, agent, workflowId, { ...(draft.savedBy ? { by: draft.savedBy } : {}), ...(draft.basedOn ? { basedOn: draft.basedOn } : {}) }, () => draft)
}

export function discardDraft(projectDir: string, agent: string, workflowId: string): void {
  const path = draftPath(projectDir, agent, workflowId)
  if (existsSync(path)) unlinkSync(path)
}

/** The workflow as the draft's editor fields would make it. */
export function withDraft(workflow: Workflow, fields: WorkflowFields | undefined): Workflow {
  if (!fields) return workflow
  return {
    ...workflow,
    ...(fields.instructions !== undefined ? { instructions: fields.instructions, steps: fields.instructions } : {}),
    ...(fields.parameters ? { parameters: fields.parameters } : {}),
    ...(fields.output !== undefined ? { output: fields.output ?? undefined } : {}),
    ...(fields.outputSchema !== undefined ? { outputSchema: (fields.outputSchema ?? undefined) as Workflow['outputSchema'] } : {}),
    ...(fields.model !== undefined ? { model: fields.model ?? undefined } : {}),
  }
}

/** Where messages go, in words, for comparing. */
export function messagesText(d: WorkflowDelivery | null | undefined): string {
  if (!d) return 'the messaging app'
  return [
    d.callback_url ? `updates to ${d.callback_url}` : '',
    d.decisions_to === 'callback' ? 'approvals and questions to your app' : '',
    d.chat_notice ? `start notice “${d.chat_notice}”` : '',
    d.result_to_chat ? 'result to chat' : '',
  ].filter(Boolean).join('; ') || 'the messaging app'
}

/** Everything a draft can change, as fields to compare. */
export interface DraftState {
  workflow: Workflow
  criteria: { text: string; kind: string; value?: string }[]
  delivery: WorkflowDelivery | null | undefined
  /** Each schedule and webhook that starts it, in a line. */
  triggers: string[]
}

function comparable(s: DraftState): Record<string, string> {
  const w = s.workflow
  return {
    instructions: w.instructions,
    inputs: JSON.stringify(inputSchemaOf(w.parameters), null, 2),
    'result format': w.output ?? '',
    'output schema': w.outputSchema ? JSON.stringify(w.outputSchema, null, 2) : '',
    model: w.model ? `${w.model.provider} ${w.model.model}` : 'the agent’s',
    'success criteria': s.criteria.map((c) => `[${c.kind}${c.value ? `: ${c.value}` : ''}] ${c.text}`).join('\n'),
    messaging: messagesText(s.delivery),
    triggers: [...s.triggers].sort().join('\n'),
  }
}

/** What publishing changes: the published state against the drafted. */
export function draftChanges(published: DraftState, drafted: DraftState): FieldChange[] {
  return describeChanges(comparable(published), comparable(drafted))
}
