// A short, in-memory record of recent webhook deliveries per agent — what
// the console's Approvals section shows so an operator can see whether a
// notification actually reached the app on the other end (and why not).
// Deliberately not persisted: it's a debugging aid that resets with the
// process, not an audit log; the pending decision itself is what's
// durable (core/durable-approvals.ts).

export type NotifierDeliveryKind = 'approval' | 'question' | 'run_start' | 'run_finish' | 'test'

export interface NotifierDelivery {
  at: string
  agent: string
  kind: NotifierDeliveryKind
  url: string
  pendingId?: string
  /** 1 for the first try, 2+ for retries. */
  attempt: number
  ok: boolean
  /** The receiver's HTTP status, when it answered at all. */
  status?: number
  error?: string
}

const MAX_PER_AGENT = 50
const byAgent = new Map<string, NotifierDelivery[]>()

export function recordDelivery(delivery: NotifierDelivery): void {
  const list = byAgent.get(delivery.agent) ?? []
  list.unshift(delivery)
  if (list.length > MAX_PER_AGENT) list.length = MAX_PER_AGENT
  byAgent.set(delivery.agent, list)
}

/** Newest first. */
export function listDeliveries(agent: string): NotifierDelivery[] {
  return [...(byAgent.get(agent) ?? [])]
}

export function clearDeliveries(): void {
  byAgent.clear()
}
