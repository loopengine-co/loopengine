// Lets an operator add, edit, or remove a skill from the Skills tab in
// /agents/config, instead of hand-writing agents/<name>/skills/<id>/
// SKILL.md directly. Deliberately scoped to *flat* skills only — a
// nested skill (e.g. agents/<name>/skills/deploy/web/SKILL.md, which
// SkillGarden's own discoverSkillFiles namespaces as 'deploy:web') isn't
// addressable through this admin surface; its id would need to carry a
// '/' through a single URL path segment, which either means encoding
// tricks or a second routing scheme, for a nesting feature nothing in
// this repo's own example agents actually uses. Read-only display of a
// nested skill (via describeAgent's own skills list) still works fine —
// only adding/editing/removing one through this UI is out of scope.
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { parseSkillFile } from '../core/skillgarden/index.js'
import { agentDir } from '../core/gateway-tools.js'
import { writeSkillFile } from '../core/workflows.js'

export class SkillInvalidIdError extends Error {}
export class SkillNotFoundError extends Error {}

// Same character set agent/subagent names are already validated against
// elsewhere in this repo (bin/cli.ts's NAME_PATTERN) — a skill id becomes a
// directory name on disk, so this is what keeps it from ever containing
// '/', '..', or anything else that could resolve outside its own
// skills/ folder.
const SKILL_ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/

function requireValidSkillId(skillId: string): void {
  if (!SKILL_ID_PATTERN.test(skillId)) {
    throw new SkillInvalidIdError(
      `Invalid skill id '${skillId}' — must be lowercase, alphanumeric, hyphen-separated (e.g. "summarize-files"); nested skills aren't editable through this admin UI.`,
    )
  }
}

function skillsDir(agentName: string): string {
  return join(agentDir(agentName), 'skills')
}

function skillFilePath(agentName: string, skillId: string): string {
  requireValidSkillId(skillId)
  return join(skillsDir(agentName), skillId, 'SKILL.md')
}

export interface SkillContent {
  id: string
  description: string
  body: string
}

export function readSkill(agentName: string, skillId: string): SkillContent {
  const path = skillFilePath(agentName, skillId)
  if (!existsSync(path)) {
    throw new SkillNotFoundError(`No skill '${skillId}' for '${agentName}'.`)
  }
  const { frontmatter, body } = parseSkillFile(readFileSync(path, 'utf8'), skillId)
  return { id: skillId, description: frontmatter.description ?? '', body }
}

/** Creates the skill if `skillId` doesn't exist yet, or replaces its
 * description and body if it does. Its other front matter is kept: a
 * workflow's start message, trigger and parameters (core/workflows.ts),
 * `paths` and anything hand-written, none of which the Skills tab edits. */
export function writeSkill(agentName: string, skillId: string, content: { description: string; body: string }): void {
  const path = skillFilePath(agentName, skillId)
  const description = content.description.replace(/\n/g, ' ').trim()
  const existing = existsSync(path) ? parseSkillFile(readFileSync(path, 'utf8'), skillId).frontmatter : {}
  writeSkillFile(path, { ...existing, name: skillId, description }, content.body)
}

export function deleteSkill(agentName: string, skillId: string): void {
  const path = skillFilePath(agentName, skillId)
  if (!existsSync(path)) {
    throw new SkillNotFoundError(`No skill '${skillId}' for '${agentName}'.`)
  }
  rmSync(dirname(path), { recursive: true, force: true })
}
