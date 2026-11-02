// The workspace's Apps (the console's Apps page): popular apps that
// publish their own remote MCP server, and the ones this workspace has
// connected. Connecting one makes a private ability from its server
// (core/mcp-ability-generator.ts, with no workflow to fit, so it picks
// the tools most useful day to day) and stores it as a workspace ability
// with source `mcp:<url>`; agents then add it from their Apps tab.
//
// Every entry below is the app's own server as listed in the official MCP
// Registry (checked November 2026). The URL is kept here so the page works
// without reaching the registry; the registry only adds icons.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'
import { getMcpServer, type McpDirectoryServer } from './mcp-directory.js'
import { readAbilityDetails } from './ability-details.js'
import { appRuleName, defaultMcpDecision, mcpAbilityNames } from './mcp-ability-generator.js'
import { listMcpServerTools, mcpToolName, type InstalledMcpRecord, type McpToolInfo } from './mcp-abilities.js'
import type { AgentEnv } from './agent-config.js'
import type { WorkspaceAbility } from './workspace-abilities.js'

export interface AppCatalogEntry {
  /** Its MCP Registry name. */
  id: string
  /** The app's own website, for its icon when the registry has none. */
  site: string
  title: string
  url: string
  category: string
  description: string
  /** Headers the server needs to offer the right tools (e.g. GitHub's
   * toolsets). */
  headers?: Record<string, string>
}

