// The workspace's Apps (the console's Apps page): popular apps that
// publish their own remote MCP server, and the ones this workspace has
// connected. Connecting one makes a private ability from its server
// (core/mcp-ability-generator.ts, with no workflow to fit, so it picks
// the tools most useful day to day) and stores it as a workspace ability
// with source `mcp:<url>`; agents then add it from their Abilities tab.
//
// Every entry below is the app's own server as listed in the official MCP
// Registry (checked November 2026). The URL is kept here so the page works
// without reaching the registry; the registry only adds icons.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getMcpServer, type McpDirectoryServer } from './mcp-directory.js'
import { readAbilityDetails } from './ability-details.js'
import { mcpAbilityNames } from './mcp-ability-generator.js'
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
  { id: 'io.github.github/github-mcp-server', site: 'github.com', title: 'GitHub', url: 'https://api.githubcopilot.com/mcp/', category: 'Engineering', description: 'Repositories, issues and pull requests.' },
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
  { id: 'ai.exa/exa', site: 'exa.ai', title: 'Exa', url: 'https://mcp.exa.ai/mcp', category: 'Web data', description: 'Web search built for AI.' },
  { id: 'co.huggingface/hf-mcp-server', site: 'huggingface.co', title: 'Hugging Face', url: 'https://huggingface.co/mcp?login', category: 'AI', description: 'Models, datasets and Spaces.' },
]

/** A catalog entry as a directory server (what the generator takes). */
export function catalogServer(entry: AppCatalogEntry): McpDirectoryServer {
  return { id: entry.id, title: entry.title, description: entry.description, url: entry.url, transport: 'streamable-http', source: 'registry', verified: true }
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

/** The workspace abilities made from an MCP server, as connected apps. */
export function connectedApps(workspace: WorkspaceAbility[], agentAbilities: Record<string, string[]>, envValue: (name: string) => string | undefined): ConnectedApp[] {
  return workspace.flatMap((a): ConnectedApp[] => {
    if (!a.source.startsWith('mcp:')) return []
    const url = a.source.slice(4)
    const dir = a.spec.replace(/^file:/, '')
    let manifest: { mcp?: { auth?: { type?: string; env?: string } }; generatedFrom?: { server?: string } } = {}
    try {
      if (existsSync(join(dir, 'loopengine.ability.json'))) manifest = JSON.parse(readFileSync(join(dir, 'loopengine.ability.json'), 'utf8'))
    } catch {}
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
