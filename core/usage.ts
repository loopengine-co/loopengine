// Token usage per model call. Kept in the workspace's database
// (core/audit-store.ts) for each run's steps and totals, and also sent
// to a sink when one is configured with LOOPENGINE_USAGE_LOG (`stdout` for one JSON line per
// call on stdout, or a file path to append JSON lines to), or in code
// with setUsageSink() — a host billing for model usage, or anyone
// wanting a per-agent token count.
import { appendFileSync } from 'node:fs'
import { auditDb } from './audit-store.js'

export interface UsageEvent {
  at: string
  agent: string
  tenant: string
  sessionId?: string
  /** From AgentConfig.model — absent for an agent with its own
   * createModelCall. */
  provider?: string
  model?: string
  inputTokens: number
  outputTokens: number
  /** How long the call took, retries included. */
  durationMs?: number
}

export interface UsageRow extends UsageEvent {
  id: number
}

export type UsageSink = (event: UsageEvent) => void

function sinkFromEnv(): UsageSink | undefined {
  const target = process.env.LOOPENGINE_USAGE_LOG
  if (!target) return undefined
  if (target === 'stdout') return (event) => console.log(JSON.stringify({ type: 'loopengine:usage', ...event }))
  return (event) => appendFileSync(target, JSON.stringify(event) + '\n')
}

let sink: UsageSink | undefined = sinkFromEnv()

/** Replaces the sink for this whole process; undefined turns usage
 * recording off. */
export function setUsageSink(next: UsageSink | undefined): void {
  sink = next
}

/** Never throws — a broken sink must not fail the agent's turn. */
export function recordUsage(event: UsageEvent): void {
  const db = auditDb()
  if (db) {
    try {
      db.prepare('INSERT INTO usage (at, agent, tenant, session_id, provider, model, input_tokens, output_tokens, duration_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
        event.at, event.agent, event.tenant, event.sessionId ?? null, event.provider ?? null, event.model ?? null, event.inputTokens, event.outputTokens, event.durationMs ?? null,
      )
    } catch (err) {
      console.error('[loopengine] could not record usage:', err)
    }
  }
  if (!sink) return
  try {
    sink(event)
  } catch (err) {
    console.error('[loopengine] usage sink failed:', err)
  }
}

/** A session's model calls, oldest first. */
export function sessionUsage(agent: string, sessionId: string): UsageRow[] {
  const db = auditDb()
  if (!db) return []
  const rows = db.prepare('SELECT * FROM usage WHERE agent = ? AND session_id = ? ORDER BY id').all(agent, sessionId) as Record<string, unknown>[]
  return rows.map((r) => ({
    id: Number(r.id),
    at: String(r.at),
    agent: String(r.agent),
    tenant: String(r.tenant),
    ...(r.session_id ? { sessionId: String(r.session_id) } : {}),
    ...(r.provider ? { provider: String(r.provider) } : {}),
    ...(r.model ? { model: String(r.model) } : {}),
    inputTokens: Number(r.input_tokens),
    outputTokens: Number(r.output_tokens),
    ...(r.duration_ms != null ? { durationMs: Number(r.duration_ms) } : {}),
  }))
}
