// Abilities whose tools come from an MCP server instead of tool files.
// The ability's loopengine.ability.json carries an `mcp` block (the
// server, how to authenticate, and an allowlist of its tools); its
// actauth rules and skills stay ordinary files, installed the usual way.
// add-ability records the block in the agent's .loopengine-abilities.json;
// at run time loadMcpAbilityTools turns each allowlisted server tool into
// a plain ToolDefinition, so permissions, the planner and the console
// treat it like any other ability tool.
//
// Tool schemas are cached in agents/<name>/.loopengine-mcp-cache.json
// once fetched, so an agent loads without a server round trip; a server
// connection is opened on first use and reused after that.
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport, getDefaultEnvironment } from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import type { AgentEnv, ToolDefinition } from './agent-config.js'
import { createAgentEnv } from './agent-env.js'

/** How the adapter authenticates to a remote server. `key` sends an
 * agent setting as a header (`Authorization: Bearer <value>` by
 * default). OAuth isn't supported yet. */
export type McpAuth = { type: 'none' } | { type: 'key'; env: string; header?: string; prefix?: string }

/** The `mcp` block of loopengine.ability.json. Exactly one of `url`
 * (a remote server) or `command` (a local server, started as a child
 * process) is set. String values in `headers`, `args` and `env` may use
 * `${NAME}` to read an agent setting. */
export interface McpServerManifest {
  url?: string
  /** `streamable-http` (the default) or the older `sse` transport. */
  transport?: 'streamable-http' | 'sse'
  headers?: Record<string, string>
  auth?: McpAuth
  command?: string
  args?: string[]
  env?: Record<string, string>
  /** The server's tool names to expose — nothing else on the server is. */
  tools: string[]
  /** Prefix for the installed tool names (`<prefix>_<tool>`). Defaults to
   * the ability's name without `lp-`. */
  prefix?: string
  /** Longest tool result passed back to the model, in characters. */
  maxOutputChars?: number
  /** Tool inputs filled from the agent's settings when a call leaves them
   * out, e.g. a default repository: `{ "repo": "${GITHUB_REPO}" }`, or a
   * part of one setting, `{ "owner": { "env": "GITHUB_DEFAULT_REPO",
   * "split": "/", "part": 0 } }`. An input with a default is no longer
   * required in the schema the model sees, which says what it defaults to. */
  defaults?: Record<string, McpDefault>
}

export type McpDefault = string | { env: string; split?: string; part?: number }

/** What add-ability records for an MCP ability: the server block, and
 * each installed tool name with the server tool it calls. */
export interface InstalledMcpRecord {
  server: Omit<McpServerManifest, 'tools' | 'prefix'>
  tools: Array<{ name: string; remote: string }>
}

const TOOL_NAME = /^[a-z][a-z0-9_]*$/
const DEFAULT_MAX_OUTPUT_CHARS = 20000

export class McpManifestError extends Error {}

/** Checks an ability's `mcp` block and works out its installed tool
 * names. Throws McpManifestError on anything unusable, so a bad
 * manifest fails at add-ability, not on the agent's first run. */
