// Backs the console's Upgrade button (Settings section): updates a
// create-loopengine project in place to the latest loopengine and
// template, the same as running `npx create-loopengine@latest upgrade`
// by hand, then the server restarts itself on the new code.
//
// Only template-owned files (adapters/, agent-registry.ts, tsconfig.json,
// .gitignore) and package.json change. Agents, abilities, conversations
// (.sessions/), approvals (.checkpoints/), schedules (.scheduler/) and
// every .env are never touched. A template file the project edited is
// left exactly as it was (`--keep-edited`), so an unattended upgrade can
// never leave conflict markers that stop the server from starting. The
// files it may change are backed up first and restored if it fails.
// Every npm install here passes --include=dev: with NODE_ENV=production
// npm would drop devDependencies, and an older project still lists tsx,
// which runs it, as one.
import { execFile } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import semver from 'semver'
import { loopengineVersion } from '../core/version.js'

/** Everything `create-loopengine upgrade` may rewrite. */
const UPGRADED_FILES = ['adapters/http.ts', 'adapters/cli.ts', 'agent-registry.ts', 'tsconfig.json', '.gitignore', 'package.json', 'package-lock.json', '.create-loopengine.json']
const BACKUP_DIR = '.upgrade-backups'
const KEEP_BACKUPS = 3

export class UpgradeError extends Error {}

export interface UpgradeStatus {
  current: string
  /** Latest loopengine on npm; null when npm couldn't be reached. */
  latest: string | null
  updateAvailable: boolean
  /** The create-loopengine version this project was scaffolded or last
   * upgraded from (.create-loopengine.json); null when the project
   * wasn't made by create-loopengine, which the button can't upgrade. */
  templateVersion: string | null
  /** Why the button is off, when it is. */
  unavailableReason?: string
  running: boolean
}

export interface UpgradeOutcome {
  fromVersion: string
  toVersion: string
  files: { file: string; status: string }[]
  dependencies: { name: string; from: string; to: string }[]
}

type Runner = (cmd: string, args: string[], cwd: string, timeoutMs: number) => Promise<string>

function realRun(cmd: string, args: string[], cwd: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { cwd, timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024, env: process.env }, (err, stdout, stderr) => {
      if (err) reject(Object.assign(err, { stdout: String(stdout), stderr: String(stderr) }))
      else resolve(String(stdout))
    })
  })
}

let run: Runner = realRun

/** Tests replace npm/npx with a fake. */
export function setUpgradeRunner(next: Runner | undefined): void {
  run = next ?? realRun
  latestCache = undefined
}

let latestCache: { value: string | null; until: number } | undefined

async function latestLoopengine(projectDir: string): Promise<string | null> {
  if (latestCache && latestCache.until > Date.now()) return latestCache.value
  let value: string | null = null
  try {
    value = (await run('npm', ['view', 'loopengine', 'version'], projectDir, 15_000)).trim() || null
  } catch {
    value = null
  }
  latestCache = { value, until: Date.now() + (value ? 10 * 60_000 : 60_000) }
  return value
}

function templateVersion(projectDir: string): string | null {
  const path = join(projectDir, '.create-loopengine.json')
  if (!existsSync(path)) return null
  try {
    return (JSON.parse(readFileSync(path, 'utf8')) as { version?: string }).version ?? null
  } catch {
    return null
  }
}

let running = false

export async function describeUpgrade(projectDir = process.cwd()): Promise<UpgradeStatus> {
  const current = loopengineVersion()
  const latest = await latestLoopengine(projectDir)
  const template = templateVersion(projectDir)
  const status: UpgradeStatus = {
    current,
    latest,
    updateAvailable: Boolean(latest && semver.valid(current) && semver.gt(latest, current)),
    templateVersion: template,
    running,
  }
  if (!template) status.unavailableReason = 'This project has no .create-loopengine.json, so it was not made by create-loopengine; upgrade it by hand.'
  else if (!latest) status.unavailableReason = 'Could not reach npm to check for a newer version.'
  return status
}