export const APP_CATALOG: AppCatalogEntry[] = [
  { id: 'com.stripe/mcp', site: 'stripe.com', title: 'Stripe', url: 'https://mcp.stripe.com', category: 'Payments', description: 'Customers, payments, invoices, subscriptions and refunds.' },
  { id: 'com.paypal.mcp/mcp', site: 'paypal.com', title: 'PayPal', url: 'https://mcp.paypal.com/mcp', category: 'Payments', description: 'Invoices, orders, payments and disputes.' },
  { id: 'com.notion/mcp', site: 'notion.com', title: 'Notion', url: 'https://mcp.notion.com/mcp', category: 'Docs', description: 'Search, read and write pages and databases.' },
  { id: 'com.atlassian/atlassian-mcp-server', site: 'atlassian.com', title: 'Jira & Confluence', url: 'https://mcp.atlassian.com/v2/mcp', category: 'Projects', description: 'Jira issues and Confluence pages (Atlassian).' },
  { id: 'app.linear/linear', site: 'linear.app', title: 'Linear', url: 'https://mcp.linear.app/mcp', category: 'Projects', description: 'Issues, projects and documents.' },
  { id: 'com.monday/monday.com', site: 'monday.com', title: 'monday.com', url: 'https://mcp.monday.com/mcp', category: 'Projects', description: 'Boards, items and updates.' },
  { id: 'com.basecamp/mcp', site: 'basecamp.com', title: 'Basecamp', url: 'https://mcp.basecamp.com/mcp', category: 'Projects', description: 'Projects, to-dos and messages.' },
  { id: 'net.todoist/mcp', site: 'todoist.com', title: 'Todoist', url: 'https://ai.todoist.net/mcp', category: 'Projects', description: 'Tasks and projects.' },
  { id: 'com.airtable/mcp', site: 'airtable.com', title: 'Airtable', url: 'https://mcp.airtable.com/mcp', category: 'Data', description: 'Bases, tables and records.' },
  { id: 'io.github.github/github-mcp-server', site: 'github.com', title: 'GitHub', url: 'https://api.githubcopilot.com/mcp/', category: 'Engineering', description: 'Repositories, issues, pull requests and Actions runs.', headers: { 'X-MCP-Toolsets': 'repos,issues,pull_requests,actions' } },
  { id: 'com.gitlab/mcp', site: 'gitlab.com', title: 'GitLab', url: 'https://gitlab.com/api/v4/mcp', category: 'Engineering', description: 'Projects, issues and merge requests.' },
  { id: 'io.github.getsentry/sentry-mcp', site: 'sentry.io', title: 'Sentry', url: 'https://mcp.sentry.dev/mcp', category: 'Engineering', description: 'Errors, issues and releases.' },
  { id: 'com.vercel/vercel-mcp', site: 'vercel.com', title: 'Vercel', url: 'https://mcp.vercel.com', category: 'Engineering', description: 'Projects, deployments and logs.' },
  { id: 'com.supabase/mcp', site: 'supabase.com', title: 'Supabase', url: 'https://mcp.supabase.com/mcp', category: 'Engineering', description: 'Databases, tables and projects.' },
  { id: 'com.circleci/mcp', site: 'circleci.com', title: 'CircleCI', url: 'https://mcp.circleci.com/v1/mcp', category: 'Engineering', description: 'Pipelines, builds and test results.' },
  { id: 'io.github.PostHog/mcp', site: 'posthog.com', title: 'PostHog', url: 'https://mcp.posthog.com/mcp', category: 'Analytics', description: 'Product analytics, insights and feature flags.' },
  { id: 'com.amplitude/mcp-server', site: 'amplitude.com', title: 'Amplitude', url: 'https://mcp.amplitude.com/mcp', category: 'Analytics', description: 'Charts, dashboards and events.' },
  { id: 'com.figma.mcp/mcp', site: 'figma.com', title: 'Figma', url: 'https://mcp.figma.com/mcp', category: 'Design', description: 'Design files, frames and comments.' },
  { id: 'com.canva.mcp/mcp', site: 'canva.com', title: 'Canva', url: 'https://mcp.canva.com/mcp', category: 'Design', description: 'Designs, templates and exports.' },
  { id: 'io.github.miroapp/mcp-server', site: 'miro.com', title: 'Miro', url: 'https://mcp.miro.com/', category: 'Design', description: 'Boards, sticky notes and diagrams.' },
  { id: 'com.webflow/mcp', site: 'webflow.com', title: 'Webflow', url: 'https://mcp.webflow.com/mcp', category: 'Websites', description: 'Sites, pages and CMS items.' },
  { id: 'com.wix/mcp', site: 'wix.com', title: 'Wix', url: 'https://mcp.wix.com/mcp', category: 'Websites', description: 'Sites, stores and bookings.' },
  { id: 'com.typeform/typeform', site: 'typeform.com', title: 'Typeform', url: 'https://api.typeform.com/mcp', category: 'Forms', description: 'Forms and responses.' },
  { id: 'com.jotform/mcp', site: 'jotform.com', title: 'Jotform', url: 'https://mcp.jotform.com/', category: 'Forms', description: 'Forms and submissions.' },
  { id: 'com.zapier/mcp', site: 'zapier.com', title: 'Zapier', url: 'https://mcp.zapier.com/api/v1/connect', category: 'Automation', description: 'Actions across thousands of apps, through your Zapier account.' },
  { id: 'com.apify/apify-mcp-server', site: 'apify.com', title: 'Apify', url: 'https://mcp.apify.com/', category: 'Web data', description: 'Scrapers and crawlers (Apify Actors).' },
  { id: 'io.github.firecrawl/firecrawl-mcp-server', site: 'firecrawl.dev', title: 'Firecrawl', url: 'https://mcp.firecrawl.dev/v2/mcp', category: 'Web data', description: 'Search the web, read pages and files, map and crawl sites. Add an API key for crawling, mapping and monitors.' },
  { id: 'ai.exa/exa', site: 'exa.ai', title: 'Exa', url: 'https://mcp.exa.ai/mcp', category: 'Web data', description: 'Web search built for AI.' },
  { id: 'co.huggingface/hf-mcp-server', site: 'huggingface.co', title: 'Hugging Face', url: 'https://huggingface.co/mcp?login', category: 'AI', description: 'Models, datasets and Spaces.' },
]

