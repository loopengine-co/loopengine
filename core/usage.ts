// Token usage per model call — off unless a sink is configured, so a
// self-hosted install that doesn't ask for it sees no change at all.
// Configure with LOOPENGINE_USAGE_LOG (`stdout` for one JSON line per
// call on stdout, or a file path to append JSON lines to), or in code
// with setUsageSink() — a host billing for model usage, or anyone
// wanting a per-agent token count.
import { appendFileSync } from 'node:fs'

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
  if (!sink) return
  try {
    sink(event)
  } catch (err) {
    console.error('[loopengine] usage sink failed:', err)
  }
}
