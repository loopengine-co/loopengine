// Anchors the audit log's hash chain (core/audit-store.ts) outside the
// workspace: once a day, the latest event's id and hash go to
// loopengine.co (POST /api/workspace/audit-anchors), which keeps them
// where the workspace can't rewrite them. Checking the log
// (GET /audit/verify) fetches them back (GET on the same path) and
// matches each against the chain, so rewriting the whole chain to hide a
// change still shows.
//
// Signed like the workspace's other reports (web/lever-events-sync.ts):
// X-LoopEngine-Workspace names the workspace (from LOOPENGINE_PUBLIC_URL),
// X-LoopEngine-Signature is t=<unix seconds>,v1=<HMAC-SHA256 of
// "<t>.<body>"> with LOOPENGINE_TRUSTED_PROXY_SECRET (an empty body for
// the GET). Off outside LoopEngine Cloud: the anchors are then only kept
// in the workspace's own database, which shows a changed event but not a
// rewritten chain.
import { createHmac } from 'node:crypto'
import { lastAnchor, latestEventHash, noteAnchor } from './audit-store.js'

export const AUDIT_ANCHORS_PATH = '/api/workspace/audit-anchors'
const DAY_MS = 24 * 60 * 60 * 1000

export interface AnchorConfig {
  url: string
  slug: string
  secret: string
}

/** Where anchors go and how to sign, or why they stay local. */
export function anchorConfig(env: NodeJS.ProcessEnv = process.env): AnchorConfig | { off: string } {
  const secret = env.LOOPENGINE_TRUSTED_PROXY_SECRET
  if (!secret) return { off: 'not a LoopEngine Cloud workspace' }
  let slug: string | undefined
  try {
    slug = env.LOOPENGINE_PUBLIC_URL ? new URL(env.LOOPENGINE_PUBLIC_URL).hostname.split('.')[0] : undefined
  } catch {}
  if (!slug) return { off: 'LOOPENGINE_PUBLIC_URL is needed to name the workspace' }
  return { url: `${(env.LOOPENGINE_CONTROL_PLANE_URL || 'https://loopengine.co').replace(/\/+$/, '')}${AUDIT_ANCHORS_PATH}`, slug, secret }
}

export function signAnchorRequest(body: string, timestamp: number, secret: string): string {
  return `t=${timestamp},v1=${createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')}`
}

function headers(config: AnchorConfig, body: string): Record<string, string> {
  return { 'content-type': 'application/json', 'x-loopengine-workspace': config.slug, 'x-loopengine-signature': signAnchorRequest(body, Math.floor(Date.now() / 1000), config.secret) }
}

export type AnchorResult = { status: 'sent' | 'kept-here'; eventId: number } | { status: 'nothing-new' } | { status: 'failed'; reason: string }

/** Anchors the latest event, unless it already is. Never throws. Off
 * Cloud, the anchor is noted only here. */
export async function anchorLatest(config: AnchorConfig | { off: string } = anchorConfig(), fetchImpl: typeof fetch = fetch): Promise<AnchorResult> {
  const latest = latestEventHash()
  if (!latest) return { status: 'nothing-new' }
  const last = lastAnchor()
  if (last && last.eventId === latest.id && (last.sentAt || 'off' in config)) return { status: 'nothing-new' }
  if ('off' in config) {
    noteAnchor({ eventId: latest.id, hash: latest.hash, at: latest.at })
    return { status: 'kept-here', eventId: latest.id }
  }
  const body = JSON.stringify({ eventId: latest.id, hash: latest.hash, eventAt: latest.at })
  try {
    const res = await fetchImpl(config.url, { method: 'POST', headers: headers(config, body), body, signal: AbortSignal.timeout(15_000) })
    if (!res.ok) return { status: 'failed', reason: `loopengine.co answered ${res.status}` }
  } catch (err) {
    return { status: 'failed', reason: `couldn't reach ${config.url}: ${err instanceof Error ? err.message : String(err)}` }
  }
  noteAnchor({ eventId: latest.id, hash: latest.hash, at: latest.at, sentAt: new Date().toISOString() })
  return { status: 'sent', eventId: latest.id }
}

/** The anchors kept at loopengine.co, or undefined off Cloud or when
 * they can't be fetched (with why). */
export async function fetchAnchors(config: AnchorConfig | { off: string } = anchorConfig(), fetchImpl: typeof fetch = fetch): Promise<{ anchors: { eventId: number; hash: string }[] } | { unavailable: string }> {
  if ('off' in config) return { unavailable: config.off }
  try {
    const res = await fetchImpl(config.url, { headers: headers(config, ''), signal: AbortSignal.timeout(15_000) })
    if (!res.ok) return { unavailable: `loopengine.co answered ${res.status}` }
    const body = (await res.json()) as { anchors?: { eventId?: unknown; hash?: unknown }[] }
    const anchors = (body.anchors ?? []).flatMap((a) => (typeof a.eventId === 'number' && typeof a.hash === 'string' ? [{ eventId: a.eventId, hash: a.hash }] : []))
    return { anchors }
  } catch (err) {
    return { unavailable: `couldn't reach loopengine.co: ${err instanceof Error ? err.message : String(err)}` }
  }
}

/** Anchors now (a minute after start) and then daily. */
export function startAuditAnchoring(log: (message: string) => void = () => {}): void {
  const run = () => void anchorLatest().then((r) => {
    if (r.status === 'failed') log(`[loopengine] couldn't anchor the audit log: ${r.reason}`)
  })
  setTimeout(run, 60_000).unref()
  setInterval(run, DAY_MS).unref()
}