/** A catalog entry as a directory server (what the generator takes). */
export function catalogServer(entry: AppCatalogEntry): McpDirectoryServer {
  return { id: entry.id, title: entry.title, description: entry.description, url: entry.url, transport: 'streamable-http', source: 'registry', verified: true, ...(entry.headers ? { headers: entry.headers } : {}) }
}

/** The server for an app id: from the catalog, else the directory
 * (saved servers, then the registry). */
export async function appServer(id: string): Promise<McpDirectoryServer | undefined> {
  const entry = APP_CATALOG.find((a) => a.id === id)
  return entry ? catalogServer(entry) : getMcpServer(id)
}

// Icons come from the registry, fetched once in the background; an app
// without one there gets its own site's favicon.
const icons = new Map<string, string | null>()
let iconsLoading: Promise<void> | undefined

/** Starts fetching the catalog's icons (once); resolves when done. */
export function loadAppIcons(): Promise<void> {
  iconsLoading ??= (async () => {
    for (let i = 0; i < APP_CATALOG.length; i += 6) {
      await Promise.all(APP_CATALOG.slice(i, i + 6).map(async (entry) => {
        try {
          icons.set(entry.id, (await getMcpServer(entry.id))?.icon ?? null)
        } catch {
          icons.set(entry.id, null)
        }
      }))
    }
  })()
  return iconsLoading
}

export interface ConnectedApp {
  /** The registry name or saved id it was made from, when recorded. */
  id?: string
  title: string
  url: string
  /** The workspace ability it is (e.g. mcp-linear) and its spec. */
  ability: string
  spec: string
  /** Its tools, with the permission each was set up with. */
  tools: { name: string; decision?: 'allow' | 'ask' | 'deny' }[]
  /** The setting its key is read from, and whether it has a value. */
  keyEnv?: string
  keySet: boolean
  /** Agents that have added it. */
  agents: string[]
  connectedAt: string
}

export interface AppView extends AppCatalogEntry {
  icon?: string
  connected: boolean
}

/** Whether a workspace ability takes its tools from an MCP server (a
 * connected app). */
export function isAppAbility(a: Pick<WorkspaceAbility, 'spec'>): boolean {
  return Boolean(readManifestAt(a.spec.replace(/^file:/, '')).mcp?.url)
}

function readManifestAt(dir: string): { mcp?: { url?: string; auth?: { type?: string; env?: string } }; generatedFrom?: { server?: string } } {
  try {
    if (existsSync(join(dir, 'loopengine.ability.json'))) return JSON.parse(readFileSync(join(dir, 'loopengine.ability.json'), 'utf8'))
  } catch {}
  return {}
}

/** The workspace abilities that take their tools from an MCP server, as
 * connected apps. */
export function connectedApps(workspace: WorkspaceAbility[], agentAbilities: Record<string, string[]>, envValue: (name: string) => string | undefined): ConnectedApp[] {
  return workspace.flatMap((a): ConnectedApp[] => {
    const dir = a.spec.replace(/^file:/, '')
    const manifest = readManifestAt(dir)
    const url = manifest.mcp?.url
    if (!url) return []
    let tools: ConnectedApp['tools'] = []
    try {
      tools = readAbilityDetails(dir).tools.map((t) => ({ name: t.name, ...(t.decision ? { decision: t.decision } : {}) }))
    } catch {}
    const entry = APP_CATALOG.find((e) => e.url === url || e.id === manifest.generatedFrom?.server)
    const keyEnv = manifest.mcp?.auth?.type === 'key' ? manifest.mcp.auth.env : undefined
    return [{
      ...(manifest.generatedFrom?.server ?? entry?.id ? { id: manifest.generatedFrom?.server ?? entry!.id } : {}),
      title: entry?.title || a.description.split(':')[0].replace(/ \(made from its MCP server\)$/, '') || a.name,
      url,
      ability: a.name,
      spec: a.spec,
      tools,
      ...(keyEnv ? { keyEnv } : {}),
      keySet: keyEnv ? envValue(keyEnv) !== undefined : true,
      agents: Object.entries(agentAbilities).filter(([, names]) => names.includes(a.name)).map(([agent]) => agent),
      connectedAt: a.installedAt,
    }]
  })
}

