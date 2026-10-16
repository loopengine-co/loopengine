import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { UpgradeError, describeUpgrade, runUpgrade, setUpgradeRunner } from '#web/upgrade-admin.js'
import { loopengineVersion } from '#core/version.js'

let dir: string
const calls: string[] = []

function project(withProvenance = true): void {
  mkdirSync(join(dir, 'adapters'), { recursive: true })
  writeFileSync(join(dir, 'adapters', 'http.ts'), 'old http\n')
  writeFileSync(join(dir, 'package.json'), '{"dependencies":{"loopengine":"^0.0.1"}}\n')
  if (withProvenance) writeFileSync(join(dir, '.create-loopengine.json'), '{"version":"0.0.1"}\n')
  mkdirSync(join(dir, '.sessions'), { recursive: true })
  writeFileSync(join(dir, '.sessions', 'conversation.json'), 'history')
  writeFileSync(join(dir, '.env'), 'OPENAI_API_KEY=sk-keep-me\n')
}

/** A fake npm/npx: `npm view` answers `latest`; the upgrade either
 * rewrites files like create-loopengine would, or fails like it can. */
function fakeRunner(opts: { latest: string; latestTemplate?: string; upgrade: 'ok' | 'error' | 'install-failed' | 'crash' }) {
  return async (cmd: string, args: string[], cwd: string): Promise<string> => {
    calls.push(`${cmd} ${args.join(' ')}`)
    if (cmd === 'npm' && args[0] === 'view') return `${args[1] === 'create-loopengine' ? (opts.latestTemplate ?? '0.0.1') : opts.latest}\n`
    if (cmd === 'npm') return ''
    // npx create-loopengine@latest upgrade --json --keep-edited
    writeFileSync(join(cwd, 'adapters', 'http.ts'), 'new http\n')
    writeFileSync(join(cwd, 'package.json'), `{"dependencies":{"loopengine":"^${opts.latest}"}}\n`)
    const result = { fromVersion: '0.0.1', toVersion: '9.9.9', files: [{ file: 'adapters/http.ts', status: 'updated' }, { file: 'agent-registry.ts', status: 'kept' }], dependencies: [{ name: 'loopengine', from: '^0.0.1', to: `^${opts.latest}` }] }
    if (opts.upgrade === 'ok') return JSON.stringify(result) + '\n'
    if (opts.upgrade === 'install-failed') return JSON.stringify({ ...result, npmInstall: { ok: false, error: 'ETIMEDOUT' } }) + '\n'
    if (opts.upgrade === 'error') return JSON.stringify({ error: 'No .create-loopengine.json' }) + '\n'
    throw Object.assign(new Error('npx: command failed'), { stdout: '' })
  }
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'le-upgrade-'))
  calls.length = 0
})
afterEach(() => {
  setUpgradeRunner(undefined)
  rmSync(dir, { recursive: true, force: true })
})

