// Where the workflow planner finds MCP servers: the workspace's own saved
// servers (mcp-servers.yml in the project root, or the file
// LOOPENGINE_MCP_SERVERS_FILE names), then the official MCP Registry.
// Only remote servers are offered: a local one from a public listing
// would mean running someone else's code here without anyone choosing to.
//
//   servers:
//     - id: acme-crm
//       title: Acme CRM
//       description: Our internal CRM
//       url: https://mcp.acme.internal/mcp
//       auth: { header: X-Api-Key }     # optional; default Authorization: Bearer
//
// The console's Apps page adds to the same file ("Add your own server"):
// a company's own server, connected like any app.
//
// A registry server counts as verified when its URL is on the domain its
// registry name was verified for (com.stripe/mcp at mcp.stripe.com); the
// rest are shown as unverified.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'

export interface McpDirectoryServer {
  /** The registry name (com.stripe/mcp) or a saved server's id. */
  id: string
  title: string
  description: string
  url: string
  transport: 'streamable-http' | 'sse'
  website?: string
  /** An https icon from its registry entry, when it has one. */
  icon?: string
  source: 'saved' | 'registry'
  /** Saved by the workspace, or on its publisher's own verified domain. */
  verified: boolean
  /** Verified, and the publisher is the app searched for (com.stripe for
   * "stripe"), not someone else's server for it. Set by searchMcpServers. */
  official?: boolean
  /** How a key is sent, when it isn't Authorization: Bearer. */
  auth?: { header?: string; prefix?: string }
  /** Extra headers the server needs (e.g. which toolsets to offer). */
  headers?: Record<string, string>
}

export const MCP_REGISTRY_URL_ENV = 'LOOPENGINE_MCP_REGISTRY_URL'
export const MCP_SERVERS_FILE_ENV = 'LOOPENGINE_MCP_SERVERS_FILE'
const DEFAULT_REGISTRY = 'https://registry.modelcontextprotocol.io'
const CACHE_MS = 10 * 60 * 1000

function registryBase(): string | undefined {
  const value = process.env[MCP_REGISTRY_URL_ENV]?.trim()
  if (value === 'off') return undefined
  return (value || DEFAULT_REGISTRY).replace(/\/+$/, '')
}

function savedServersPath(): string {
  return resolve(process.cwd(), process.env[MCP_SERVERS_FILE_ENV]?.trim() || 'mcp-servers.yml')
}

/** The workspace's saved servers. A malformed entry is skipped. */
export function savedMcpServers(): McpDirectoryServer[] {
  const path = savedServersPath()
  if (!existsSync(path)) return []
  let raw: unknown
  try {
    raw = parseYaml(readFileSync(path, 'utf8'))
  } catch {
    return []
  }
  const list = (raw as { servers?: unknown } | null)?.servers
  return (Array.isArray(list) ? list : []).flatMap((s): McpDirectoryServer[] => {
    const e = (s ?? {}) as Record<string, unknown>
    if (typeof e.id !== 'string' || typeof e.url !== 'string' || !isRemoteUrl(e.url)) return []
    const auth = (e.auth ?? undefined) as { header?: unknown; prefix?: unknown } | undefined
    return [{
      id: e.id,
      title: typeof e.title === 'string' ? e.title : e.id,
      description: typeof e.description === 'string' ? e.description : '',
      url: e.url,
      transport: e.transport === 'sse' ? 'sse' : 'streamable-http',
      source: 'saved',
      verified: true,
      ...(auth && (typeof auth.header === 'string' || typeof auth.prefix === 'string')
        ? { auth: { ...(typeof auth.header === 'string' ? { header: auth.header } : {}), ...(typeof auth.prefix === 'string' ? { prefix: auth.prefix } : {}) } }
        : {}),
    }]
  })
}

function isRemoteUrl(url: string): boolean {
  try {
    const u = new URL(url)
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)
    // A URL with a {placeholder} (a token in the path) needs filling in
    // by hand, so it can't be connected to as listed.
    return (u.protocol === 'https:' || (u.protocol === 'http:' && local)) && !/[{}]|%7B|%7D/i.test(url)
  } catch {
    return false
  }
}

export class McpServerInputError extends Error {}

const HEADER_NAME = /^[A-Za-z0-9-]{1,64}$/

/** A server the workspace adds by its address, checked and given an id
 * from its name (the same id again for an address already saved). Not
 * saved yet: saveMcpServer, once it has connected. */
