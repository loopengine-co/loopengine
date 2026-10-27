// Backs the console's Templates page (/templates): the ready-made agents
// in core/system-agents/templates.ts, previewed and created the same way
// as a "Find your first agent" suggestion (web/interview-admin.ts), so a
// template agent starts exactly like one: its instructions, every tool
// asking first, a paused schedule when it runs on a timer, and a Finish
// setup checklist. Unlike the interview it needs no model call, so it
// works before any agent has a model or key.
import { STARTER_TEMPLATES, starterTemplate, type StarterTemplate } from '../core/system-agents/templates.js'
import { createAgentFromCandidate, describeCandidate, type CandidatePreview, type CreateDeps, type CreatedAgent } from './interview-admin.js'

export class TemplateError extends Error {}

/** A template as the page's cards show it. */
export interface TemplateSummary {
  id: string
  category: string
  title: string
  summary: string
  trigger: string
  asksFirst: string[]
  needs: string[]
  schedule: boolean
}

function templateAt(id: string): StarterTemplate {
  const template = starterTemplate(id)
  if (!template) throw new TemplateError('No such template')
  return template
}

export function listTemplates(): TemplateSummary[] {
  return STARTER_TEMPLATES.map(({ id, category, candidate: c }) => ({
    id,
    category,
    title: c.title,
    summary: c.summary,
    trigger: c.trigger.description,
    asksFirst: c.asksFirst,
    needs: c.needs.map((n) => (n.kind === 'key' ? n.description : n.name ?? n.description)),
    schedule: c.trigger.kind === 'schedule',
  }))
}

export function previewTemplate(id: string, deps: Pick<CreateDeps, 'agentExists'>): CandidatePreview {
  return describeCandidate(templateAt(id).candidate, deps)
}

/** Creates a new agent from the template, under the first free name, so
 * the same template can be used more than once. */
export async function createFromTemplate(id: string, deps: CreateDeps): Promise<CreatedAgent> {
  return createAgentFromCandidate(templateAt(id).candidate, deps)
}
