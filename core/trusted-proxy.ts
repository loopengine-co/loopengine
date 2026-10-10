// Auth for a server that only ever receives requests through a trusted
// proxy (a hosting router that has already authenticated the user) —
// enabled by LOOPENGINE_TRUSTED_PROXY_SECRET, off otherwise. The proxy
// sends who the caller is in an X-LoopEngine-Identity header, signed with
// that shared secret, so this server can trust it without seeing the
// user's own credentials.
//
// Header format: `<payload>.<signature>`, both base64url — payload is the
// JSON identity, signature is HMAC-SHA256(secret, payload). `exp` (Unix
// seconds) keeps a captured header from being replayed indefinitely.
import { createHmac, timingSafeEqual } from 'node:crypto'

export const TRUSTED_PROXY_IDENTITY_HEADER = 'x-loopengine-identity'

export interface ProxyIdentity {
  /** The authenticated user (or `system` for the control plane itself). */
  sub: string
  workspace?: string
  role: string
  /** Expiry, Unix seconds. */
  exp: number
}

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url')
}

/** What the proxy puts in X-LoopEngine-Identity — exported so a router
 * (and tests) produce exactly the format verifyProxyIdentity accepts. */
export function signProxyIdentity(identity: ProxyIdentity, secret: string): string {
  const payload = Buffer.from(JSON.stringify(identity)).toString('base64url')
  return `${payload}.${sign(payload, secret)}`
}

/** The identity, or undefined for a missing, malformed, wrongly-signed
 * or expired header. */
export function verifyProxyIdentity(header: string | string[] | undefined, secret: string, nowMs = Date.now()): ProxyIdentity | undefined {
  if (typeof header !== 'string') return undefined
  const dot = header.indexOf('.')
  if (dot <= 0) return undefined
  const payload = header.slice(0, dot)
  const provided = Buffer.from(header.slice(dot + 1))
  const expected = Buffer.from(sign(payload, secret))
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return undefined

  let identity: ProxyIdentity
  try {
    identity = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as ProxyIdentity
  } catch {
    return undefined
  }
  if (typeof identity.sub !== 'string' || typeof identity.role !== 'string' || typeof identity.exp !== 'number') return undefined
  if (identity.exp * 1000 <= nowMs) return undefined
  return identity
}
