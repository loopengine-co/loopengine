// The workspace's Apps (the console's Apps page): popular apps that
// publish their own remote MCP server, and the ones this workspace has
// connected. Connecting one makes a private ability from its server
// (core/mcp-ability-generator.ts, with no workflow to fit, so it picks
// the tools most useful day to day) and stores it as a workspace ability
// with source `mcp:<url>`; agents then add it from their Apps tab.
//
// Every entry below is the app's own server, on its own domain: as listed
// in the official MCP Registry, or, for apps not listed there, at the
// address the app publishes (checked November 2026: each answers as an MCP
// server and offers a sign-in or works without one). Apps whose server
// only takes a sign-in for apps registered with them by hand (HubSpot,
// Box, Zendesk, Xero, DocuSign, Front) are left out until they open up.
// The URL is kept here so the page works without reaching the registry;
// the registry only adds icons.
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
  /** `sse` for a server whose sign-in is only on its older SSE endpoint. */
  transport?: 'sse'
}

export const APP_CATALOG: AppCatalogEntry[] = [
  { id: 'com.stripe/mcp', site: 'stripe.com', title: 'Stripe', url: 'https://mcp.stripe.com', category: 'Payments', description: 'Customers, payments, invoices, subscriptions and refunds.' },
  { id: 'com.paypal.mcp/mcp', site: 'paypal.com', title: 'PayPal', url: 'https://mcp.paypal.com/mcp', category: 'Payments', description: 'Invoices, orders, payments and disputes.' },
  { id: 'com.squareup/mcp', site: 'squareup.com', title: 'Square', url: 'https://mcp.squareup.com/mcp', category: 'Payments', description: 'Payments, orders, customers, catalog and invoices.' },
  { id: 'com.paddle/mcp', site: 'paddle.com', title: 'Paddle', url: 'https://mcp.paddle.com/mcp', category: 'Payments', description: 'Products, prices, subscriptions and transactions.' },
  { id: 'com.mercury/mcp', site: 'mercury.com', title: 'Mercury', url: 'https://mcp.mercury.com/mcp', category: 'Finance', description: 'Bank accounts, balances and transactions.' },
  { id: 'com.ramp/mcp', site: 'ramp.com', title: 'Ramp', url: 'https://mcp.ramp.com/mcp', category: 'Finance', description: 'Card spend, transactions, bills and reimbursements.' },
  { id: 'com.attio/mcp', site: 'attio.com', title: 'Attio', url: 'https://mcp.attio.com/mcp', category: 'Sales', description: 'Companies, people, deals, lists and notes.' },
  { id: 'com.close/close-mcp', site: 'close.com', title: 'Close', url: 'https://mcp.close.com/mcp', category: 'Sales', description: 'Leads, contacts, opportunities and activities.' },
  { id: 'io.github.Zoominfo/zoominfo-mcp', site: 'zoominfo.com', title: 'ZoomInfo', url: 'https://mcp.zoominfo.com/mcp', category: 'Sales', description: 'Company and contact data for prospecting.' },
  { id: 'com.intercom/mcp', site: 'intercom.com', title: 'Intercom', url: 'https://mcp.intercom.com/mcp', category: 'Support', description: 'Conversations, contacts and help articles.' },
  { id: 'net.helpscout/mcp', site: 'helpscout.com', title: 'Help Scout', url: 'https://mcp.helpscout.net/mcp', category: 'Support', description: 'Mailboxes, conversations and customers.' },
  { id: 'com.gorgias/mcp', site: 'gorgias.com', title: 'Gorgias', url: 'https://mcp.gorgias.com/mcp', category: 'Support', description: 'Ecommerce support tickets and customers.' },
  { id: 'com.plain/mcp', site: 'plain.com', title: 'Plain', url: 'https://mcp.plain.com/mcp', category: 'Support', description: 'Support threads, customers and companies.' },
  { id: 'com.klaviyo/mcp', site: 'klaviyo.com', title: 'Klaviyo', url: 'https://mcp.klaviyo.com/mcp', category: 'Marketing', description: 'Profiles, lists, campaigns, flows and metrics.' },
  { id: 'com.beehiiv/beehiiv', site: 'beehiiv.com', title: 'beehiiv', url: 'https://mcp.beehiiv.com/mcp', category: 'Marketing', description: 'Newsletter posts, subscribers and stats.' },
  { id: 'com.ahrefs/mcp', site: 'ahrefs.com', title: 'Ahrefs', url: 'https://api.ahrefs.com/mcp/mcp', category: 'Marketing', description: 'SEO: keywords, backlinks, rankings and site audits.' },
  { id: 'ai.redditgrow/mcp', site: 'redditgrow.ai', title: 'RedditGrow', url: 'https://redditgrow.ai/mcp', category: 'Marketing', description: 'Reddit posts worth replying to, drafted replies, brand mentions and DMs (not made by Reddit).' },
  { id: 'com.notion/mcp', site: 'notion.com', title: 'Notion', url: 'https://mcp.notion.com/mcp', category: 'Docs', description: 'Search, read and write pages and databases.' },
  { id: 'io.coda/mcp', site: 'coda.io', title: 'Coda', url: 'https://coda.io/apis/mcp', category: 'Docs', description: 'Docs, pages and tables.' },
  { id: 'app.gamma/mcp', site: 'gamma.app', title: 'Gamma', url: 'https://mcp.gamma.app/mcp', category: 'Docs', description: 'Presentations, documents and web pages.' },
  { id: 'com.pandadoc.mcp/mcp', site: 'pandadoc.com', title: 'PandaDoc', url: 'https://mcp.pandadoc.com/v1/mcp', category: 'Docs', description: 'Proposals, quotes, contracts and e-signatures.' },
  { id: 'com.dropbox/mcp', site: 'dropbox.com', title: 'Dropbox', url: 'https://mcp.dropbox.com/mcp', category: 'Files', description: 'Files and folders: search, read and share.' },
  { id: 'com.egnyte/mcp-server', site: 'egnyte.com', title: 'Egnyte', url: 'https://mcp-server.egnyte.com/mcp', category: 'Files', description: 'Company files and folders.' },
  { id: 'com.atlassian/atlassian-mcp-server', site: 'atlassian.com', title: 'Jira & Confluence', url: 'https://mcp.atlassian.com/v2/mcp', category: 'Projects', description: 'Jira issues and Confluence pages (Atlassian).' },
  { id: 'app.linear/linear', site: 'linear.app', title: 'Linear', url: 'https://mcp.linear.app/mcp', category: 'Projects', description: 'Issues, projects and documents.' },
  { id: 'com.asana/mcp', site: 'asana.com', title: 'Asana', url: 'https://mcp.asana.com/sse', transport: 'sse', category: 'Projects', description: 'Tasks, projects and portfolios.' },
  { id: 'com.clickup/mcp', site: 'clickup.com', title: 'ClickUp', url: 'https://mcp.clickup.com/mcp', category: 'Projects', description: 'Tasks, lists, docs and time tracking.' },
  { id: 'com.productboard/productboard', site: 'productboard.com', title: 'Productboard', url: 'https://mcp.productboard.com', category: 'Projects', description: 'Feature ideas, insights and roadmaps.' },
  { id: 'com.monday/monday.com', site: 'monday.com', title: 'monday.com', url: 'https://mcp.monday.com/mcp', category: 'Projects', description: 'Boards, items and updates.' },
  { id: 'com.basecamp/mcp', site: 'basecamp.com', title: 'Basecamp', url: 'https://mcp.basecamp.com/mcp', category: 'Projects', description: 'Projects, to-dos and messages.' },
  { id: 'net.todoist/mcp', site: 'todoist.com', title: 'Todoist', url: 'https://ai.todoist.net/mcp', category: 'Projects', description: 'Tasks and projects.' },
  { id: 'com.airtable/mcp', site: 'airtable.com', title: 'Airtable', url: 'https://mcp.airtable.com/mcp', category: 'Data', description: 'Bases, tables and records.' },
  { id: 'io.baserow/baserow', site: 'baserow.io', title: 'Baserow', url: 'https://api.baserow.io/mcp', category: 'Data', description: 'Databases, tables and rows.' },
  { id: 'com.cal/mcp', site: 'cal.com', title: 'Cal.com', url: 'https://mcp.cal.com/mcp', category: 'Meetings', description: 'Bookings, event types and availability.' },
  { id: 'ai.granola/mcp', site: 'granola.ai', title: 'Granola', url: 'https://mcp.granola.ai/mcp', category: 'Meetings', description: 'Meeting notes and transcripts.' },
  { id: 'ai.fireflies/fireflies', site: 'fireflies.ai', title: 'Fireflies.ai', url: 'https://api.fireflies.ai/mcp', category: 'Meetings', description: 'Meeting transcripts, summaries and action items.' },
  { id: 'com.shippo/shippo-mcp', site: 'goshippo.com', title: 'Shippo', url: 'https://mcp.shippo.com', category: 'Shipping', description: 'Shipping rates, labels and tracking.' },
  { id: 'com.aftership.mcp/tracking-public', site: 'aftership.com', title: 'AfterShip', url: 'https://mcp.aftership.com/tracking/public', category: 'Shipping', description: 'Shipment tracking and returns.' },
  { id: 'io.github.github/github-mcp-server', site: 'github.com', title: 'GitHub', url: 'https://api.githubcopilot.com/mcp/', category: 'Engineering', description: 'Repositories, issues, pull requests and Actions runs.', headers: { 'X-MCP-Toolsets': 'repos,issues,pull_requests,actions' } },
  { id: 'com.gitlab/mcp', site: 'gitlab.com', title: 'GitLab', url: 'https://gitlab.com/api/v4/mcp', category: 'Engineering', description: 'Projects, issues and merge requests.' },
  { id: 'io.github.getsentry/sentry-mcp', site: 'sentry.io', title: 'Sentry', url: 'https://mcp.sentry.dev/mcp', category: 'Engineering', description: 'Errors, issues and releases.' },
  { id: 'com.vercel/vercel-mcp', site: 'vercel.com', title: 'Vercel', url: 'https://mcp.vercel.com', category: 'Engineering', description: 'Projects, deployments and logs.' },
  { id: 'com.supabase/mcp', site: 'supabase.com', title: 'Supabase', url: 'https://mcp.supabase.com/mcp', category: 'Engineering', description: 'Databases, tables and projects.' },
  { id: 'com.circleci/mcp', site: 'circleci.com', title: 'CircleCI', url: 'https://mcp.circleci.com/v1/mcp', category: 'Engineering', description: 'Pipelines, builds and test results.' },
  { id: 'tech.neon/mcp', site: 'neon.tech', title: 'Neon', url: 'https://mcp.neon.tech/mcp', category: 'Engineering', description: 'Postgres projects, branches and queries.' },
  { id: 'com.netlify/mcp', site: 'netlify.com', title: 'Netlify', url: 'https://netlify-mcp.netlify.app/mcp', category: 'Engineering', description: 'Sites, deploys and forms.' },
  { id: 'com.cloudflare/bindings', site: 'cloudflare.com', title: 'Cloudflare', url: 'https://bindings.mcp.cloudflare.com/mcp', category: 'Engineering', description: 'Workers, KV, R2 and D1.' },
  { id: 'com.postman/postman-mcp-server', site: 'postman.com', title: 'Postman', url: 'https://mcp.postman.com/mcp', category: 'Engineering', description: 'API collections, environments and monitors.' },
  { id: 'io.prisma/mcp', site: 'prisma.io', title: 'Prisma', url: 'https://mcp.prisma.io/mcp', category: 'Engineering', description: 'Prisma Postgres databases.' },
  { id: 'io.github.upstash/upstash-mcp-server', site: 'upstash.com', title: 'Upstash', url: 'https://mcp.upstash.com/mcp', category: 'Engineering', description: 'Redis databases, queues and workflows.' },
  { id: 'io.fly/fly-mcp', site: 'fly.io', title: 'Fly.io', url: 'https://mcp.fly.io', category: 'Engineering', description: 'Apps, machines and logs.' },
  { id: 'com.newrelic/mcp-server', site: 'newrelic.com', title: 'New Relic', url: 'https://mcp.newrelic.com/mcp', category: 'Monitoring', description: 'Alerts, logs, traces and dashboards.' },
  { id: 'io.github.grafana/mcp-grafana', site: 'grafana.com', title: 'Grafana', url: 'https://mcp.grafana.com/mcp', category: 'Monitoring', description: 'Dashboards, alerts and data sources.' },
  { id: 'io.honeycomb/mcp', site: 'honeycomb.io', title: 'Honeycomb', url: 'https://mcp.honeycomb.io/mcp', category: 'Monitoring', description: 'Traces, queries and SLOs.' },
  { id: 'io.github.PostHog/mcp', site: 'posthog.com', title: 'PostHog', url: 'https://mcp.posthog.com/mcp', category: 'Analytics', description: 'Product analytics, insights and feature flags.' },
  { id: 'com.amplitude/mcp-server', site: 'amplitude.com', title: 'Amplitude', url: 'https://mcp.amplitude.com/mcp', category: 'Analytics', description: 'Charts, dashboards and events.' },
  { id: 'com.statsig/statsig-mcp-server', site: 'statsig.com', title: 'Statsig', url: 'https://api.statsig.com/v1/mcp', category: 'Analytics', description: 'Feature gates, experiments and metrics.' },
  { id: 'com.figma.mcp/mcp', site: 'figma.com', title: 'Figma', url: 'https://mcp.figma.com/mcp', category: 'Design', description: 'Design files, frames and comments.' },
  { id: 'com.canva.mcp/mcp', site: 'canva.com', title: 'Canva', url: 'https://mcp.canva.com/mcp', category: 'Design', description: 'Designs, templates and exports.' },
  { id: 'io.github.miroapp/mcp-server', site: 'miro.com', title: 'Miro', url: 'https://mcp.miro.com/', category: 'Design', description: 'Boards, sticky notes and diagrams.' },
  { id: 'com.cloudinary/asset-management', site: 'cloudinary.com', title: 'Cloudinary', url: 'https://asset-management.mcp.cloudinary.com/sse', transport: 'sse', category: 'Design', description: 'Images and videos: upload, search and transform.' },
  { id: 'com.webflow/mcp', site: 'webflow.com', title: 'Webflow', url: 'https://mcp.webflow.com/mcp', category: 'Websites', description: 'Sites, pages and CMS items.' },
  { id: 'com.wix/mcp', site: 'wix.com', title: 'Wix', url: 'https://mcp.wix.com/mcp', category: 'Websites', description: 'Sites, stores and bookings.' },
  { id: 'com.typeform/typeform', site: 'typeform.com', title: 'Typeform', url: 'https://api.typeform.com/mcp', category: 'Forms', description: 'Forms and responses.' },
  { id: 'com.jotform/mcp', site: 'jotform.com', title: 'Jotform', url: 'https://mcp.jotform.com/', category: 'Forms', description: 'Forms and submissions.' },
  { id: 'com.zapier/mcp', site: 'zapier.com', title: 'Zapier', url: 'https://mcp.zapier.com/api/v1/connect', category: 'Automation', description: 'Actions across thousands of apps, through your Zapier account.' },
  { id: 'com.make/mcp-server', site: 'make.com', title: 'Make', url: 'https://mcp.make.com/v2', category: 'Automation', description: 'Run your Make scenarios.' },
  { id: 'com.ifttt/mcp', site: 'ifttt.com', title: 'IFTTT', url: 'https://ifttt.com/mcp', category: 'Automation', description: 'Run applets across your connected services.' },
  { id: 'com.apify/apify-mcp-server', site: 'apify.com', title: 'Apify', url: 'https://mcp.apify.com/', category: 'Web data', description: 'Scrapers and crawlers (Apify Actors).' },
  { id: 'io.github.firecrawl/firecrawl-mcp-server', site: 'firecrawl.dev', title: 'Firecrawl', url: 'https://mcp.firecrawl.dev/v2/mcp', category: 'Web data', description: 'Search the web, read pages and files, map and crawl sites. Add an API key for crawling, mapping and monitors.' },
  { id: 'ai.exa/exa', site: 'exa.ai', title: 'Exa', url: 'https://mcp.exa.ai/mcp', category: 'Web data', description: 'Web search built for AI.' },
  { id: 'com.scrapingbee/mcp', site: 'scrapingbee.com', title: 'ScrapingBee', url: 'https://mcp.scrapingbee.com/mcp', category: 'Web data', description: 'Scrape pages, screenshots and search results.' },
  { id: 'io.github.algolia/algolia-productivity', site: 'algolia.com', title: 'Algolia', url: 'https://mcp.algolia.com/mcp', category: 'Web data', description: 'Search indices, records and analytics.' },
  { id: 'io.github.mapbox/mcp-server', site: 'mapbox.com', title: 'Mapbox', url: 'https://mcp.mapbox.com/mcp', category: 'Web data', description: 'Places, directions and travel times.' },
  { id: 'com.twelvedata/mcp', site: 'twelvedata.com', title: 'Twelve Data', url: 'https://mcp.twelvedata.com/mcp', category: 'Web data', description: 'Stock, forex and crypto prices.' },
  { id: 'io.github.alphavantage/alpha_vantage_mcp', site: 'alphavantage.co', title: 'Alpha Vantage', url: 'https://mcp.alphavantage.co/mcp', category: 'Web data', description: 'Market data, fundamentals and economic indicators.' },
  { id: 'co.huggingface/hf-mcp-server', site: 'huggingface.co', title: 'Hugging Face', url: 'https://huggingface.co/mcp?login', category: 'AI', description: 'Models, datasets and Spaces.' },
]

