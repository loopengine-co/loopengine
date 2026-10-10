// Per-agent environment for tools (ToolContext.env — see
// core/agent-config.ts). One project shares a single .env/process.env,
// but several agents can install the same ability and each need their
// own value for some of its settings (a Telegram bot token, a default
// chat ID). Rather than every ability's tool code deriving a prefixed
// name (`<AGENT>_<VAR>`) itself, the runtime resolves it here, from the
// agent's own values (agents/<name>/.env by default — see
// core/secret-store.ts) layered over the project's own.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { AgentConfig, AgentEnv } from '#core/agent-config.js'
import { agentDir } from './gateway-tools.js'
import { agentEnvFilePath, getSecretStore } from './secret-store.js'

/** How a declared ability env var (AbilityEnvDecl.scope) is shared
 * across the agents that install the ability:
 * - `shared`: one project-wide value, from the project .env only.
 * - `overridable`: an agent may set its own value; falls back to the
 *   shared one when it doesn't.
 * - `agent`: every agent must set its own; never falls back, so an agent
 *   that hasn't set it gets a clear error instead of silently borrowing
 *   another agent's value (e.g. a bot token, which decides *who* the
 *   agent speaks as). */
export type EnvScope = 'shared' | 'overridable' | 'agent'

/** `perAgent: true` predates `scope` and means exactly `overridable` —
 * still accepted so abilities published before `scope` existed keep
 * working unchanged. */
export function envScopeOf(decl: { scope?: EnvScope; perAgent?: boolean }): EnvScope {
  return decl.scope ?? (decl.perAgent ? 'overridable' : 'shared')
}

/** The pre-`scope` per-agent override name — `<AGENT_NAME>_<varName>`,
 * `agentName` upper-cased with anything outside `[A-Z0-9_]` turned into
 * `_`, prefixed with one more `_` if that would start with a digit.
 * Still read as a fallback by createAgentEnv (an agent's own .env wins
 * over it) so a project already configured this way keeps working. */
export function agentScopedEnvVarName(agentName: string, varName: string): string {
  const prefix = agentName.toUpperCase().replace(/[^A-Z0-9_]/g, '_')
  return `${/^[0-9]/.test(prefix) ? '_' : ''}${prefix}_${varName}`
}

/** Every env var name an ability installed in `dir` declared as
 * `scope: 'agent'` — the ones createAgentEnv must never fall back to the
 * project-wide value for. */
function agentOnlyVarNames(dir: string): Set<string> {
  const path = join(dir, '.loopengine-abilities.json')
  const names = new Set<string>()
  if (!existsSync(path)) return names
  const provenance = JSON.parse(readFileSync(path, 'utf8')) as Record<string, { env?: { name: string; scope?: EnvScope; perAgent?: boolean }[] }>
  for (const record of Object.values(provenance)) {
    for (const decl of record.env ?? []) {
      if (envScopeOf(decl) === 'agent') names.add(decl.name)
    }
  }
  return names
}

// A subagent's config only carries its bare name, not the nested
// agents/<parent>/subagents/<child>/ folder it was loaded from (see
// run-agent.ts's resolveSubagentConfig) — that function records the
// real folder here so its tools read *its* .env, not a same-named
// top-level agent's. Keyed by object identity: agentAsTool hands the
// exact same config object on to runAgent.
const agentDirs = new WeakMap<AgentConfig, string>()

export function setAgentDir(config: AgentConfig, dir: string): void {
  agentDirs.set(config, dir)
}

export function agentDirFor(config: AgentConfig): string {
  return agentDirs.get(config) ?? agentDir(config.name)
}

/** Lookup order for `get(name)`:
 * 1. `name` among this agent's own values (the secret store's
 *    readAgentValues — `<dir>/.env` by default)
 * 2. the legacy prefixed project var (agentScopedEnvVarName)
 * 3. `process.env[name]` — skipped when an installed ability declared
 *    `name` with `scope: 'agent'`
 * An undeclared name (a hand-written tool's own var) goes through the
 * same order, so it can be overridden per agent too. */
export function createAgentEnv(agentName: string, dir: string): AgentEnv {
  function get(name: string): string | undefined {
    const own = getSecretStore().readAgentValues(agentName, dir)[name]
    if (own !== undefined) return own
    const legacy = process.env[agentScopedEnvVarName(agentName, name)]
    if (legacy !== undefined) return legacy
    if (agentOnlyVarNames(dir).has(name)) return undefined
    return process.env[name]
  }
  return {
    get,
    require(name) {
      const value = get(name)
      if (value === undefined) {
        throw new Error(`${name} is not set for agent '${agentName}' — set it in the Admin UI's Environment tab, or in ${agentEnvFilePath(dir)}.`)
      }
      return value
    },
  }
}
