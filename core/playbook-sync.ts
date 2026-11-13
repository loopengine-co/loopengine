// Keeps a LoopEngine Cloud workspace's playbook current between upgrades:
// once at start and then daily, it asks loopengine.co for the latest
// playbook (GET /api/workspace/playbook) and keeps it in the project,
// .loopengine/playbook-cache.json, beside the copy bundled with the
// package, which it never touches. goal-playbooks.ts merges the two by
// lever id (the fetched one wins, and can retire levers), so updates reach
// every workspace within a day with no Upgrade.
//
// The request is signed like the workspace's run reports
// (loopengine-cloud/workspace/metering.mjs): X-LoopEngine-Workspace names
// the workspace (from LOOPENGINE_PUBLIC_URL), X-LoopEngine-Signature is
// t=<unix seconds>,v1=<HMAC-SHA256 of "<t>.GET /api/workspace/playbook">
// with LOOPENGINE_TRUSTED_PROXY_SECRET. It sends the version it has
// (If-None-Match), so an unchanged playbook costs a few bytes. A fetch
// that fails, or a playbook that doesn't pass the same checks as the
// bundled one, leaves the last good copy in place: planning never depends
// on the network. Off outside LoopEngine Cloud (no secret), unless
// LOOPENGINE_PLAYBOOK_URL points somewhere.
import { createHmac } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { parsePlaybook, type Lever } from './system-agents/goal-playbooks.js'

export const PLAYBOOK_PATH = '/api/workspace/playbook'
const DAY_MS = 24 * 60 * 60 * 1000

export interface PlaybookCache {
  etag: string
  version: number
  fetchedAt: string
  levers: Lever[]
  /** Lever ids the bundled playbook has that are no longer suggested. */
  retired: string[]
}

export interface PlaybookSyncConfig {
  url: string
  slug?: string
  secret?: string
}

export function playbookCacheFile(projectDir: string): string {
  return join(projectDir, '.loopengine', 'playbook-cache.json')
}

/** Where to fetch from and how to sign, or why syncing is off. */
export function playbookSyncConfig(env: NodeJS.ProcessEnv = process.env): PlaybookSyncConfig | { off: string } {
  if (env.LOOPENGINE_PLAYBOOK_SYNC === 'off') return { off: 'LOOPENGINE_PLAYBOOK_SYNC is off' }
  const secret = env.LOOPENGINE_TRUSTED_PROXY_SECRET
  const explicit = env.LOOPENGINE_PLAYBOOK_URL
  if (!secret && !explicit) return { off: 'not a LoopEngine Cloud workspace' }
  let slug: string | undefined
  if (env.LOOPENGINE_PUBLIC_URL) {
    try {
      slug = new URL(env.LOOPENGINE_PUBLIC_URL).hostname.split('.')[0]
    } catch {}
  }
  if (secret && !slug) return { off: 'LOOPENGINE_PUBLIC_URL is needed to name the workspace' }
  const url = explicit || `${(env.LOOPENGINE_CONTROL_PLANE_URL || 'https://loopengine.co').replace(/\/+$/, '')}${PLAYBOOK_PATH}`
  return { url, ...(slug ? { slug } : {}), ...(secret ? { secret } : {}) }
}

export function signPlaybookRequest(timestamp: number, secret: string): string {
  return `t=${timestamp},v1=${createHmac('sha256', secret).update(`${timestamp}.GET ${PLAYBOOK_PATH}`).digest('hex')}`
}

export function readPlaybookCache(projectDir: string): PlaybookCache | undefined {
  try {
    const raw = JSON.parse(readFileSync(playbookCacheFile(projectDir), 'utf8')) as PlaybookCache
    const { levers } = parsePlaybook({ levers: raw.levers })
    return { ...raw, levers, retired: Array.isArray(raw.retired) ? raw.retired.filter((x) => typeof x === 'string') : [] }
  } catch {
    return undefined
  }
}

function writeCache(projectDir: string, cache: PlaybookCache): void {
  const file = playbookCacheFile(projectDir)
  mkdirSync(dirname(file), { recursive: true })
  const temp = `${file}.${process.pid}.tmp`
  writeFileSync(temp, `${JSON.stringify(cache, null, 2)}\n`)
  renameSync(temp, file)
}

export type PlaybookSyncResult =
  | { status: 'updated'; version: number; levers: number }
  | { status: 'unchanged' }
  | { status: 'kept'; reason: string }

/** One fetch. Never throws: a failure keeps what's there. */
export async function syncPlaybook(projectDir: string, config: PlaybookSyncConfig, fetchImpl: typeof fetch = fetch, nowMs = Date.now()): Promise<PlaybookSyncResult> {
  const cached = readPlaybookCache(projectDir)
  const headers: Record<string, string> = { accept: 'application/json' }
  if (config.slug) headers['x-loopengine-workspace'] = config.slug
  if (config.secret) headers['x-loopengine-signature'] = signPlaybookRequest(Math.floor(nowMs / 1000), config.secret)
  if (cached?.etag) headers['if-none-match'] = cached.etag
  let res: Response
  try {
    res = await fetchImpl(config.url, { headers, signal: AbortSignal.timeout(15_000) })
  } catch (err) {
    return { status: 'kept', reason: `couldn't reach ${config.url}: ${err instanceof Error ? err.message : String(err)}` }
  }
  if (res.status === 304 && cached) {
    writeCache(projectDir, { ...cached, fetchedAt: new Date(nowMs).toISOString() })
    return { status: 'unchanged' }
  }
  if (!res.ok) return { status: 'kept', reason: `the playbook server answered ${res.status}` }
  try {
    const body = (await res.json()) as { version?: unknown; levers?: unknown; retired?: unknown }
    const { version, levers } = parsePlaybook(body)
    const retired = Array.isArray(body.retired) ? body.retired.filter((x): x is string => typeof x === 'string') : []
    const etag = res.headers.get('etag') ?? `v${version}`
    writeCache(projectDir, { etag, version, fetchedAt: new Date(nowMs).toISOString(), levers, retired })
    return { status: 'updated', version, levers: levers.length }
  } catch (err) {
    return { status: 'kept', reason: `the fetched playbook didn't pass its checks: ${err instanceof Error ? err.message : String(err)}` }
  }
}

/** Syncs now, then daily. Returns a stop function; does nothing when off. */
export function startPlaybookSync(projectDir: string, log: (message: string) => void = () => {}, env: NodeJS.ProcessEnv = process.env): () => void {
  const config = playbookSyncConfig(env)
  if ('off' in config) return () => {}
  const run = () => {
    void syncPlaybook(projectDir, config).then((r) => {
      if (r.status === 'updated') log(`[loopengine] playbook updated to version ${r.version} (${r.levers} levers)`)
      if (r.status === 'kept') log(`[loopengine] playbook kept as it was: ${r.reason}`)
    })
  }
  run()
  const timer = setInterval(run, DAY_MS)
  timer.unref()
  return () => clearInterval(timer)
}

export function playbookCacheExists(projectDir: string): boolean {
  return existsSync(playbookCacheFile(projectDir))
}
