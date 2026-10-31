import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { abilityOrigin } from '#core/ability-sources.js'
import { WORKSPACE_ABILITIES_DIR_ENV, listWorkspaceAbilities } from '#core/workspace-abilities.js'
import { installUploadedAbility } from '#web/workspace-abilities-admin.js'

let dir: string
let workspace: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'le-upload-'))
  workspace = join(dir, 'workspace')
  process.env[WORKSPACE_ABILITIES_DIR_ENV] = workspace
})
afterEach(() => {
  delete process.env[WORKSPACE_ABILITIES_DIR_ENV]
  rmSync(dir, { recursive: true, force: true })
})

/** An ability folder named `name` inside `parent`, with one tool file. */
function abilityFolder(parent: string, name: string, version = '1.0.0'): string {
  const d = join(parent, name)
  mkdirSync(join(d, 'tools'), { recursive: true })
  writeFileSync(join(d, 'package.json'), JSON.stringify({ name, version }))
  writeFileSync(join(d, 'loopengine.ability.json'), JSON.stringify({ tools: ['tools/t.ts'] }))
  writeFileSync(join(d, 'tools/t.ts'), 'export const t = 1\n')
  return d
}

const base64 = (path: string) => readFileSync(path).toString('base64')

describe('uploading an ability into the workspace', () => {
  it('installs a .tgz like npm pack makes (wrapped in package/)', async () => {
    const src = join(dir, 'src')
    abilityFolder(src, 'package')
    writeFileSync(join(src, 'package/package.json'), JSON.stringify({ name: 'lp-upload', version: '2.0.0' }))
    execFileSync('tar', ['-czf', join(dir, 'lp-upload-2.0.0.tgz'), '-C', src, 'package'])

    const added = await installUploadedAbility({ kind: 'archive', fileName: 'lp-upload-2.0.0.tgz', data: base64(join(dir, 'lp-upload-2.0.0.tgz')) })
    expect(added).toMatchObject({ name: 'lp-upload', version: '2.0.0', source: 'upload:lp-upload-2.0.0.tgz' })
    expect(readFileSync(join(workspace, 'lp-upload/tools/t.ts'), 'utf8')).toContain('export const t')
    expect(abilityOrigin(added.spec, added.name, [])).toEqual({ kind: 'private', label: 'Workspace (uploaded)' })
  })

  it('installs a .zip of the ability folder', async () => {
    const src = join(dir, 'src')
    abilityFolder(src, 'lp-zipped')
    execFileSync('zip', ['-qr', join(dir, 'lp-zipped.zip'), 'lp-zipped'], { cwd: src })

    const added = await installUploadedAbility({ kind: 'archive', fileName: 'lp-zipped.zip', data: base64(join(dir, 'lp-zipped.zip')) })
    expect(added).toMatchObject({ name: 'lp-zipped', source: 'upload:lp-zipped.zip' })
  })

  it("installs a folder's files sent one by one, with their paths", async () => {
    const files = [
      { path: 'lp-folder/package.json', data: Buffer.from(JSON.stringify({ name: 'lp-folder', version: '0.1.0' })).toString('base64') },
      { path: 'lp-folder/loopengine.ability.json', data: Buffer.from('{"tools":[]}').toString('base64') },
      { path: 'lp-folder/skills/s/SKILL.md', data: Buffer.from('# skill').toString('base64') },
    ]
    const added = await installUploadedAbility({ kind: 'files', folderName: 'lp-folder', files })
    expect(added).toMatchObject({ name: 'lp-folder', version: '0.1.0', source: 'upload:lp-folder' })
    expect(existsSync(join(workspace, 'lp-folder/skills/s/SKILL.md'))).toBe(true)
  })

  it('refuses paths that would land outside the upload', async () => {
    for (const path of ['../evil.txt', 'lp/../../evil.txt', '/etc/evil', 'C:/evil']) {
      await expect(installUploadedAbility({ kind: 'files', files: [{ path, data: 'eA==' }] })).rejects.toThrow(/outside its folder/)
    }
    expect(existsSync(join(dir, 'evil.txt'))).toBe(false)

    // A tar entry climbing out of the archive is refused before extracting.
    const src = join(dir, 'tarsrc')
    mkdirSync(src)
    writeFileSync(join(dir, 'outside.txt'), 'x')
    execFileSync('tar', ['-czf', join(dir, 'evil.tgz'), '-C', src, '../outside.txt'])
    await expect(installUploadedAbility({ kind: 'archive', fileName: 'evil.tgz', data: base64(join(dir, 'evil.tgz')) })).rejects.toThrow(/outside its folder/)
  })

  it('refuses a symlink, an upload that is not an ability, and other file types', async () => {
    const src = join(dir, 'src')
    abilityFolder(src, 'lp-linked')
    symlinkSync('/etc/hosts', join(src, 'lp-linked/hosts'))
    execFileSync('tar', ['-czf', join(dir, 'linked.tgz'), '-C', src, 'lp-linked'])
    await expect(installUploadedAbility({ kind: 'archive', fileName: 'linked.tgz', data: base64(join(dir, 'linked.tgz')) })).rejects.toThrow(/has a link/)

    await expect(installUploadedAbility({ kind: 'files', folderName: 'x', files: [{ path: 'x/readme.md', data: 'eA==' }] })).rejects.toThrow(/isn't a loopengine ability/)
    await expect(installUploadedAbility({ kind: 'archive', fileName: 'ability.rar', data: 'eA==' })).rejects.toThrow(/\.zip or \.tgz/)
    expect(listWorkspaceAbilities()).toEqual([])
  })
})
