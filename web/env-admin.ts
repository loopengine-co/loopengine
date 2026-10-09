// Backs the Admin UI's "Environment" section — every env var an ability
// (see ABILITIES.md, bin/ability-manager.ts) declared as required,
// across every ability installed for an agent, with set/not-set status
// and, for a non-secret var, its live value (so an operator can actually
// tell what's configured, not just that something is). A value marked
// `secret` is never echoed back once set — same never-echo-a-secret rule
// web/http-tool-admin.ts's own `{{ENV_VAR}}` header handling already
// establishes for a tool's own secrets.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { agentDir } from '../core/gateway-tools.js'
import { agentEnvFilePath, agentScopedEnvVarName, envScopeOf, readAgentEnvFile, type EnvScope } from '../core/agent-env.js'
import type { AbilityEnvDecl, InstalledAbilityRecord } from '../bin/ability-manager.js'

export { agentScopedEnvVarName }

export class EnvVarNameError extends Error {}

// Same shape web/http-tool-admin.ts's own ENV_VAR_PATTERN already
// validates a {{ENV_VAR}} header reference against.
const ENV_VAR_NAME_PATTERN = /^[A-Z_][A-Z0-9_]*$/

export interface DeclaredEnvVar {
  name: string
  description?: string
  /** Which value this row reads and writes: `shared` = the project
   * .env, `agent` = this agent's own agents/<name>/.env. A var declared
   * `overridable` gets one row of each; `agent` only the agent row. */
  slot: 'shared' | 'agent'
  /** The scope the declaring ability gave this var (see
   * core/agent-env.ts's EnvScope) — the strictest one when more than
   * one ability declares it. */
  scope: EnvScope
  /** Agent rows only, when set: `agent` = from agents/<name>/.env,
   * `legacy` = from the older prefixed project var named `legacyName`
   * (see agentScopedEnvVarName), still honored until replaced. */
  source?: 'agent' | 'legacy'
  legacyName?: string
  secret: boolean
  /** Every ability that declares this name, in install order — usually
   * one, but see listDeclaredEnvVars's own doc comment for why this is
   * an array, not a single name. */
  abilityNames: string[]
  set: boolean
  /** The live value, but only when `secret` is false — a secret is never
   * echoed back once set, same rule this file's own top comment and
   * web/http-tool-admin.ts's `{{ENV_VAR}}` header handling already
   * follow. Undefined whenever `secret` is true or `set` is false. */
  value?: string
  /** A closed set of valid values (see AbilityEnvDecl.options) — present
   * only when the declaring ability actually named one; the Admin UI
   * renders a dropdown instead of a free-text field when this is set. */
  options?: string[]
  /** True for a naturally multi-line value (see AbilityEnvDecl.multiline)
   * — the Admin UI renders a <textarea> instead of a single-line
   * <input>, which strips embedded line breaks entirely per the HTML
   * spec's own value sanitization. */
  multiline?: boolean
}

function provenancePath(agentName: string): string {
  return join(agentDir(agentName), '.loopengine-abilities.json')
}

const SCOPE_STRICTNESS: Record<EnvScope, number> = { shared: 0, overridable: 1, agent: 2 }

/** Every env var any ability installed for `agentName` declared it
 * needs, merged by name — one row per slot it can be set in (see
 * DeclaredEnvVar.slot): a `shared` row for the project .env, an `agent`
 * row for this agent's own .env when the var's scope allows one. There's
 * one shared .env per *project*, not per ability, so this can't actually resolve a genuine cross-ability
 * name collision (two abilities declaring, say, "API_KEY" for two
 * unrelated services still both read whichever single value ends up
 * set — there is no per-ability slot to give them) — unlike a tool or
 * skill name collision (see ability-manager.ts's namespacedToolName/
 * namespacedSkillId), an env var name is a literal `process.env.X`
 * reference baked into the ability's own code, not a label loopengine's
 * own generated glue controls, so there's nothing here to safely rename.
 * What this *can* do, and used to not: surface every ability that
 * declares a given name (`abilityNames`, plural) instead of silently
 * keeping only the first one seen and hiding the rest — turns a
 * collision from invisible into something a human looking at the
 * Environment tab can actually notice and judge (a real conflict
 * needing one ability's own env var renamed, or a coincidence that's
 * actually fine because both intentionally share one real credential).
 * `secret` is true if *any* declaring ability marked it secret — the
 * safer default, since treating a real secret as non-secret because a
 * different ability's own declaration happened to be checked first
 * would be the one direction genuinely worth avoiding. `set` is read
 * live (process.env for a shared row, the agent's own .env file for an
 * agent row), not cached. */