export function ownMcpServer(input: { title?: unknown; url?: unknown; description?: unknown; header?: unknown }, saved: McpDirectoryServer[] = savedMcpServers()): McpDirectoryServer {
  const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
  const title = text(input.title)
  const url = text(input.url)
  const description = text(input.description)
  const header = text(input.header)
  if (!title) throw new McpServerInputError('Give the server a name, e.g. "Acme CRM".')
  if (title.length > 60) throw new McpServerInputError('Keep the name under 60 characters.')
  if (description.length > 200) throw new McpServerInputError('Keep the description under 200 characters.')
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new McpServerInputError('Enter the server\'s full address, e.g. https://mcp.yourcompany.com/mcp.')
  }
  if (!isRemoteUrl(parsed.href)) {
    throw new McpServerInputError(parsed.protocol === 'http:'
      ? 'Use the server\'s https address: its key would otherwise be sent unencrypted.'
      : 'Enter the server\'s full https address, with nothing left to fill in, e.g. https://mcp.yourcompany.com/mcp.')
  }
  if (header && !HEADER_NAME.test(header)) throw new McpServerInputError('A header name is letters, digits and dashes, e.g. X-Api-Key.')
  const same = saved.find((s) => s.url === url)
  let id = same?.id
  if (!id) {
    const base = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'server'
    id = base
    for (let n = 2; saved.some((s) => s.id === id); n++) id = `${base}-${n}`
  }
  return {
    id,
    title,
    description,
    url,
    transport: 'streamable-http',
    source: 'saved',
    verified: true,
    ...(header && header.toLowerCase() !== 'authorization' ? { auth: { header } } : {}),
  }
}

/** Adds a server to the saved servers, or replaces the one with its id.
 * The file's other entries are kept as they are. */
