// Run events: a hook a host can set to hear about each job an agent does
// outside console chat — to meter or audit it, say. Nothing listens
// unless something calls setRunObserver(), so a server that doesn't use
// it sees no change at all (the same approach as ./usage.ts).
//
// Reported once a job finishes or stops for a decision (one that ends in
// an error isn't); a resumed job isn't reported again, and a workflow run
// may be reported more than once under its one id.
//
//   - workflow: a workflow run, however it started (`via`: schedule,
//     webhook, console, api).
//   - schedule: a scheduled task that sent the agent a message.
//   - message: a message through POST /agents/:name/messages(/stream).
//     `caller` says who sent it: "api" (an API key, per the trusted
//     proxy's signed identity), "console" (a person signed in through
//     the proxy), or "unknown" (no proxy to say).
//   - slack / telegram: a message to the agent there.
//
// `usedTool` says whether the agent called a tool on it (a call that
// stopped for approval counts).
import type { Message } from './run-agent.js'

export type RunEventSource = 'workflow' | 'schedule' | 'message' | 'slack' | 'telegram'

export interface RunEvent {
  at: string
  agent: string
  source: RunEventSource
  /** The same for every report of the same job. */
  id: string
  /** workflow only: how the run started. */
  via?: string
  /** message only. */
  caller?: 'api' | 'console' | 'unknown'
  usedTool: boolean
}

export type RunObserver = (event: RunEvent) => void

let observer: RunObserver | undefined

/** Sets the one observer for this process; undefined removes it. */
export function setRunObserver(next: RunObserver | undefined): void {
  observer = next
}

/** Never throws: a broken observer must not fail the job. */
export function reportRun(event: Omit<RunEvent, 'at'>): void {
  if (!observer) return
  try {
    observer({ ...event, at: new Date().toISOString() })
  } catch (err) {
    console.error('[loopengine] run observer failed:', err instanceof Error ? err.message : err)
  }
}

/** Whether a turn's new messages include a tool call by the agent. */
export function usedTool(newMessages: Message[]): boolean {
  return newMessages.some((m) => m.role === 'assistant' && Array.isArray(m.content) && m.content.some((b) => b.type === 'tool_use'))
}
