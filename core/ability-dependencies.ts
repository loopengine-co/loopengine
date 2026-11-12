// The npm packages installed abilities' tools import. Installing an
// ability copies only its own files (bin/ability-manager.ts), recording
// the packages it needs in agents/<name>/.loopengine-abilities.json; a
// package that never got installed breaks loading the agent ("Cannot find
// package 'twitter-api-v2'"), and an agent that imports its tools up front
// stops the whole server from starting. So loading agents installs what's
// missing first (discoverAgents), and so does the console after an install.
import { execFile } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const NPM_INSTALL_TIMEOUT_MS = 180_000
// An npm package name, so nothing in a record can pass as an npm option.
const PACKAGE_NAME = /^(@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/

/** The packages the abilities installed under `agentsDir` need, from
 * their records. */
export function abilityDependencies(agentsDir: string): string[] {
  const deps = new Set<string>()
  let names: string[]
  try {
    names = readdirSync(agentsDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
  } catch {
    return []
  }
  for (const name of names) {
    try {
      const records = JSON.parse(readFileSync(join(agentsDir, name, '.loopengine-abilities.json'), 'utf8')) as Record<string, { dependencies?: unknown }>
      for (const record of Object.values(records)) {
        if (Array.isArray(record?.dependencies)) for (const dep of record.dependencies) if (typeof dep === 'string') deps.add(dep)
      }
    } catch {
      // No abilities, or a record that can't be read.
    }
  }
  return [...deps]
}

/** Installs whichever of `packages` the project at `projectDir` doesn't
 * have. Returns the ones it installed. */
export async function installMissingPackages(projectDir: string, packages: string[]): Promise<string[]> {
  const missing = [...new Set(packages)].filter((p) => PACKAGE_NAME.test(p) && !existsSync(join(projectDir, 'node_modules', p)))
  if (!missing.length) return []
  // --include=dev: under NODE_ENV=production npm would otherwise drop
  // devDependencies, including tsx, which runs the project.
  await execFileAsync('npm', ['install', '--include=dev', '--no-audit', '--no-fund', ...missing], { cwd: projectDir, timeout: NPM_INSTALL_TIMEOUT_MS })
  return missing
}

/** Installs the packages abilities under `agentsDir` need and the project
 * (its parent) lacks. Never throws: a failure is logged, and the agent
 * that needs the package then fails with its own error. */
export async function installMissingAbilityDependencies(agentsDir: string): Promise<string[]> {
  try {
    const installed = await installMissingPackages(dirname(agentsDir), abilityDependencies(agentsDir))
    if (installed.length) console.log(`[loopengine] installed packages abilities need: ${installed.join(', ')}`)
    return installed
  } catch (err) {
    const message = err && typeof err === 'object' && 'stderr' in err && String((err as { stderr: unknown }).stderr).trim() ? String((err as { stderr: unknown }).stderr).trim() : err instanceof Error ? err.message : String(err)
    console.error(`[loopengine] installing packages abilities need failed: ${message.slice(0, 500)}`)
    return []
  }
}