export function resolveMcpManifest(abilityName: string, mcp: unknown): InstalledMcpRecord {
  if (!mcp || typeof mcp !== 'object') throw new McpManifestError(`'mcp' must be an object.`)
  const m = mcp as McpServerManifest
  if (!!m.url === !!m.command) throw new McpManifestError(`'mcp' needs exactly one of 'url' (a remote server) or 'command' (a local one).`)
  if (m.url) {
    let parsed: URL
    try {
      parsed = new URL(m.url)
    } catch {
      throw new McpManifestError(`'mcp.url' isn't a valid URL: ${m.url}`)
    }
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)
    if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && local)) {
      throw new McpManifestError(`'mcp.url' must be https (http is only allowed for localhost).`)
    }
  }
  if (m.transport && m.transport !== 'streamable-http' && m.transport !== 'sse') throw new McpManifestError(`'mcp.transport' must be 'streamable-http' or 'sse'.`)
  if (m.auth && m.auth.type !== 'none' && m.auth.type !== 'key') {
    throw new McpManifestError(`'mcp.auth.type' must be 'none' or 'key' — OAuth isn't supported yet.`)
  }
  if (m.auth?.type === 'key' && !m.auth.env) throw new McpManifestError(`'mcp.auth' of type 'key' needs 'env', the setting that holds the key.`)
  if (m.defaults !== undefined) {
    const ok = m.defaults && typeof m.defaults === 'object' && Object.values(m.defaults).every((d) => typeof d === 'string' || (d && typeof d === 'object' && typeof d.env === 'string' && (d.part === undefined || Number.isInteger(d.part))))
    if (!ok) throw new McpManifestError(`'mcp.defaults' maps input names to a "\${SETTING}" string or { env, split?, part? }.`)
  }
  if (!Array.isArray(m.tools) || m.tools.length === 0 || !m.tools.every((t) => typeof t === 'string' && t)) {
    throw new McpManifestError(`'mcp.tools' must list the server tools to expose.`)
  }
  const prefix = m.prefix ?? abilityName.replace(/^@[^/]+\//, '').replace(/^lp-/, '')
  const tools = m.tools.map((remote) => ({ name: mcpToolName(prefix, remote), remote }))
  const seen = new Set<string>()
  for (const tool of tools) {
    if (!TOOL_NAME.test(tool.name)) throw new McpManifestError(`'${tool.remote}' doesn't make a valid tool name (got '${tool.name}').`)
    if (seen.has(tool.name)) throw new McpManifestError(`Two tools in 'mcp.tools' both become '${tool.name}'.`)
    seen.add(tool.name)
  }
  const { tools: _tools, prefix: _prefix, ...server } = m
  return { server, tools }
}

/** An installed tool's name: `<prefix>_<tool>` in snake_case, or just the
 * tool's own name when it already carries the prefix as a word
 * (`web_search_exa` stays as is for prefix `exa`). */
export function mcpToolName(prefix: string, remote: string): string {
  const own = snakeCase(remote)
  const p = snakeCase(prefix)
  return p && own.split('_').includes(p) ? own : snakeCase(`${prefix}_${remote}`)
}

function snakeCase(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()
}

// ---- Settings ----

/** `${NAME}` → the agent's setting. A missing setting is an error
 * naming it, so the console's message says exactly what to add. */
function interpolate(value: string, env: AgentEnv): string {
  return value.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_, name: string) => env.require(name))
}

function interpolateAll(values: Record<string, string> | undefined, env: AgentEnv): Record<string, string> {
  return Object.fromEntries(Object.entries(values ?? {}).map(([k, v]) => [k, interpolate(v, env)]))
}

interface ResolvedServer {
  url?: string
  transport?: 'streamable-http' | 'sse'
  headers: Record<string, string>
  command?: string
  args: string[]
  env: Record<string, string>
}

function resolveServer(server: InstalledMcpRecord['server'], env: AgentEnv): ResolvedServer {
  const headers = interpolateAll(server.headers, env)
  if (server.auth?.type === 'key') {
    const header = server.auth.header ?? 'Authorization'
    const prefix = server.auth.prefix ?? (header.toLowerCase() === 'authorization' ? 'Bearer ' : '')
    headers[header] = `${prefix}${env.require(server.auth.env)}`
  }
  return {
    url: server.url,
    transport: server.transport,
    headers,
    command: server.command,
    args: (server.args ?? []).map((a) => interpolate(a, env)),
    env: interpolateAll(server.env, env),
  }
}

// ---- Connections ----

// One client per agent folder, ability and resolved settings — a
// changed key gets a fresh connection instead of reusing the old one.
const clients = new Map<string, Promise<Client>>()

function clientKey(dir: string, abilityName: string, server: ResolvedServer): string {
  return `${dir}\0${abilityName}\0${createHash('sha256').update(JSON.stringify(server)).digest('hex')}`
}

