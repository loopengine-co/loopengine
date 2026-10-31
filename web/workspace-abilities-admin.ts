// Backs the Abilities page's private Install (an ability into the
// workspace) and each agent's Private abilities list: see
// core/workspace-abilities.ts.
import { execFile } from 'node:child_process'
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { promisify } from 'node:util'
import { fetchAbilityDirAsync } from '../bin/ability-manager.js'
import { WorkspaceAbilityError, addWorkspaceAbility, type WorkspaceAbility } from '../core/workspace-abilities.js'

/** Fetches `spec` like an agent install would (a private source's token
 * included) and stores it as the workspace's copy, replacing an earlier
 * one. */
export async function installWorkspaceAbility(spec: string, options: { fetchDir?: (spec: string) => Promise<string> } = {}): Promise<WorkspaceAbility> {
  const dir = await (options.fetchDir ?? fetchAbilityDirAsync)(spec)
  try {
    return addWorkspaceAbility(dir, spec)
  } finally {
    rmSync(dirname(dir), { recursive: true, force: true })
  }
}

// ---- Uploading an ability from your own computer ----

/** Largest upload accepted, archive or folder (base64 aside). */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024

export type AbilityUpload =
  | { kind: 'archive'; fileName: string; data: string }
  | { kind: 'files'; folderName?: string; files: Array<{ path: string; data: string }> }

/** A relative path inside the upload, never one that could land outside
 * it: no absolute paths, drive letters or ".." parts. */
function safeRelativePath(path: string): string {
  const parts = path.replace(/\\/g, '/').split('/').filter((p) => p && p !== '.')
  if (!parts.length || /^[a-zA-Z]:$/.test(parts[0]) || path.startsWith('/') || parts.some((p) => p === '..')) {
    throw new WorkspaceAbilityError(`The upload has a file outside its folder (${path}), so it was refused`)
  }
  return parts.join('/')
}

/** The folder holding loopengine.ability.json: the upload's top level, or
 * the one folder it's wrapped in (package/ from npm pack, or the folder's
 * own name). */
function findAbilityRoot(dir: string): string {
  if (existsSync(join(dir, 'loopengine.ability.json'))) return dir
  const entries = readdirSync(dir, { withFileTypes: true }).filter((e) => !e.name.startsWith('.') && e.name !== '__MACOSX')
  if (entries.length === 1 && entries[0].isDirectory() && existsSync(join(dir, entries[0].name, 'loopengine.ability.json'))) return join(dir, entries[0].name)
  throw new WorkspaceAbilityError('No loopengine.ability.json at the top of the upload (or in the one folder it holds), so it isn\'t a loopengine ability')
}

/** Refuses symlinks anywhere in an extracted upload: one could point
 * outside it. */
function refuseSymlinks(dir: string): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (lstatSync(path).isSymbolicLink()) throw new WorkspaceAbilityError(`The upload has a link (${entry.name}), so it was refused`)
    if (entry.isDirectory()) refuseSymlinks(path)
  }
}

/** Stores an uploaded ability (a .zip or .tgz, or a folder's files) as
 * the workspace's copy, recorded as upload:<name>. */
export async function installUploadedAbility(upload: AbilityUpload): Promise<WorkspaceAbility> {
  const work = mkdtempSync(join(tmpdir(), 'loopengine-upload-'))
  try {
    const out = join(work, 'out')
    mkdirSync(out)
    let label: string
    if (upload.kind === 'archive') {
      const fileName = basename(upload.fileName || 'ability')
      const data = Buffer.from(upload.data, 'base64')
      if (!data.length) throw new WorkspaceAbilityError('The file is empty')
      if (data.length > MAX_UPLOAD_BYTES) throw new WorkspaceAbilityError('The file is larger than 25 MB')
      const archive = join(work, 'upload')
      writeFileSync(archive, data)
      const run = promisify(execFile)
      if (/\.zip$/i.test(fileName)) {
        const { stdout } = await run('unzip', ['-Z1', archive]).catch(() => run('unzip', ['-l', archive]))
        // `unzip -l` (busybox) lists sizes and dates first; the name is last.
        for (const line of stdout.split('\n')) {
          const name = line.trim().split(/\s+/).slice(/^\d/.test(line.trim()) ? 3 : 0).join(' ')
          if (name && !/^-+$|^Name$|^Archive:|files?$/.test(name)) safeRelativePath(name)
        }
        await run('unzip', ['-q', archive, '-d', out])
      } else if (/\.(tgz|tar\.gz)$/i.test(fileName)) {
        const { stdout } = await run('tar', ['-tzf', archive])
        for (const name of stdout.split('\n')) if (name.trim()) safeRelativePath(name.trim())
        await run('tar', ['-xzf', archive, '-C', out])
      } else {
        throw new WorkspaceAbilityError('Upload a .zip or .tgz, or choose a folder')
      }
      label = fileName
    } else {
      let total = 0
      for (const file of upload.files) {
        const data = Buffer.from(file.data, 'base64')
        total += data.length
        if (total > MAX_UPLOAD_BYTES) throw new WorkspaceAbilityError('The folder is larger than 25 MB')
        const path = join(out, safeRelativePath(file.path))
        mkdirSync(dirname(path), { recursive: true })
        writeFileSync(path, data)
      }
      if (!upload.files.length) throw new WorkspaceAbilityError('The folder is empty')
      label = basename(upload.folderName || 'folder')
    }
    refuseSymlinks(out)
    return addWorkspaceAbility(findAbilityRoot(out), `upload:${label}`)
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}