export function listDeclaredEnvVars(agentName: string): DeclaredEnvVar[] {
  const path = provenancePath(agentName)
  if (!existsSync(path)) return []

  const provenance = JSON.parse(readFileSync(path, 'utf8')) as Record<string, InstalledAbilityRecord>
  const agentValues = readAgentEnvFile(agentDir(agentName))
  const rows = new Map<string, DeclaredEnvVar>()

  function upsert(slot: 'shared' | 'agent', abilityName: string, decl: AbilityEnvDecl, description: string | undefined): void {
    const scope = envScopeOf(decl)
    const key = `${slot}:${decl.name}`
    const existing = rows.get(key)
    if (existing) {
      existing.abilityNames.push(abilityName)
      existing.secret = existing.secret || decl.secret === true
      if (existing.secret) existing.value = undefined
      if (SCOPE_STRICTNESS[scope] > SCOPE_STRICTNESS[existing.scope]) existing.scope = scope
      return
    }

    let rawValue: string | undefined
    let source: DeclaredEnvVar['source']
    let legacyName: string | undefined
    if (slot === 'shared') {
      rawValue = process.env[decl.name]
    } else if (agentValues[decl.name] !== undefined) {
      rawValue = agentValues[decl.name]
      source = 'agent'
    } else {
      const legacy = agentScopedEnvVarName(agentName, decl.name)
      rawValue = process.env[legacy]
      if (rawValue !== undefined) {
        source = 'legacy'
        legacyName = legacy
      }
    }

    rows.set(key, {
      name: decl.name,
      description,
      slot,
      scope,
      source,
      legacyName,
      secret: decl.secret === true,
      abilityNames: [abilityName],
      set: rawValue !== undefined,
      value: decl.secret === true ? undefined : rawValue,
      options: decl.options,
      multiline: decl.multiline,
    })
  }

  for (const [abilityName, record] of Object.entries(provenance)) {
    for (const decl of record.env) {
      const scope = envScopeOf(decl)
      if (scope !== 'agent') upsert('shared', abilityName, decl, decl.description)
      if (scope === 'overridable') {
        upsert('agent', abilityName, decl, `This agent's own value — if unset, falls back to the shared value.${decl.description ? ` ${decl.description}` : ''}`)
      } else if (scope === 'agent') {
        upsert('agent', abilityName, decl, `Set per agent — never shared with or borrowed from other agents.${decl.description ? ` ${decl.description}` : ''}`)
      }
    }
  }

  // A name that's `agent`-scoped by any declaring ability is never read
  // from the shared slot (core/agent-env.ts's createAgentEnv), so a
  // shared row for it would only mislead.
  for (const [key, row] of rows) {
    if (row.slot === 'shared' && rows.get(`agent:${row.name}`)?.scope === 'agent') rows.delete(key)
  }
  return [...rows.values()]
}

// process.cwd(), matching exactly where bin/cli.ts's own runTsx passes
// --env-file-if-exists=.env (Node's own --env-file resolves relative to
// cwd too) — not core/agent-registry.ts's projectDir(), which resolves
// relative to *that compiled file's own location* and would point at
// node_modules/loopengine/dist/ in a real scaffolded project, not the
// project's own root where .env actually lives.
function envFilePath(): string {
  return join(process.cwd(), '.env')
}

