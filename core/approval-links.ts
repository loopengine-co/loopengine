// Decision links: a signed, expiring URL for one waiting approval or
// question (/decide/<token>) that opens a small page where whoever has
// the link can approve, deny or answer — no admin login, no app of your
// own, no Slack interactivity setup. Every notifier that knows where this
// server is reachable puts one in its message.
//
// The token only names the pendingId, its kind and an expiry, signed
// with HMAC-SHA256. It's single-use by construction: once the decision
// is made the pending item no longer exists, so the same link just shows
// "already decided."
//
// The signing secret is LOOPENGINE_LINK_SECRET when set (required for a
// deployment with more than one server, which must share it), otherwise
// one generated on first use and kept in .checkpoints/link-secret next to
// the paused turns it unlocks, so links keep working across restarts.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export type DecisionKind = 'approval' | 'question'

/** How long a link works: 7 days, or LOOPENGINE_LINK_TTL_HOURS. */
export function decisionLinkTtlMs(): number {
  const hours = Number(process.env.LOOPENGINE_LINK_TTL_HOURS)
  return (Number.isFinite(hours) && hours > 0 ? hours : 24 * 7) * 3_600_000
}

let generatedSecret: string | undefined

function linkSecret(): string {
  if (process.env.LOOPENGINE_LINK_SECRET) return process.env.LOOPENGINE_LINK_SECRET
  if (generatedSecret) return generatedSecret
  const dir = join(process.cwd(), '.checkpoints')
  const path = join(dir, 'link-secret')
  if (existsSync(path)) {
    generatedSecret = readFileSync(path, 'utf8').trim()
  } else {
    generatedSecret = randomBytes(32).toString('hex')
    mkdirSync(dir, { recursive: true })
    writeFileSync(path, generatedSecret + '\n', { mode: 0o600 })
  }
  return generatedSecret
}

function sign(body: string): string {
  return createHmac('sha256', linkSecret()).update(body).digest('base64url')
}

export function createDecisionToken(pendingId: string, kind: DecisionKind, nowMs = Date.now()): string {
  const body = Buffer.from(JSON.stringify({ p: pendingId, k: kind, exp: nowMs + decisionLinkTtlMs() })).toString('base64url')
  return `${body}.${sign(body)}`
}

/** The pendingId and kind a token names, or null for a malformed,
 * tampered or expired one. */
export function verifyDecisionToken(token: string, nowMs = Date.now()): { pendingId: string; kind: DecisionKind; expiresAt: number } | null {
  const [body, signature] = token.split('.')
  if (!body || !signature) return null
  const expected = Buffer.from(sign(body))
  const actual = Buffer.from(signature)
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as { p?: unknown; k?: unknown; exp?: unknown }
    if (typeof payload.p !== 'string' || (payload.k !== 'approval' && payload.k !== 'question') || typeof payload.exp !== 'number') return null
    if (nowMs > payload.exp) return null
    return { pendingId: payload.p, kind: payload.k, expiresAt: payload.exp }
  } catch {
    return null
  }
}

export function decidePath(pendingId: string, kind: DecisionKind): string {
  return `/decide/${createDecisionToken(pendingId, kind)}`
}

/** Builds full decision links against `baseUrl` — undefined when there's
 * no base URL to build them against. */
export type DecideLinkMaker = (pendingId: string, kind: DecisionKind) => string | undefined

export function decideLinkMaker(baseUrl: string | undefined): DecideLinkMaker {
  return (pendingId, kind) => (baseUrl ? baseUrl.replace(/\/+$/, '') + decidePath(pendingId, kind) : undefined)
}