export function saveMcpServer(server: McpDirectoryServer): void {
  const path = savedServersPath()
  let doc: { servers?: unknown[] } & Record<string, unknown> = {}
  if (existsSync(path)) {
    try {
      doc = (parseYaml(readFileSync(path, 'utf8')) as typeof doc | null) ?? {}
    } catch (err) {
      throw new McpServerInputError(`${path} couldn't be read, so the server wasn't saved: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  const servers = Array.isArray(doc.servers) ? doc.servers.filter((e) => (e as { id?: unknown } | null)?.id !== server.id) : []
  servers.push({
    id: server.id,
    title: server.title,
    ...(server.description ? { description: server.description } : {}),
    url: server.url,
    ...(server.auth?.header ? { auth: { header: server.auth.header } } : {}),
  })
  writeFileSync(path, stringifyYaml({ ...doc, servers }))
}

/** Removes a saved server; false when there's none with that id. */
export function removeSavedMcpServer(id: string): boolean {
  const path = savedServersPath()
  if (!existsSync(path)) return false
  const doc = (parseYaml(readFileSync(path, 'utf8')) as ({ servers?: unknown[] } & Record<string, unknown>) | null) ?? {}
  const servers = Array.isArray(doc.servers) ? doc.servers : []
  const kept = servers.filter((e) => (e as { id?: unknown } | null)?.id !== id)
  if (kept.length === servers.length) return false
  writeFileSync(path, stringifyYaml({ ...doc, servers: kept }))
  return true
}

/** io.github.firecrawl/… → firecrawl: the GitHub organisation the
 * registry verified the name for. */
function githubOrg(name: string): string | undefined {
  const ns = name.split('/')[0]
  return ns.startsWith('io.github.') ? ns.slice('io.github.'.length).toLowerCase() || undefined : undefined
}

/** com.stripe/mcp → stripe.com; io.github.* names aren't domains. */
function publisherDomain(name: string): string | undefined {
  const ns = name.split('/')[0]
  if (!ns || ns.startsWith('io.github.')) return undefined
  const parts = ns.split('.')
  return parts.length >= 2 ? parts.reverse().join('.') : undefined
}

/** Whether the server's URL is on its publisher's own domain: the
 * domain a reverse-domain name was verified for, or, for a name verified
 * through a GitHub organisation, a domain named like it
 * (io.github.firecrawl at mcp.firecrawl.dev). */
function onPublisherDomain(name: string, url: string): boolean {
  let host: string
  try {
    host = new URL(url).hostname
  } catch {
    return false
  }
  const domain = publisherDomain(name)
  if (domain) return host === domain || host.endsWith(`.${domain}`)
  const org = githubOrg(name)
  const labels = host.split('.')
  return Boolean(org && labels.length >= 2 && labels[labels.length - 2] === org)
}

/** The publisher's own name: firecrawl for io.github.firecrawl, stripe for com.stripe. */
function publisherLabel(name: string): string | undefined {
  return githubOrg(name) ?? publisherDomain(name)?.split('.')[0]
}

interface RegistryEntry {
  server?: {
    name?: string
    title?: string
    description?: string
    websiteUrl?: string
    icons?: Array<{ src?: string; mimeType?: string }>
    remotes?: Array<{ type?: string; url?: string }>
  }
}

function fromRegistry(entry: RegistryEntry): McpDirectoryServer | undefined {
  const s = entry.server
  if (!s?.name) return undefined
  const remotes = (s.remotes ?? []).filter((r) => typeof r.url === 'string' && isRemoteUrl(r.url) && (r.type === 'streamable-http' || r.type === 'sse'))
  // Streamable HTTP when offered (the current transport), and the
  // full-access endpoint before a read-only variant.
  const remote = remotes.find((r) => r.type === 'streamable-http' && !/readonly|read-only/i.test(r.url!)) ?? remotes.find((r) => r.type === 'streamable-http') ?? remotes[0]
  if (!remote) return undefined
  const icons = (s.icons ?? []).filter((i) => typeof i.src === 'string' && i.src.startsWith('https://'))
  const icon = (icons.find((i) => i.mimeType === 'image/svg+xml') ?? icons[0])?.src
  return {
    id: s.name,
    title: s.title || s.name.split('/').pop() || s.name,
    description: (s.description ?? '').slice(0, 300),
    url: remote.url!,
    transport: remote.type === 'sse' ? 'sse' : 'streamable-http',
    ...(s.websiteUrl ? { website: s.websiteUrl } : {}),
    ...(icon ? { icon } : {}),
    source: 'registry',
    verified: onPublisherDomain(s.name, remote.url!),
  }
}

const searches = new Map<string, { at: number; servers: McpDirectoryServer[] }>()

async function registrySearch(query: string): Promise<McpDirectoryServer[]> {
  const base = registryBase()
  if (!base || !query) return []
  const key = `${base}\0${query.toLowerCase()}`
  const hit = searches.get(key)
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.servers
  const url = `${base}/v0/servers?search=${encodeURIComponent(query)}&version=latest&limit=50`
  const res = await fetch(url, { signal: AbortSignal.timeout(10000), headers: { accept: 'application/json' } })
  if (!res.ok) throw new Error(`the MCP Registry answered ${res.status}`)
  const body = (await res.json()) as { servers?: RegistryEntry[] }
  const seen = new Set<string>()
  const servers = (body.servers ?? []).flatMap((e) => {
    const s = fromRegistry(e)
    if (!s || seen.has(s.id)) return []
    seen.add(s.id)
    return [s]
  })
  searches.set(key, { at: Date.now(), servers })
  return servers
}

/** Saved servers matching `query`, then registry ones, verified first. */
export async function searchMcpServers(query: string, limit = 10): Promise<McpDirectoryServer[]> {
  const q = query.trim().toLowerCase()
  const words = q.split(/\s+/).filter(Boolean)
  const saved = savedMcpServers().filter((s) => words.some((w) => `${s.id} ${s.title} ${s.description}`.toLowerCase().includes(w)))
  let registry: McpDirectoryServer[] = []
  try {
    // The registry matches names, so search on the first word ("linear
    // issues" → "linear") when the whole phrase finds nothing.
    registry = await registrySearch(q)
    if (!registry.length && words.length > 1) registry = await registrySearch(words[0])
  } catch {}
  const ranked = registry
    .map((r) => ({ ...r, official: r.verified && words.includes(publisherLabel(r.id) ?? '') }))
    .sort((a, b) => Number(b.official) - Number(a.official) || Number(b.verified) - Number(a.verified))
  return [...saved, ...ranked.filter((r) => !saved.some((s) => s.url === r.url))].slice(0, limit)
}

/** One server by id: a saved one, else the registry's latest entry. */
export async function getMcpServer(id: string): Promise<McpDirectoryServer | undefined> {
  const saved = savedMcpServers().find((s) => s.id === id)
  if (saved) return saved
  const name = id.split('/').pop() ?? id
  try {
    return (await registrySearch(name)).find((s) => s.id === id) ?? (await registrySearch(id)).find((s) => s.id === id)
  } catch {
    return undefined
  }
}
