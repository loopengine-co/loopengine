// Which agents each person sees, for a hosted workspace with a team
// (core/workspace-roles.ts). The control plane says who may come in and
// with what role; this says where an approver or viewer may look: the
// Inbox shows them only those agents' cases, and they decide only on
// those. Owners, admins and editors always see every agent.
//
// Kept in .loopengine/people.json by email, with each person's role and
// when they were last here, so Settings → People can list everyone who
// has signed in. Someone can be added by email before their first visit.
// No entry, or no agent list, means every agent.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { inboxOnly, type WorkspaceRole } from './workspace-roles.js'

export interface WorkspacePerson {
  email: string
  role?: WorkspaceRole
  /** When they were last here (ISO). */
  seen?: string
  /** The agents they see; absent for every agent. */
  agents?: string[]
}

/** How often a visit updates "last here". */
const SEEN_EVERY_MS = 60 * 60 * 1000

function peopleFile(projectDir: string): string {
  return join(projectDir, '.loopengine', 'people.json')
}

function normalEmail(raw: string): string {
  return raw.trim().toLowerCase()
}

export function readPeople(projectDir: string): WorkspacePerson[] {
  try {
    const parsed = JSON.parse(readFileSync(peopleFile(projectDir), 'utf8')) as { people?: unknown }
    return Array.isArray(parsed.people) ? (parsed.people as WorkspacePerson[]).filter((p) => p && typeof p.email === 'string') : []
  } catch {
    return []
  }
}

function writePeople(projectDir: string, people: WorkspacePerson[]): void {
  const file = peopleFile(projectDir)
  mkdirSync(dirname(file), { recursive: true })
  const temp = `${file}.${process.pid}.tmp`
  writeFileSync(temp, JSON.stringify({ people: [...people].sort((a, b) => a.email.localeCompare(b.email)) }, null, 2) + '\n')
  renameSync(temp, file)
}

/** Notes a signed-in person's visit: a new person, a changed role, or an
 * hour since "last here" is written; anything else costs nothing. */
export function recordVisit(projectDir: string, rawEmail: string, role: WorkspaceRole, now = new Date()): void {
  const email = normalEmail(rawEmail)
  if (!email) return
  const people = readPeople(projectDir)
  const known = people.find((p) => p.email === email)
  if (known && known.role === role && known.seen && now.getTime() - Date.parse(known.seen) < SEEN_EVERY_MS) return
  const updated = { ...(known ?? { email }), role, seen: now.toISOString() }
  writePeople(projectDir, [...people.filter((p) => p.email !== email), updated])
}

/** Sets which agents `email` sees; undefined for every agent. Adds them
 * if they haven't been here yet. */
export function setPersonAgents(projectDir: string, rawEmail: string, agents: string[] | undefined): WorkspacePerson {
  const email = normalEmail(rawEmail)
  const people = readPeople(projectDir)
  const { agents: _old, ...rest } = people.find((p) => p.email === email) ?? { email }
  const updated: WorkspacePerson = agents ? { ...rest, agents: [...new Set(agents)].sort() } : rest
  writePeople(projectDir, [...people.filter((p) => p.email !== email), updated])
  return updated
}

/** Forgets `email` (they see every agent again, if they still have access). */
export function removePerson(projectDir: string, rawEmail: string): void {
  const email = normalEmail(rawEmail)
  writePeople(projectDir, readPeople(projectDir).filter((p) => p.email !== email))
}

/** The agents a caller may see, or undefined for every agent. Only an
 * approver or viewer is ever limited. */
export function agentsFor(projectDir: string, role: WorkspaceRole, rawEmail: string | undefined): string[] | undefined {
  if (!inboxOnly(role)) return undefined
  if (!rawEmail) return undefined
  const email = normalEmail(rawEmail)
  return readPeople(projectDir).find((p) => p.email === email)?.agents
}
