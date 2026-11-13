// Sends the workspace's lever events (goals/lever-events.jsonl, written by
// web/goals-admin.ts) to loopengine.co, so the goal planner's playbook can
// learn from every workspace: which levers people save, build, keep and
// use, by kind of business. Only while sharing is on: on by default in a
// LoopEngine Cloud workspace, off elsewhere, and set by the person on the
// Goals page (goals/about.json, shareLeverStats).
//
// What's sent is anonymous: the event's id, type and time, the lever's id
// (or, for the planner's own idea, its generic label), focus, playbook
// version, the workspace's kind of business, an opaque id linking one
// workflow's events, and counts or buckets. Never a goal's, a request's or
// a workflow's text, agent names, or anything from runs.
//
// Signed like the workspace's run reports: X-LoopEngine-Workspace names it,
// X-LoopEngine-Signature is t=<unix seconds>,v1=<HMAC-SHA256 of
// "<t>.<body>"> with LOOPENGINE_TRUSTED_PROXY_SECRET. It remembers how far
// it got (goals/lever-events.sent, a byte offset), so each event is sent
// once; one that fails is sent again next time, and loopengine.co keeps
// one copy of each.
import { createHmac } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const LEVER_EVENTS_PATH = '/api/workspace/lever-events'
const MAX_BATCH = 500
const INTERVAL_MS = 10 * 60 * 1000

export interface LeverEventsSyncConfig {
  url: string
  slug: string
  secret: string
}

/** Where to send and how to sign, or why sending is off. */
export function leverEventsSyncConfig(env: NodeJS.ProcessEnv = process.env): LeverEventsSyncConfig | { off: string } {
  const secret = env.LOOPENGINE_TRUSTED_PROXY_SECRET
  if (!secret) return { off: 'not a LoopEngine Cloud workspace' }
  let slug: string | undefined
  try {
    slug = env.LOOPENGINE_PUBLIC_URL ? new URL(env.LOOPENGINE_PUBLIC_URL).hostname.split('.')[0] : undefined
  } catch {}
  if (!slug) return { off: 'LOOPENGINE_PUBLIC_URL is needed to name the workspace' }
  const url = `${(env.LOOPENGINE_CONTROL_PLANE_URL || 'https://loopengine.co').replace(/\/+$/, '')}${LEVER_EVENTS_PATH}`
  return { url, slug, secret }
}

function settings(projectDir: string): { shareLeverStats?: boolean; businessKind?: string } {
  try {
    return JSON.parse(readFileSync(join(projectDir, 'goals', 'about.json'), 'utf8')) as { shareLeverStats?: boolean; businessKind?: string }
  } catch {
    return {}
  }
}

/** Whether this workspace shares lever stats: its own choice, else on for
 * a Cloud workspace. */
export function sharesLeverStats(projectDir: string, env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.LOOPENGINE_LEVER_SHARING === 'off') return false
  const choice = settings(projectDir).shareLeverStats
  return typeof choice === 'boolean' ? choice : Boolean(env.LOOPENGINE_TRUSTED_PROXY_SECRET)
}

export function signLeverEvents(body: string, timestamp: number, secret: string): string {
  return `t=${timestamp},v1=${createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')}`
}

/** An event as it leaves the workspace: only the anonymous fields. */
export function outgoingLeverEvent(e: Record<string, unknown>, businessKind: string | undefined): Record<string, unknown> {
  return {
    id: e.id,
    type: e.type,
    ...(typeof e.leverId === 'string' ? { leverId: e.leverId } : {}),
    lever: e.lever,
    focus: e.focus,
    ...(typeof e.playbookVersion === 'number' ? { playbookVersion: e.playbookVersion } : {}),
    ...(businessKind ? { businessKind } : {}),
    workflowRef: e.goalWorkflow,
    detail: e.detail && typeof e.detail === 'object' ? e.detail : {},
    at: e.at,
  }
}

export type LeverEventsSendResult = { status: 'off'; reason: string } | { status: 'nothing' } | { status: 'sent'; events: number } | { status: 'failed'; reason: string }

/** Sends what hasn't been sent yet, in batches. Never throws. */
export async function sendLeverEvents(projectDir: string, config: LeverEventsSyncConfig, fetchImpl: typeof fetch = fetch, env: NodeJS.ProcessEnv = process.env): Promise<LeverEventsSendResult> {
  if (!sharesLeverStats(projectDir, env)) return { status: 'off', reason: 'sharing is off' }
  const file = join(projectDir, 'goals', 'lever-events.jsonl')
  const offsetFile = join(projectDir, 'goals', 'lever-events.sent')
  if (!existsSync(file)) return { status: 'nothing' }
  const all = readFileSync(file)
  let offset = 0
  try {
    offset = Number(readFileSync(offsetFile, 'utf8')) || 0
  } catch {}
  if (offset > all.length) offset = 0
  const { businessKind } = settings(projectDir)
  let sent = 0
  while (offset < all.length) {
    // Whole lines only: one still being written waits for next time.
    const rest = all.subarray(offset).toString('utf8')
    const lines: string[] = []
    let bytes = 0
    for (const line of rest.split('\n').slice(0, -1)) {
      if (lines.length >= MAX_BATCH) break
      lines.push(line)
      bytes += Buffer.byteLength(line, 'utf8') + 1
    }
    if (!lines.length) break
    const events = lines.flatMap((line) => {
      try {
        return [outgoingLeverEvent(JSON.parse(line) as Record<string, unknown>, businessKind)]
      } catch {
        return []
      }
    })
    if (events.length) {
      const body = JSON.stringify({ events })
      try {
        const res = await fetchImpl(config.url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-loopengine-workspace': config.slug, 'x-loopengine-signature': signLeverEvents(body, Math.floor(Date.now() / 1000), config.secret) },
          body,
          signal: AbortSignal.timeout(15_000),
        })
        if (!res.ok) return { status: 'failed', reason: `loopengine.co answered ${res.status}` }
      } catch (err) {
        return { status: 'failed', reason: err instanceof Error ? err.message : String(err) }
      }
    }
    offset += bytes
    sent += events.length
    writeFileSync(offsetFile, String(offset))
  }
  return sent ? { status: 'sent', events: sent } : { status: 'nothing' }
}

/** Sends now, then every ten minutes. Returns a stop function. */
export function startLeverEventsSync(projectDir: string, log: (message: string) => void = () => {}, env: NodeJS.ProcessEnv = process.env): () => void {
  const config = leverEventsSyncConfig(env)
  if ('off' in config) return () => {}
  const run = () => {
    void sendLeverEvents(projectDir, config, fetch, env).then((r) => {
      if (r.status === 'failed') log(`[loopengine] lever events not sent yet: ${r.reason}`)
    })
  }
  run()
  const timer = setInterval(run, INTERVAL_MS)
  timer.unref()
  return () => clearInterval(timer)
}