// Node's own --env-file parser (what bin/cli.ts's runTsx already passes
// as --env-file-if-exists=.env) needs a value containing whitespace, '#',
// or a quote character quoted, so it reads back as one value instead of
// being reinterpreted as a comment or truncated at the first space.
// Single-quoting wins over double — confirmed live against Node's actual
// parser that a single-quoted value reads back fully literally, with no
// backslash-escape processing inside it at all: a real embedded newline,
// a literal double-quote, or a literal backslash (a JSON secret like
// GOOGLE_APPLICATION_CREDENTIALS_JSON has all three at once) all survive
// untouched. Double-quoting a value with an *escaped* embedded quote does
// NOT round-trip — confirmed live that Node's parser has no support for
// \" as an escaped literal quote inside a double-quoted value; it just
// ends the value there instead (`X="a\"b"` reads back as only `a\`,
// silently dropping `b"` entirely). The double-quote fallback below is
// only reached when the value itself contains a literal single quote —
// the one character single-quoting can't represent at all.
function serializeEnvValue(value: string): string {
  if (!/[\s#"'\\]/.test(value) && value !== '') return value
  if (!value.includes("'")) return `'${value}'`
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

function assertEnvVarName(name: string): void {
  if (!ENV_VAR_NAME_PATTERN.test(name)) {
    throw new EnvVarNameError(`"${name}" isn't a valid env var name (uppercase letters, digits, underscore, not starting with a digit).`)
  }
}

/** Upserts `NAME=VALUE` into the .env file at `path`, preserving every
 * other line (comments, blank lines, unrelated keys). */
function upsertEnvFileLine(path: string, name: string, value: string): void {
  const lines = existsSync(path) ? readFileSync(path, 'utf8').split('\n') : []
  const newLine = `${name}=${serializeEnvValue(value)}`

  const existingIndex = lines.findIndex((line) => line.startsWith(`${name}=`))
  if (existingIndex === -1) {
    // Drop a single trailing blank line (from the file's own final
    // newline splitting into an empty last element) before appending,
    // so this doesn't accumulate a growing gap of blank lines across
    // repeated calls.
    if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
    lines.push(newLine)
  } else {
    lines[existingIndex] = newLine
  }

  writeFileSync(path, lines.join('\n') + '\n')
}

/** Removes NAME= from the .env file at `path`, if present. Only
 * rewrites the file when something actually changed — a no-op removal
 * shouldn't still touch the file's own mtime/trailing-newline shape for
 * no reason. */
function removeEnvFileLine(path: string, name: string): void {
  if (!existsSync(path)) return
  const lines = readFileSync(path, 'utf8').split('\n')
  const filtered = lines.filter((line) => !line.startsWith(`${name}=`))
  if (filtered.length !== lines.length) writeFileSync(path, filtered.join('\n').replace(/\n*$/, '\n'))
}

/** Upserts `NAME=VALUE` into the project's `.env` file and applies it to
 * *this* running process immediately via `process.env`, so a
 * newly-installed ability's tools work without a restart. Callers (the
 * PUT route in adapters/http.ts) are responsible for refusing to call
 * this at all when `LOOPENGINE_ADMIN_AUTH` isn't set — this function
 * itself has no notion of HTTP auth, it just writes. */
export function setEnvVar(name: string, value: string): void {
  assertEnvVarName(name)
  upsertEnvFileLine(envFilePath(), name, value)
  process.env[name] = value
}

/** Removes NAME= entirely from the project's .env file (not just
 * blanking its value — an empty string is itself a real, distinct
 * value some vars would treat differently from "unset," e.g. falling
 * through to a default only when truly absent) and clears it from
 * *this* running process's own process.env immediately, the same
 * "no restart needed" promise setEnvVar already makes. A no-op,
 * not an error, when the var was never set in .env to begin with —
 * the end state ("not set") is identical either way. */
export function unsetEnvVar(name: string): void {
  assertEnvVarName(name)
  removeEnvFileLine(envFilePath(), name)
  delete process.env[name]
}

/** Upserts `NAME=VALUE` into `agentName`'s own agents/<name>/.env — read
 * by that agent's tools through ToolContext.env (core/agent-env.ts),
 * which reads the file fresh on every lookup, so no restart is needed.
 * Deliberately never copied into process.env: that's shared by every
 * agent in the process, which is exactly what a per-agent value must
 * not be. Same auth responsibility for callers as setEnvVar. */
export function setAgentEnvVar(agentName: string, name: string, value: string): void {
  assertEnvVarName(name)
  upsertEnvFileLine(agentEnvFilePath(agentDir(agentName)), name, value)
}

/** Removes NAME= from `agentName`'s own .env — and the legacy prefixed
 * project var for it too (see agentScopedEnvVarName), since createAgentEnv
 * still falls back to that one, and "Remove" on this agent's row should
 * leave the agent with no value of its own either way. */
export function unsetAgentEnvVar(agentName: string, name: string): void {
  assertEnvVarName(name)
  removeEnvFileLine(agentEnvFilePath(agentDir(agentName)), name)
  unsetEnvVar(agentScopedEnvVarName(agentName, name))
}