async function connect(server: ResolvedServer): Promise<Client> {
  const client = new Client({ name: 'loopengine', version: '1.0.0' })
  if (server.command) {
    // getDefaultEnvironment is a small safe set (PATH, HOME, ...), not
    // this process's whole environment, so a local server only sees the
    // settings its manifest passes it.
    await client.connect(new StdioClientTransport({ command: server.command, args: server.args, env: { ...getDefaultEnvironment(), ...server.env }, stderr: 'ignore' }))
    return client
  }
  const url = new URL(server.url!)
  const requestInit = { headers: server.headers }
  if (server.transport === 'sse') {
    await client.connect(new SSEClientTransport(url, { requestInit }))
    return client
  }
  await client.connect(new StreamableHTTPClientTransport(url, { requestInit }))
  return client
}

function getClient(dir: string, abilityName: string, server: ResolvedServer): Promise<Client> {
  const key = clientKey(dir, abilityName, server)
  let client = clients.get(key)
  if (!client) {
    client = connect(server)
    clients.set(key, client)
    // A failed connect isn't kept, so the next call tries again.
    client.catch(() => clients.delete(key))
  }
  return client
}

function dropClient(dir: string, abilityName: string, server: ResolvedServer): void {
  const key = clientKey(dir, abilityName, server)
  const client = clients.get(key)
  clients.delete(key)
  client?.then((c) => c.close()).catch(() => {})
}

/** Closes every open server connection (and stops local servers). */
export async function closeMcpConnections(): Promise<void> {
  const open = [...clients.values()]
  clients.clear()
  await Promise.all(open.map((c) => c.then((client) => client.close()).catch(() => {})))
}

/** Whether a connection failed because the server wants (other)
 * credentials: an HTTP 401/403, or the SDK's own UnauthorizedError. */
export function isMcpAuthError(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code
  if (code === 401 || code === 403) return true
  const e = err as { name?: unknown; message?: unknown } | null
  return e?.name === 'UnauthorizedError' || /\b(401|403)\b|unauthori[sz]ed|forbidden/i.test(String(e?.message ?? ''))
}

/** A server tool as listed, for choosing tools before an ability exists. */
export interface McpToolInfo {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  /** The server's own hints (MCP tool annotations), when it gives them. */
  readOnly?: boolean
  destructive?: boolean
}

/** Every tool a server offers, over a one-off connection (closed after).
 * `server` is an `mcp` block without its allowlist; settings in it are
 * read from `env`. */
export async function listMcpServerTools(server: InstalledMcpRecord['server'], env: AgentEnv): Promise<McpToolInfo[]> {
  const client = await connect(resolveServer(server, env))
  try {
    const tools: McpToolInfo[] = []
    let cursor: string | undefined
    do {
      const page = await client.listTools(cursor ? { cursor } : undefined)
      for (const tool of page.tools) {
        const hints = (tool.annotations ?? {}) as { readOnlyHint?: unknown; destructiveHint?: unknown }
        tools.push({
          name: tool.name,
          description: tool.description ?? '',
          inputSchema: tool.inputSchema as Record<string, unknown>,
          ...(typeof hints.readOnlyHint === 'boolean' ? { readOnly: hints.readOnlyHint } : {}),
          ...(typeof hints.destructiveHint === 'boolean' ? { destructive: hints.destructiveHint } : {}),
        })
      }
      cursor = page.nextCursor
    } while (cursor && tools.length < 500)
    return tools
  } finally {
    await client.close().catch(() => {})
  }
}

// ---- Schema cache ----

interface CachedTool {
  description: string
  input_schema: Record<string, unknown>
}

type SchemaCache = Record<string, { version: string; tools: Record<string, CachedTool> }>

function cachePath(dir: string): string {
  return join(dir, '.loopengine-mcp-cache.json')
}

function readCache(dir: string): SchemaCache {
  try {
    return JSON.parse(readFileSync(cachePath(dir), 'utf8')) as SchemaCache
  } catch {
    return {}
  }
}

function writeCache(dir: string, cache: SchemaCache): void {
  writeFileSync(cachePath(dir), JSON.stringify(cache, null, 2) + '\n')
}

/** Drops an ability's cached schemas — add-ability and upgrade-ability
 * call this so a new version's tools are fetched fresh. */
