// The workspace's own copies of private abilities: installed once from a
// private source (core/ability-sources.ts) on the console's Abilities
// page, then added to any agent from its Abilities tab. Each copy is a
// folder under abilities/ in the project root (or the folder
// LOOPENGINE_ABILITIES_DIR names), and abilities/workspace.json says
// where each came from:
//
//   { "lp-github": { "source": "github:loopengine-co/lp-github",
//                    "version": "1.0.0", "installedAt": "2026-10-31T..." } }
//
// An agent installs a copy as file:<its folder>, so it needs no token
// and nothing is fetched again; installing it in the workspace again
// updates the copy, and each agent's Upgrade then picks that up.
import { cpSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'

export const WORKSPACE_ABILITIES_DIR_ENV = 'LOOPENGINE_ABILITIES_DIR'

export interface WorkspaceAbilityRecord {
  /** The spec it was installed from: github:owner/repo, @scope/name, file:/path. */
  source: string
  version: string
  installedAt: string
}

export interface WorkspaceAbility extends WorkspaceAbilityRecord {
  name: string
  description: string
  /** What an agent installs it with: file:<its folder>. */
  spec: string
}

export class WorkspaceAbilityError extends Error {}

export function workspaceAbilitiesDir(): string {
  return resolve(process.cwd(), process.env[WORKSPACE_ABILITIES_DIR_ENV]?.trim() || 'abilities')
}

function recordsPath(): string {
  return join(workspaceAbilitiesDir(), 'workspace.json')
}

/** A copy's folder name: the package name, with a scope's slash made safe
 * ("@acme/lp-x" is abilities/@acme+lp-x). */
function folderFor(name: string): string {
  return join(workspaceAbilitiesDir(), name.replace('/', '+'))
}

function readRecords(): Record<string, WorkspaceAbilityRecord> {
  const path = recordsPath()
  if (!existsSync(path)) return {}
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'))
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function writeRecords(records: Record<string, WorkspaceAbilityRecord>): void {
  mkdirSync(workspaceAbilitiesDir(), { recursive: true })
  writeFileSync(recordsPath(), JSON.stringify(records, null, 2) + '\n')
}

/** Every copy in the workspace, by name. A record whose folder is gone is
 * left out. */
export function listWorkspaceAbilities(): WorkspaceAbility[] {
  return Object.entries(readRecords())
    .flatMap(([name, record]) => {
      const dir = folderFor(name)
      if (!existsSync(join(dir, 'loopengine.ability.json'))) return []
      let description = ''
      try {
        description = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).description ?? ''
      } catch {}
      return [{ name, description, spec: `file:${dir}`, ...record }]
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** Stores a fetched ability (`fetchedDir`, a package folder holding
 * loopengine.ability.json) as the workspace's copy, replacing an earlier
 * one of the same name. `source` is the spec it came from. */
export function addWorkspaceAbility(fetchedDir: string, source: string): WorkspaceAbility {
  if (!existsSync(join(fetchedDir, 'loopengine.ability.json'))) throw new WorkspaceAbilityError(`${source} has no loopengine.ability.json, so it isn't a loopengine ability`)
  let pkg: { name?: string; version?: string } = {}
  try {
    pkg = JSON.parse(readFileSync(join(fetchedDir, 'package.json'), 'utf8'))
  } catch {}
  if (!pkg.name || !/^(@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*$/i.test(pkg.name)) throw new WorkspaceAbilityError(`${source} has no valid package.json name`)
  const dir = folderFor(pkg.name)
  // Copied beside it first, then swapped in, so a failed copy leaves the
  // earlier one as it was.
  const staging = `${dir}.installing`
  rmSync(staging, { recursive: true, force: true })
  mkdirSync(workspaceAbilitiesDir(), { recursive: true })
  cpSync(fetchedDir, staging, { recursive: true })
  rmSync(dir, { recursive: true, force: true })
  renameSync(staging, dir)
  const records = readRecords()
  records[pkg.name] = { source, version: pkg.version ?? '', installedAt: new Date().toISOString() }
  writeRecords(records)
  return listWorkspaceAbilities().find((a) => a.name === pkg.name)!
}

/** Removes a copy from the workspace. Agents that installed it keep
 * their own copies of its files. */
export function removeWorkspaceAbility(name: string): void {
  const records = readRecords()
  if (!records[name]) throw new WorkspaceAbilityError(`${name} isn't in the workspace`)
  delete records[name]
  rmSync(folderFor(name), { recursive: true, force: true })
  writeRecords(records)
}

/** The workspace copy an agent installed from, when `path` (from a
 * file: spec) is one. */
export function workspaceAbilityAt(path: string): (WorkspaceAbilityRecord & { name: string }) | undefined {
  const root = workspaceAbilitiesDir() + sep
  const target = resolve(process.cwd(), path)
  if (!target.startsWith(root)) return undefined
  const folder = target.slice(root.length).split(sep)[0]
  const entry = Object.entries(readRecords()).find(([name]) => name.replace('/', '+') === folder)
  return entry ? { name: entry[0], ...entry[1] } : undefined
}
