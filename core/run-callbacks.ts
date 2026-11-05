// Callbacks for workflow runs started over the API: a run started with
// "callback_url" has its record posted there when it finishes, fails, or
// stops for an approval or a question (core/workflow-runs.ts calls
// deliverRunCallback for each of those).
//
// Each POST carries
//   X-LoopEngine-Event: run.done | run.failed | run.awaiting_approval
//   X-LoopEngine-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<body>">
// signed with the workspace's callback secret: LOOPENGINE_CALLBACK_SECRET,
// or one made once and kept in the scheduler's folder
// (GET /runs/callback-secret shows it). A receiver checks the signature
// and that t is recent.
//
// Only https URLs on public addresses are accepted, so a run can't be
// pointed at the workspace's own network. LOOPENGINE_ALLOW_LOCAL_CALLBACKS=1
// also allows http and local addresses, for development.
import { createHmac, randomBytes } from 'node:crypto'
import { lookup } from 'node:dns/promises'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { isIP } from 'node:net'
import path from 'node:path'

export class CallbackUrlError extends Error {}

export type RunCallbackEvent = 'run.done' | 'run.failed' | 'run.awaiting_approval'

function allowLocal(): boolean {
  return process.env.LOOPENGINE_ALLOW_LOCAL_CALLBACKS === '1'
}

/** Whether an IP address is private, loopback, link-local or otherwise
 * not on the public internet. */
export function isPrivateAddress(address: string): boolean {
  const ip = address.toLowerCase().replace(/^\[|\]$/g, '')
  const v4 = ip.startsWith('::ffff:') ? ip.slice(7) : ip
  if (isIP(v4) === 4) {
    const [a, b] = v4.split('.').map(Number) as [number, number]
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224
  }
  if (isIP(ip) === 6) {
    return ip === '::' || ip === '::1' || /^f[cd]/.test(ip) || /^fe[89ab]/.test(ip) || ip.startsWith('ff')
  }
  return false
}

/** Checks a callback URL as given; returns it normalised. Throws
 * CallbackUrlError saying what's wrong. */
export function checkCallbackUrl(raw: unknown): string {
  if (typeof raw !== 'string' || !raw.trim()) throw new CallbackUrlError('callback_url must be a URL, e.g. "https://example.com/hooks/loopengine"')
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    throw new CallbackUrlError(`callback_url "${raw}" isn't a URL`)
  }
  const host = url.hostname.toLowerCase()
  const local = host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal') || host.endsWith('.local') || isPrivateAddress(host)
  if (url.protocol !== 'https:' && !(allowLocal() && url.protocol === 'http:')) throw new CallbackUrlError('callback_url must use https')
  if (local && !allowLocal()) throw new CallbackUrlError('callback_url must be a public address, not a local or private one')
  if (url.username || url.password) throw new CallbackUrlError('callback_url must not carry a username or password; check the signature instead')
  return url.toString()
}

/** The workspace's callback secret: LOOPENGINE_CALLBACK_SECRET, or one
 * made once and kept in the scheduler's folder. */
export function callbackSecret(): string {
  if (process.env.LOOPENGINE_CALLBACK_SECRET) return process.env.LOOPENGINE_CALLBACK_SECRET
  const dir = process.env.LOOPENGINE_SCHEDULER_DIR || path.join(process.cwd(), '.scheduler')
  const file = path.join(dir, 'callback-secret')
  if (existsSync(file)) return readFileSync(file, 'utf8').trim()
  mkdirSync(dir, { recursive: true })
  const secret = randomBytes(32).toString('hex')
  writeFileSync(file, secret + '\n', { mode: 0o600 })
  return secret
}

/** The signature header for a body sent at `timestamp` (unix seconds). */
export function signCallback(body: string, timestamp: number, secret = callbackSecret()): string {
  return `t=${timestamp},v1=${createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')}`
}

export interface CallbackDelivery {
  event: RunCallbackEvent
  delivered: boolean
  attempts: number
  status_code?: number
  error?: string
  at: string
}

export interface DeliverOptions {
  /** Waits between attempts, in ms; its length + 1 is the attempts made. */
  backoffMs?: number[]
  timeoutMs?: number
  fetch?: typeof fetch
}

/** Posts `payload` to `url` for `event`, retrying a failed attempt (an
 * error, or a status other than 2xx) after each wait in backoffMs. The
 * host is looked up first, and a private address is refused (unless
 * local callbacks are allowed), so a public name can't lead inward. */
export async function deliverCallback(url: string, event: RunCallbackEvent, payload: unknown, options: DeliverOptions = {}): Promise<CallbackDelivery> {
  const backoff = options.backoffMs ?? [2_000, 10_000, 30_000]
  const doFetch = options.fetch ?? fetch
  const body = JSON.stringify(payload)
  let last: CallbackDelivery = { event, delivered: false, attempts: 0, at: new Date().toISOString() }
  for (let attempt = 0; attempt <= backoff.length; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, backoff[attempt - 1]))
    const at = new Date().toISOString()
    try {
      if (!allowLocal()) {
        const addresses = await lookup(new URL(url).hostname, { all: true })
        if (addresses.some((a) => isPrivateAddress(a.address))) {
          return { event, delivered: false, attempts: attempt + 1, error: 'The callback address leads to a private network.', at }
        }
      }
      const timestamp = Math.floor(Date.now() / 1000)
      const response = await doFetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-loopengine-event': event, 'x-loopengine-signature': signCallback(body, timestamp), 'user-agent': 'LoopEngine-Callback/1' },
        body,
        signal: AbortSignal.timeout(options.timeoutMs ?? 10_000),
        redirect: 'manual',
      })
      last = { event, delivered: response.ok, attempts: attempt + 1, status_code: response.status, at, ...(response.ok ? {} : { error: `It answered ${response.status}.` }) }
      if (response.ok) return last
    } catch (err) {
      last = { event, delivered: false, attempts: attempt + 1, error: err instanceof Error ? err.message : String(err), at }
    }
  }
  return last
}

/** What a run's callback carries: the event and the run's record, without
 * its session id, its first message or past callback deliveries. */
export function runCallbackPayload(event: RunCallbackEvent, run: object): { event: RunCallbackEvent; run: Record<string, unknown> } {
  const { session_id: _session, message: _message, callbacks: _callbacks, ...rest } = run as Record<string, unknown>
  return { event, run: rest }
}