export function clearMcpSchemaCache(dir: string, abilityName: string): void {
  if (!existsSync(cachePath(dir))) return
  const cache = readCache(dir)
  if (!(abilityName in cache)) return
  delete cache[abilityName]
  writeCache(dir, cache)
}

// ---- Loading ----

interface ProvenanceEntry {
  version: string
  mcp?: InstalledMcpRecord
}

/** Why an MCP ability's tools didn't load on the last attempt, by agent
 * folder and ability — e.g. a key that isn't set yet. Cleared once they
 * load. */
const loadErrors = new Map<string, string>()

export function mcpAbilityLoadError(dir: string, abilityName: string): string | undefined {
  return loadErrors.get(`${dir}\0${abilityName}`)
}

/** Every tool of every MCP ability installed in `dir` (an agent's
 * folder). An ability whose schemas aren't cached yet is connected to
 * once to fetch them; if that fails (no key yet, server down) its tools
 * are left out and the reason is kept for mcpAbilityLoadError, rather
 * than failing the whole agent. */
export async function loadMcpAbilityTools(dir: string, agentName: string): Promise<ToolDefinition[]> {
  const provenancePath = join(dir, '.loopengine-abilities.json')
  if (!existsSync(provenancePath)) return []
  let provenance: Record<string, ProvenanceEntry>
  try {
    provenance = JSON.parse(readFileSync(provenancePath, 'utf8')) as Record<string, ProvenanceEntry>
  } catch {
    return []
  }
  const entries = Object.entries(provenance).filter((e): e is [string, ProvenanceEntry & { mcp: InstalledMcpRecord }] => !!e[1].mcp)
  if (entries.length === 0) return []

  const cache = readCache(dir)
  let cacheChanged = false
  const tools: ToolDefinition[] = []
  for (const [abilityName, record] of entries) {
    const errorKey = `${dir}\0${abilityName}`
    let cached = cache[abilityName]?.version === record.version ? cache[abilityName].tools : undefined
    if (!cached || record.mcp.tools.some((t) => !cached![t.remote])) {
      try {
        cached = await fetchSchemas(dir, abilityName, record.mcp, createAgentEnv(agentName, dir))
        cache[abilityName] = { version: record.version, tools: cached }
        cacheChanged = true
      } catch (err) {
        loadErrors.set(errorKey, err instanceof Error ? err.message : String(err))
        continue
      }
    }
    loadErrors.delete(errorKey)
    const env = createAgentEnv(agentName, dir)
    for (const tool of record.mcp.tools) {
      const schema = cached[tool.remote]
      if (schema) tools.push(toolDefinition(dir, abilityName, record.mcp, tool, schema, env))
    }
  }
  if (cacheChanged) writeCache(dir, cache)
  return tools
}

async function fetchSchemas(dir: string, abilityName: string, mcp: InstalledMcpRecord, env: AgentEnv): Promise<Record<string, CachedTool>> {
  const server = resolveServer(mcp.server, env)
  const client = await getClient(dir, abilityName, server)
  const wanted = new Set(mcp.tools.map((t) => t.remote))
  const found: Record<string, CachedTool> = {}
  let cursor: string | undefined
  do {
    const page = await client.listTools(cursor ? { cursor } : undefined)
    for (const tool of page.tools) {
      if (wanted.has(tool.name)) found[tool.name] = { description: tool.description ?? '', input_schema: tool.inputSchema as Record<string, unknown> }
    }
    cursor = page.nextCursor
  } while (cursor)
  const missing = mcp.tools.filter((t) => !found[t.remote]).map((t) => t.remote)
  if (missing.length === mcp.tools.length) throw new Error(`The ${abilityName} server has none of the listed tools (${missing.join(', ')}).`)
  if (missing.length) console.warn(`[loopengine] ${abilityName}: the server has no tool named ${missing.join(', ')} — left out.`)
  return found
}

/** Each `defaults` entry's value from the agent's settings; a setting
 * that isn't set (or a missing part) leaves that input without one. */
