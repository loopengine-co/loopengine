// Tells loopengine.co the workspace's agents' names, so its dashboard can
// offer them when an owner or admin chooses which agents an approver or
// viewer sees. Only the names: nothing about what the agents do. Sent when
// the server starts and whenever an agent is added or removed; a send that
// fails is tried again a few minutes later.
//
// Signed like the workspace's run reports (web/lever-events-sync.ts):
// X-LoopEngine-Workspace names it, X-LoopEngine-Signature is t=<unix
// seconds>,v1=<HMAC-SHA256 of "<t>.<body>"> with
// LOOPENGINE_TRUSTED_PROXY_SECRET. Off outside LoopEngine Cloud.
import { leverEventsSyncConfig, signLeverEvents } from './lever-events-sync.js'

export const AGENT_NAMES_PATH = '/api/workspace/agents'
const RETRY_MS = 5 * 60 * 1000

export interface AgentNamesReporter {
  /** Sends the names if they changed since the last send that worked. */
  report(): Promise<void>
}

export function createAgentNamesReporter(
  list: () => string[],
  deps: { env?: NodeJS.ProcessEnv; fetch?: typeof fetch; log?: (message: string) => void; retryMs?: number } = {},
): AgentNamesReporter {
  const config = leverEventsSyncConfig(deps.env ?? process.env)
  const doFetch = deps.fetch ?? fetch
  let sent: string | undefined
  let retry: ReturnType<typeof setTimeout> | undefined
  async function report(): Promise<void> {
    if ('off' in config) return
    const body = JSON.stringify({ agents: [...new Set(list())].sort() })
    if (body === sent) return
    if (retry) clearTimeout(retry)
    retry = undefined
    try {
      const res = await doFetch(config.url.replace(/\/api\/workspace\/lever-events$/, AGENT_NAMES_PATH), {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-loopengine-workspace': config.slug, 'x-loopengine-signature': signLeverEvents(body, Math.floor(Date.now() / 1000), config.secret) },
        body,
        signal: AbortSignal.timeout(10_000),
      })
      // An older loopengine.co doesn't take them yet; nothing to retry.
      if (res.status === 404) {
        sent = body
        return
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      sent = body
    } catch (err) {
      deps.log?.(`[loopengine] couldn't send the agent list to loopengine.co (trying again shortly): ${err instanceof Error ? err.message : String(err)}`)
      retry = setTimeout(() => void report(), deps.retryMs ?? RETRY_MS)
      retry.unref?.()
    }
  }
  return { report }
}