/** A catalog entry as a directory server (what the generator takes). */
export function catalogServer(entry: AppCatalogEntry): McpDirectoryServer {
  return { id: entry.id, title: entry.title, description: entry.description, url: entry.url, transport: entry.transport ?? 'streamable-http', source: 'registry', verified: true, ...(entry.headers ? { headers: entry.headers } : {}) }
}

/** The server for an app id: from the catalog, else the directory
 * (saved servers, then the registry). */
export async function appServer(id: string): Promise<McpDirectoryServer | undefined> {
  const entry = APP_CATALOG.find((a) => a.id === id)
  return entry ? catalogServer(entry) : getMcpServer(id)
}

// Icons are found once, in the background: the registry's icon, else the
// icons the app's home page declares, else DuckDuckGo's copy of its
// favicon; each is fetched to check it really is an image (some
// registry icons are gone). An app with none
// shows its first letter.
const icons = new Map<string, string | null>()
let iconsLoading: Promise<void> | undefined
const ICON_FETCH = { redirect: 'follow' as const, headers: { 'user-agent': 'Mozilla/5.0 (compatible; LoopEngine)' } }

async function isImage(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { ...ICON_FETCH, signal: AbortSignal.timeout(8000) })
    const type = res.headers.get('content-type') ?? ''
    await res.body?.cancel()
    return res.ok && /^image\/|octet-stream|icon/.test(type)
  } catch {
    return false
  }
}