function defaultValues(defaults: Record<string, McpDefault> | undefined, env: AgentEnv): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [input, spec] of Object.entries(defaults ?? {})) {
    let value: string | undefined
    if (typeof spec === 'string') {
      let missing = false
      value = spec.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_, name: string) => {
        const v = env.get(name)
        if (v === undefined) missing = true
        return v ?? ''
      })
      if (missing) value = undefined
    } else {
      const raw = env.get(spec.env)
      value = raw === undefined ? undefined : spec.split !== undefined ? raw.split(spec.split)[spec.part ?? 0] : raw
    }
    if (value?.trim()) out[input] = value.trim()
  }
  return out
}

/** The server's schema, with each input that has a default made optional
 * and its description saying what it defaults to. */
function withDefaults(schema: Record<string, unknown>, values: Record<string, string>): Record<string, unknown> {
  const properties = (schema.properties ?? {}) as Record<string, Record<string, unknown>>
  const names = Object.keys(values).filter((n) => n in properties)
  if (!names.length) return schema
  const props = { ...properties }
  for (const n of names) props[n] = { ...props[n], description: `${props[n].description ? `${props[n].description}. ` : ''}Defaults to ${values[n]}.` }
  const required = Array.isArray(schema.required) ? (schema.required as string[]).filter((r) => !names.includes(r)) : schema.required
  return { ...schema, properties: props, ...(required !== undefined ? { required } : {}) }
}

function toolDefinition(dir: string, abilityName: string, mcp: InstalledMcpRecord, tool: { name: string; remote: string }, schema: CachedTool, env?: AgentEnv): ToolDefinition {
  const maxChars = mcp.server.maxOutputChars ?? DEFAULT_MAX_OUTPUT_CHARS
  const properties = (schema.input_schema.properties ?? {}) as Record<string, unknown>
  return {
    name: tool.name,
    description: schema.description || tool.remote,
    input_schema: env ? withDefaults(schema.input_schema, defaultValues(mcp.server.defaults, env)) : schema.input_schema,
    async execute(input, ctx) {
      const server = resolveServer(mcp.server, ctx.env)
      const args = { ...input }
      for (const [name, value] of Object.entries(defaultValues(mcp.server.defaults, ctx.env))) {
        if (name in properties && (args[name] === undefined || args[name] === '')) args[name] = value
      }
      const call = async () => (await getClient(dir, abilityName, server)).callTool({ name: tool.remote, arguments: args })
      let result: Awaited<ReturnType<typeof call>>
      try {
        result = await call()
      } catch (err) {
        // A dropped connection (a restarted server, an expired session)
        // gets one fresh retry; anything else is the tool's own error.
        if (!isConnectionError(err)) throw err
        dropClient(dir, abilityName, server)
        result = await call()
      }
      const text = resultText(result)
      if (result.isError) throw new Error(text || `${tool.remote} failed`)
      return text.length > maxChars ? `${text.slice(0, maxChars)}\n\n[cut off at ${maxChars} characters]` : text
    },
  }
}

function isConnectionError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err)
  return /closed|ECONNRESET|ECONNREFUSED|EPIPE|not connected|session/i.test(message)
}

/** A tool result as text for the model: structured content as JSON when
 * the server gives it, otherwise the text parts, with anything else
 * (images, audio) noted rather than dropped silently. */
function resultText(result: Record<string, unknown>): string {
  if (result.structuredContent !== undefined) return JSON.stringify(result.structuredContent)
  if ('toolResult' in result) return typeof result.toolResult === 'string' ? result.toolResult : JSON.stringify(result.toolResult)
  const content = Array.isArray(result.content) ? (result.content as Array<Record<string, unknown>>) : []
  return content
    .map((part) => {
      if (part.type === 'text') return String(part.text ?? '')
      if (part.type === 'resource') {
        const resource = part.resource as { text?: string; uri?: string } | undefined
        return resource?.text ?? `[resource ${resource?.uri ?? ''}]`
      }
      if (part.type === 'resource_link') return `[link ${String(part.uri ?? '')}]`
      return `[${String(part.type)} omitted]`
    })
    .join('\n\n')
}