describe('describeUpgrade', () => {
  it('offers a template-only update when loopengine is current but create-loopengine is newer', async () => {
    project()
    setUpgradeRunner(fakeRunner({ latest: loopengineVersion(), latestTemplate: '0.0.2', upgrade: 'ok' }))
    expect(await describeUpgrade(dir)).toMatchObject({ updateAvailable: true, templateUpdateAvailable: true, templateVersion: '0.0.1', latestTemplate: '0.0.2' })
    setUpgradeRunner(fakeRunner({ latest: loopengineVersion(), latestTemplate: '0.0.1', upgrade: 'ok' }))
    expect(await describeUpgrade(dir)).toMatchObject({ updateAvailable: false, templateUpdateAvailable: false })
    setUpgradeRunner(fakeRunner({ latest: '99.0.0', latestTemplate: '0.0.2', upgrade: 'ok' }))
    expect(await describeUpgrade(dir)).toMatchObject({ updateAvailable: true, templateUpdateAvailable: false })
  })

  it('remembers what npm said for a minute, and Check again asks it anew', async () => {
    project()
    let latest = '1.0.0'
    const run = fakeRunner({ latest: '1.0.0', upgrade: 'ok' })
    setUpgradeRunner(async (cmd, args, cwd) => (cmd === 'npm' && args[0] === 'view' ? `${args[1] === 'create-loopengine' ? '0.0.1' : latest}\n` : run(cmd, args, cwd)))
    const first = await describeUpgrade(dir)
    expect(first.latest).toBe('1.0.0')
    expect(first.checkedAt).toMatch(/^\d{4}-/)
    latest = '1.0.1'
    expect((await describeUpgrade(dir)).latest).toBe('1.0.0')
    expect((await describeUpgrade(dir, { refresh: true })).latest).toBe('1.0.1')
  })

  it('compares the installed version with npm and needs a create-loopengine project', async () => {
    project()
    setUpgradeRunner(fakeRunner({ latest: '99.0.0', upgrade: 'ok' }))
    expect(await describeUpgrade(dir)).toMatchObject({ current: loopengineVersion(), latest: '99.0.0', updateAvailable: true, templateVersion: '0.0.1' })
    setUpgradeRunner(fakeRunner({ latest: loopengineVersion(), upgrade: 'ok' }))
    expect((await describeUpgrade(dir)).updateAvailable).toBe(false)
    rmSync(join(dir, '.create-loopengine.json'))
    expect((await describeUpgrade(dir)).unavailableReason).toMatch(/not made by create-loopengine/)
  })
})

describe('runUpgrade', () => {
  it('runs create-loopengine upgrade without conflict markers, keeps data, and marks the upgrade pending', async () => {
    project()
    setUpgradeRunner(fakeRunner({ latest: '99.0.0', upgrade: 'ok' }))
    const outcome = await runUpgrade({ busy: () => false, projectDir: dir })
    expect(calls).toContain('npx -y create-loopengine@latest upgrade --json --keep-edited')
    expect(outcome.files).toContainEqual({ file: 'agent-registry.ts', status: 'kept' })
    expect(readFileSync(join(dir, 'adapters', 'http.ts'), 'utf8')).toBe('new http\n')
    expect(readFileSync(join(dir, '.sessions', 'conversation.json'), 'utf8')).toBe('history')
    expect(readFileSync(join(dir, '.env'), 'utf8')).toBe('OPENAI_API_KEY=sk-keep-me\n')
    const pending = readFileSync(join(dir, '.upgrade-backups', 'pending'), 'utf8').trim()
    expect(readFileSync(join(dir, '.upgrade-backups', pending, 'adapters', 'http.ts'), 'utf8')).toBe('old http\n')
  })

  it('puts every file back when installing fails, or the upgrade errors or crashes', async () => {
    for (const upgrade of ['install-failed', 'error', 'crash'] as const) {
      rmSync(dir, { recursive: true, force: true })
      mkdirSync(dir)
      project()
      setUpgradeRunner(fakeRunner({ latest: '99.0.0', upgrade }))
      await expect(runUpgrade({ busy: () => false, projectDir: dir })).rejects.toThrow(UpgradeError)
      expect(readFileSync(join(dir, 'adapters', 'http.ts'), 'utf8')).toBe('old http\n')
      expect(readFileSync(join(dir, 'package.json'), 'utf8')).toContain('^0.0.1')
      expect(existsSync(join(dir, '.upgrade-backups', 'pending'))).toBe(false)
    }
    // The restore's reinstall keeps devDependencies (tsx) under NODE_ENV=production.
    expect(calls).toContain('npm install --include=dev --no-audit --no-fund')
  })

  it('refuses while an agent is busy, or for a project not made by create-loopengine', async () => {
    project()
    setUpgradeRunner(fakeRunner({ latest: '99.0.0', upgrade: 'ok' }))
    await expect(runUpgrade({ busy: () => true, projectDir: dir })).rejects.toThrow(/replying/)
    rmSync(join(dir, '.create-loopengine.json'))
    await expect(runUpgrade({ busy: () => false, projectDir: dir })).rejects.toThrow(/by hand/)
    expect(calls.some((c) => c.startsWith('npx'))).toBe(false)
  })
})