/** The icons a page's <link rel="...icon"> tags declare, largest first. */
export function pageIcons(html: string, base: string): string[] {
  const found: { href: string; size: number }[] = []
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    const attr = (name: string) => tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'))?.slice(2).find((v) => v !== undefined)
    const rel = (attr('rel') ?? '').toLowerCase()
    const href = attr('href')
    if (!href || !/(^|\s)(icon|apple-touch-icon(-precomposed)?)(\s|$)/.test(rel) || /mask-icon/.test(rel)) continue
    let url: string
    try {
      url = new URL(href.replace(/&amp;/g, '&'), base).toString()
    } catch {
      continue
    }
    const size = Number((attr('sizes') ?? '').match(/(\d+)/)?.[1] ?? (rel.includes('apple') ? 180 : /\.svg(\?|$)/i.test(url) ? 256 : 16))
    found.push({ href: url, size })
  }
  return found.sort((a, b) => b.size - a.size).map((f) => f.href).filter((h, i, all) => all.indexOf(h) === i)
}

async function findIcon(entry: AppCatalogEntry): Promise<string | null> {
  try {
    const listed = (await getMcpServer(entry.id))?.icon
    if (listed && await isImage(listed)) return listed
  } catch {
    // The registry is unreachable; look on the app's site.
  }
  try {
    const res = await fetch(`https://${entry.site}/`, { ...ICON_FETCH, signal: AbortSignal.timeout(8000) })
    if (res.ok) {
      for (const icon of pageIcons(await res.text(), res.url).slice(0, 4)) if (await isImage(icon)) return icon
    }
  } catch {
    // Fall back to DuckDuckGo's copy.
  }
  // Else DuckDuckGo's copy of the site's favicon: a site's own
  // /favicon.ico is often missing, or turned away from anything but a
  // browser. DuckDuckGo answers 404 for a site it has none for.
  const copy = `https://icons.duckduckgo.com/ip3/${entry.site}.ico`
  return (await isImage(copy)) ? copy : null
}