/** The catalog, each app marked connected or not, with its icon once known. */
export function appCatalog(connected: ConnectedApp[]): AppView[] {
  return APP_CATALOG.map((entry) => {
    const icon = icons.get(entry.id)
    return {
      ...entry,
      icon: icon || `https://${entry.site}/favicon.ico`,
      connected: connected.some((c) => c.url === entry.url || c.id === entry.id || c.ability === mcpAbilityNames(entry).name),
    }
  })
}

// ---- An app's tools ----
// A connected app lists every tool its server offers, each with a
// default permission (Allow when it only reads, else Ask me). Agents
// choose which of them they get, and with what permission, when they add
// the app; the defaults are what an agent starts from.

export class AppToolsError extends Error {}

export interface AppTool {
  /** The server's name for it, and the name agents see. */
  remote: string
  name: string
  description: string
  readOnly?: boolean
  destructive?: boolean
  /** Its default permission. */
  decision: 'allow' | 'ask' | 'deny'
  /** Agents that have it, with the permission each gave it. */
  usedBy: { agent: string; decision: 'allow' | 'ask' | 'deny' }[]
}

interface AppManifest {
  mcp: InstalledMcpRecord['server'] & { tools: string[]; prefix?: string }
  actauth?: string
  [key: string]: unknown
}

interface RuleEntry {
  name: string
  scope: string
  tool: string
  decision: 'allow' | 'ask' | 'deny'
}

function readApp(dir: string): { name: string; manifest: AppManifest; rules: RuleEntry[]; rulesPath: string } {
  const manifestPath = join(dir, 'loopengine.ability.json')
  if (!existsSync(manifestPath)) throw new AppToolsError('That app isn\'t in the workspace any more.')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as AppManifest
  if (!manifest.mcp || !Array.isArray(manifest.mcp.tools)) throw new AppToolsError('That ability doesn\'t come from an MCP server.')
  const name = (JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { name: string }).name
  const rulesPath = join(dir, manifest.actauth ?? 'actauth/rules.yml')
  const rules = existsSync(rulesPath) ? ((parseYaml(readFileSync(rulesPath, 'utf8')) as RuleEntry[] | null) ?? []) : []
  return { name, manifest, rules, rulesPath }
}