function backup(projectDir: string): string {
  const dir = join(projectDir, BACKUP_DIR, new Date().toISOString().replace(/[:.]/g, '-'))
  for (const file of UPGRADED_FILES) {
    const from = join(projectDir, file)
    if (!existsSync(from)) continue
    mkdirSync(dirname(join(dir, file)), { recursive: true })
    copyFileSync(from, join(dir, file))
  }
  // Keep the newest few.
  const all = readdirSync(join(projectDir, BACKUP_DIR)).filter((name) => name !== 'pending').sort()
  for (const old of all.slice(0, Math.max(0, all.length - KEEP_BACKUPS))) rmSync(join(projectDir, BACKUP_DIR, old), { recursive: true, force: true })
  return dir
}

function restore(projectDir: string, dir: string): void {
  for (const file of UPGRADED_FILES) {
    const saved = join(dir, file)
    if (existsSync(saved)) copyFileSync(saved, join(projectDir, file))
  }
}

/**
 * Runs the upgrade. `busy` is checked first: upgrading under a running
 * chat turn or scheduled run would restart the server mid-reply. Resolves
 * with what changed; throws UpgradeError (with everything restored) when
 * it couldn't finish.
 */
export async function runUpgrade(options: { busy: () => boolean; projectDir?: string }): Promise<UpgradeOutcome> {
  const projectDir = options.projectDir ?? process.cwd()
  if (running) throw new UpgradeError('An upgrade is already running.')
  if (options.busy()) throw new UpgradeError('An agent is replying or a scheduled task is running; try again when it finishes.')
  if (!templateVersion(projectDir)) throw new UpgradeError('This project was not made by create-loopengine, so it can only be upgraded by hand.')

  running = true
  const saved = backup(projectDir)
  try {
    let stdout: string
    try {
      stdout = await run('npx', ['-y', 'create-loopengine@latest', 'upgrade', '--json', '--keep-edited'], projectDir, 10 * 60_000)
    } catch (err) {
      stdout = (err as { stdout?: string }).stdout ?? ''
      if (!stdout.trim()) throw new UpgradeError(`The upgrade could not run: ${err instanceof Error ? err.message.split('\n')[0] : String(err)}`)
    }
    const line = stdout.trim().split('\n').pop() ?? ''
    let result: UpgradeOutcome & { error?: string; npmInstall?: { ok: boolean; error?: string } }
    try {
      result = JSON.parse(line)
    } catch {
      throw new UpgradeError('The upgrade returned something unexpected; nothing was changed.')
    }
    if (result.error) throw new UpgradeError(result.error)
    if (result.npmInstall && !result.npmInstall.ok) throw new UpgradeError(`Installing the new packages failed: ${result.npmInstall.error ?? 'unknown error'}`)
    // package.json may already allow the latest version while an older
    // one stays installed (the lockfile keeps it); install it outright.
    const latest = await latestLoopengine(projectDir)
    const current = loopengineVersion()
    if (latest && semver.valid(current) && semver.gt(latest, current) && !result.dependencies.some((d) => d.name === 'loopengine')) {
      try {
        await run('npm', ['install', '--include=dev', '--no-audit', '--no-fund', `loopengine@^${latest}`], projectDir, 10 * 60_000)
      } catch (err) {
        throw new UpgradeError(`Installing loopengine ${latest} failed: ${err instanceof Error ? err.message.split('\n')[0] : String(err)}`)
      }
      result.dependencies.push({ name: 'loopengine', from: current, to: `^${latest}` })
    }
    // Lets the workspace's start script put the backup back if the new
    // code can't start (see loopengine-cloud's entrypoint); removed by it
    // once the new version has stayed up.
    writeFileSync(join(projectDir, BACKUP_DIR, 'pending'), basename(saved) + '\n')
    latestCache = undefined
    return { fromVersion: result.fromVersion, toVersion: result.toVersion, files: result.files, dependencies: result.dependencies }
  } catch (err) {
    restore(projectDir, saved)
    // package.json is back; put node_modules back in line with it.
    await run('npm', ['install', '--include=dev', '--no-audit', '--no-fund'], projectDir, 10 * 60_000).catch(() => {})
    throw err instanceof UpgradeError ? err : new UpgradeError(err instanceof Error ? err.message : String(err))
  } finally {
    running = false
  }
}