/** Starts finding the catalog's icons (once); resolves when done. */
export function loadAppIcons(): Promise<void> {
  iconsLoading ??= (async () => {
    for (let i = 0; i < APP_CATALOG.length; i += 8) {
      await Promise.all(APP_CATALOG.slice(i, i + 8).map(async (entry) => {
        icons.set(entry.id, await findIcon(entry))
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
  /** Connected by signing in (OAuth): the setting the sign-in is kept
   * in. keySet then says whether it's still there. */
  oauthEnv?: string
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
    const oauthEnv = manifest.mcp?.auth?.type === 'oauth' ? manifest.mcp.auth.env : undefined
    return [{
      ...(manifest.generatedFrom?.server ?? entry?.id ? { id: manifest.generatedFrom?.server ?? entry!.id } : {}),
      title: entry?.title || a.description.split(':')[0].replace(/ \(made from its MCP server\)$/, '') || a.name,
      url,
      ability: a.name,
      spec: a.spec,
      tools,
      ...(keyEnv ? { keyEnv } : {}),
      ...(oauthEnv ? { oauthEnv } : {}),
      keySet: keyEnv || oauthEnv ? envValue((keyEnv || oauthEnv)!) !== undefined : true,
      agents: Object.entries(agentAbilities).filter(([, names]) => names.includes(a.name)).map(([agent]) => agent),
      connectedAt: a.installedAt,
    }]
  })
}

/** The catalog, each app marked connected or not, with its icon once known. */
export function appCatalog(connected: ConnectedApp[]): AppView[] {
  return APP_CATALOG.map((entry) => {
    // Until its icon is found, DuckDuckGo's copy is the best guess.
    const icon = icons.has(entry.id) ? icons.get(entry.id) : `https://icons.duckduckgo.com/ip3/${entry.site}.ico`
    return {
      ...entry,
      ...(icon ? { icon } : {}),
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