function prefixOf(name: string, manifest: AppManifest): string {
  return manifest.mcp.prefix ?? name.replace(/^@[^/]+\//, '').replace(/^(lp|mcp)-/, '')
}

function envFrom(value: (name: string) => string | undefined): AgentEnv {
  return {
    get: value,
    require(name) {
      const v = value(name)
      if (v === undefined) throw new AppToolsError(`${name} isn't set, so the app's tools can't be listed.`)
      return v
    },
  }
}

// The server's list, kept a few minutes so opening the list again
// doesn't reconnect each time.
const listings = new Map<string, { at: number; tools: McpToolInfo[] }>()
const LISTING_MS = 5 * 60 * 1000

async function serverTools(dir: string, manifest: AppManifest, envValue: (name: string) => string | undefined, fresh = false): Promise<McpToolInfo[]> {
  const hit = listings.get(dir)
  if (!fresh && hit && Date.now() - hit.at < LISTING_MS) return hit.tools
  const { tools: _tools, prefix: _prefix, ...server } = manifest.mcp
  const tools = await listMcpServerTools(server, envFrom(envValue))
  listings.set(dir, { at: Date.now(), tools })
  return tools
}

/** An agent's tools from one app: its chosen server tools, each with its
 * permission there (the agent's first rule for the tool). */
export type AgentAppTools = Record<string, { remote: string; decision: 'allow' | 'ask' | 'deny' }[]>

/** Every tool of the app, with its default permission and the agents
 * using it. Tools the server added since connecting are listed too, at
 * their default (see refreshAppTools to add them for good). */
export async function appTools(spec: string, envValue: (name: string) => string | undefined, agents: AgentAppTools, options: { fresh?: boolean } = {}): Promise<AppTool[]> {
  const dir = spec.replace(/^file:/, '')
  const { name, manifest, rules } = readApp(dir)
  const prefix = prefixOf(name, manifest)
  let listed: McpToolInfo[] = []
  try {
    listed = await serverTools(dir, manifest, envValue, options.fresh)
  } catch {
    // Unreachable for now: still list what the app had, without details.
  }
  const byRemote = new Map(listed.map((t) => [t.name, t]))
  const remotes = [...new Set([...manifest.mcp.tools, ...listed.map((t) => t.name)])]
  return remotes.map((remote) => {
    const info = byRemote.get(remote)
    const installed = mcpToolName(prefix, remote)
    const decision = rules.find((r) => r.tool === installed)?.decision ?? (info ? defaultMcpDecision(info) : 'ask')
    return {
      remote,
      name: installed,
      description: info ? info.description.split('\n')[0].slice(0, 240) : listed.length ? 'The server no longer offers this tool.' : '',
      ...(info?.readOnly !== undefined ? { readOnly: info.readOnly } : {}),
      ...(info?.destructive ? { destructive: true } : {}),
      decision,
      usedBy: Object.entries(agents).flatMap(([agent, tools]) => tools.filter((t) => t.remote === remote).map((t) => ({ agent, decision: t.decision }))),
    }
  })
}

/** Sets a tool's default permission, for agents that add it from now on;
 * agents that already have it keep theirs. */
export function setAppDefault(spec: string, remote: string, decision: 'allow' | 'ask' | 'deny'): void {
  const dir = spec.replace(/^file:/, '')
  const { name, manifest, rules, rulesPath } = readApp(dir)
  if (!manifest.mcp.tools.includes(remote)) throw new AppToolsError(`${remote} isn't one of the app's tools.`)
  const installed = mcpToolName(prefixOf(name, manifest), remote)
  const rule = rules.find((r) => r.tool === installed)
  if (rule) rule.decision = decision
  else rules.push({ name: appRuleName(name, installed), scope: '*/*', tool: installed, decision })
  writeFileSync(rulesPath, stringifyYaml(rules))
}

/** Brings the app's tool list up to date with its server: new tools are
 * added at their default permission, ones it no longer offers dropped.
 * Agents keep the tools they chose (one the server dropped just stops
 * loading). Returns what changed. */
export async function refreshAppTools(spec: string, envValue: (name: string) => string | undefined): Promise<{ added: string[]; removed: string[] }> {
  const dir = spec.replace(/^file:/, '')
  const { name, manifest, rules, rulesPath } = readApp(dir)
  const prefix = prefixOf(name, manifest)
  const listed = await serverTools(dir, manifest, envValue, true)
  const taken = new Set<string>()
  const offered = listed.filter((t) => {
    const installed = mcpToolName(prefix, t.name)
    if (taken.has(installed)) return false
    taken.add(installed)
    return true
  })
  const added = offered.filter((t) => !manifest.mcp.tools.includes(t.name))
  const removed = manifest.mcp.tools.filter((r) => !offered.some((t) => t.name === r))
  for (const t of added) {
    const installed = mcpToolName(prefix, t.name)
    if (!rules.some((r) => r.tool === installed)) rules.push({ name: appRuleName(name, installed), scope: '*/*', tool: installed, decision: defaultMcpDecision(t) })
  }
  const gone = new Set(removed.map((r) => mcpToolName(prefix, r)))
  manifest.mcp.tools = offered.map((t) => t.name)
  writeFileSync(join(dir, 'loopengine.ability.json'), JSON.stringify(manifest, null, 2) + '\n')
  writeFileSync(rulesPath, stringifyYaml(rules.filter((r) => !gone.has(r.tool))))
  return { added: added.map((t) => t.name), removed }
}
