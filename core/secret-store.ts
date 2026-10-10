// Where env var values set through the Admin UI (web/env-admin.ts) are
// persisted, and where an agent's own values (ToolContext.env — see
// core/agent-env.ts) are read from. The default, FileSecretStore, is the
// project's .env plus each agent's agents/<name>/.env — exactly what a
// self-hosted install has always used. A host that keeps secrets
// somewhere else (a hosted control plane's vault, Vault, a cloud secret
// manager) swaps it in once at startup with setSecretStore().
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseEnv } from 'node:util'

export interface SecretStore {
  /** Every value set for this one agent (its own, not the shared ones).
   * Synchronous because ToolContext.env.get is — a store backed by a
   * remote service should keep an in-memory copy and return that. */
  readAgentValues(agentName: string, dir: string): Record<string, string>
  /** Persist a project-wide value. The caller (web/env-admin.ts) applies
   * it to process.env afterwards, so a store doesn't need to. */
  setShared(name: string, value: string): void | Promise<void>
  unsetShared(name: string): void | Promise<void>
  setAgent(agentName: string, dir: string, name: string, value: string): void | Promise<void>
  unsetAgent(agentName: string, dir: string, name: string): void | Promise<void>
}

export function agentEnvFilePath(dir: string): string {
  return join(dir, '.env')
}

/** Parsed with Node's own --env-file parser (util.parseEnv), so a value
 * serializeEnvValue writes reads back exactly the way it does from the
 * project .env. Read fresh on every call, not cached — it's a few lines,
 * read at most a handful of times per tool call, and this way an edit
 * (from the Admin UI or by hand) is seen immediately. */
export function readAgentEnvFile(dir: string): Record<string, string> {
  const path = agentEnvFilePath(dir)
  if (!existsSync(path)) return {}
  return parseEnv(readFileSync(path, 'utf8')) as Record<string, string>
}

// process.cwd(), matching exactly where bin/cli.ts's own runTsx passes
// --env-file-if-exists=.env (Node's own --env-file resolves relative to
// cwd too) — not core/agent-registry.ts's projectDir(), which resolves
// relative to *that compiled file's own location* and would point at
// node_modules/loopengine/dist/ in a real scaffolded project, not the
// project's own root where .env actually lives.
function projectEnvFilePath(): string {
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

/** The project's .env for shared values, agents/<name>/.env for each
 * agent's own — the default, and what every self-hosted install uses. */
export class FileSecretStore implements SecretStore {
  readAgentValues(_agentName: string, dir: string): Record<string, string> {
    return readAgentEnvFile(dir)
  }
  setShared(name: string, value: string): void {
    upsertEnvFileLine(projectEnvFilePath(), name, value)
  }
  unsetShared(name: string): void {
    removeEnvFileLine(projectEnvFilePath(), name)
  }
  setAgent(_agentName: string, dir: string, name: string, value: string): void {
    upsertEnvFileLine(agentEnvFilePath(dir), name, value)
  }
  unsetAgent(_agentName: string, dir: string, name: string): void {
    removeEnvFileLine(agentEnvFilePath(dir), name)
  }
}

let store: SecretStore = new FileSecretStore()

/** Replaces the store for this whole process — call once at startup,
 * before the server handles requests. */
export function setSecretStore(next: SecretStore): void {
  store = next
}

export function getSecretStore(): SecretStore {
  return store
}
