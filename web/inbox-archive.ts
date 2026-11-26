// The Inbox's archive: the cases a person put away, so All, Completed and
// Failed show what's still worth a look. Shared by the workspace, kept in
// the project at .loopengine/inbox-archive.json as { <case id>: { at, by } }.
// A case that's waiting on a person is never hidden: it shows in Needs
// attention archived or not.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { InboxArchived } from './inbox-admin.js'

const archivePath = (projectDir: string) => join(projectDir, '.loopengine', 'inbox-archive.json')

export function readArchived(projectDir: string): Record<string, InboxArchived> {
  const path = archivePath(projectDir)
  if (!existsSync(path)) return {}
  try {
    const data = JSON.parse(readFileSync(path, 'utf8')) as unknown
    return data && typeof data === 'object' && !Array.isArray(data) ? (data as Record<string, InboxArchived>) : {}
  } catch {
    return {}
  }
}

/** Archives the cases (`archived` true) or brings them back. */
export function setArchived(projectDir: string, ids: string[], archived: boolean, by?: string): Record<string, InboxArchived> {
  const all = readArchived(projectDir)
  const at = new Date().toISOString()
  for (const id of ids) {
    if (archived) all[id] = { at, ...(by ? { by } : {}) }
    else delete all[id]
  }
  const path = archivePath(projectDir)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(`${path}.tmp`, JSON.stringify(all, null, 2) + '\n')
  renameSync(`${path}.tmp`, path)
  return all
}
