import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ABILITY_SOURCES_FILE_ENV, abilityOrigin } from '#core/ability-sources.js'
import {
  WORKSPACE_ABILITIES_DIR_ENV,
  WorkspaceAbilityError,
  addWorkspaceAbility,
  listWorkspaceAbilities,
  removeWorkspaceAbility,
  workspaceAbilityAt,
} from '#core/workspace-abilities.js'
import { installWorkspaceAbility } from '#web/workspace-abilities-admin.js'

let dir: string
let workspace: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'le-workspace-'))
  workspace = join(dir, 'abilities')
  process.env[WORKSPACE_ABILITIES_DIR_ENV] = workspace
  process.env[ABILITY_SOURCES_FILE_ENV] = join(dir, 'ability-sources.yml')
})
afterEach(() => {
  delete process.env[WORKSPACE_ABILITIES_DIR_ENV]
  delete process.env[ABILITY_SOURCES_FILE_ENV]
  rmSync(dir, { recursive: true, force: true })
})

/** A fetched ability package folder, like npm pack leaves. */
function fetched(name: string, version: string, extra: Record<string, string> = {}): string {
  const pkg = mkdtempSync(join(dir, 'fetched-'))
  writeFileSync(join(pkg, 'package.json'), JSON.stringify({ name, version, description: `${name} does things` }))
  writeFileSync(join(pkg, 'loopengine.ability.json'), JSON.stringify({ tools: [] }))
  for (const [file, content] of Object.entries(extra)) {
    mkdirSync(join(pkg, file, '..'), { recursive: true })
    writeFileSync(join(pkg, file), content)
  }
  return pkg
}

describe('the workspace abilities', () => {
  it('stores a copy and records where it came from, for agents to install as file:', () => {
    const added = addWorkspaceAbility(fetched('lp-github', '1.0.0', { 'tools/a.ts': 'v1' }), 'github:loopengine-co/lp-github')

    expect(added).toMatchObject({ name: 'lp-github', version: '1.0.0', source: 'github:loopengine-co/lp-github', description: 'lp-github does things', spec: `file:${join(workspace, 'lp-github')}` })
    expect(readFileSync(join(workspace, 'lp-github', 'tools/a.ts'), 'utf8')).toBe('v1')
    expect(JSON.parse(readFileSync(join(workspace, 'workspace.json'), 'utf8'))['lp-github'].source).toBe('github:loopengine-co/lp-github')
  })

  it('replaces an earlier copy of the same ability, leaving no stale files', () => {
    addWorkspaceAbility(fetched('lp-github', '1.0.0', { 'tools/old.ts': 'old' }), 'github:loopengine-co/lp-github')
    addWorkspaceAbility(fetched('lp-github', '1.1.0', { 'tools/new.ts': 'new' }), 'github:loopengine-co/lp-github')

    expect(listWorkspaceAbilities().map((a) => [a.name, a.version])).toEqual([['lp-github', '1.1.0']])
    expect(existsSync(join(workspace, 'lp-github', 'tools/old.ts'))).toBe(false)
    expect(existsSync(join(workspace, 'lp-github.installing'))).toBe(false)
  })

  it('keeps a scoped package in a safe folder name', () => {
    const added = addWorkspaceAbility(fetched('@acme/lp-billing', '0.3.0'), '@acme/lp-billing')
    expect(added.spec).toBe(`file:${join(workspace, '@acme+lp-billing')}`)
    expect(workspaceAbilityAt(join(workspace, '@acme+lp-billing'))?.name).toBe('@acme/lp-billing')
  })

  it('removes a copy, and refuses a package that is not an ability', () => {
    addWorkspaceAbility(fetched('lp-github', '1.0.0'), 'file:/x')
    removeWorkspaceAbility('lp-github')
    expect(listWorkspaceAbilities()).toEqual([])
    expect(existsSync(join(workspace, 'lp-github'))).toBe(false)
    expect(() => removeWorkspaceAbility('lp-github')).toThrow(WorkspaceAbilityError)

    const notAbility = fetched('plain-package', '1.0.0')
    rmSync(join(notAbility, 'loopengine.ability.json'))
    expect(() => addWorkspaceAbility(notAbility, 'plain-package')).toThrow(/isn't a loopengine ability/)
  })

  it('fetches a spec into the workspace and cleans up the download', async () => {
    const download = mkdtempSync(join(dir, 'download-'))
    const pkgDir = join(download, 'package')
    const source = fetched('lp-stripe', '2.0.0')
    mkdirSync(pkgDir)
    for (const f of ['package.json', 'loopengine.ability.json']) writeFileSync(join(pkgDir, f), readFileSync(join(source, f)))

    const added = await installWorkspaceAbility('github:acme/lp-stripe', { fetchDir: async () => pkgDir })
    expect(added).toMatchObject({ name: 'lp-stripe', version: '2.0.0', source: 'github:acme/lp-stripe' })
    expect(existsSync(download)).toBe(false)
  })
})

describe('the badge for an ability an agent added from the workspace', () => {
  it('says Workspace, with where the copy came from', () => {
    const fromGitHub = addWorkspaceAbility(fetched('lp-github', '1.0.0'), 'github:loopengine-co/lp-github')
    const fromFolder = addWorkspaceAbility(fetched('lp-local', '1.0.0'), 'file:/srv/abilities/lp-local')

    expect(abilityOrigin(fromGitHub.spec, 'lp-github', [])).toEqual({ kind: 'private', label: 'Workspace (GitHub loopengine-co/lp-github)' })
    expect(abilityOrigin(fromFolder.spec, 'lp-local', [])).toEqual({ kind: 'private', label: 'Workspace' })
  })
})
