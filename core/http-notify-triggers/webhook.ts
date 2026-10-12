// The generic-webhook channel's sending side, one class for both
// concerns — same "it's channel-specific, not concern-specific" shape
// slack.ts/lark.ts/email.ts already have, not the "two already-shipped
// classes from two separate packages" split this file used to be (see
// git history): approval-sending used to be actauth's own
// `WebhookApprover`, question-sending loopengine's own
// `WebhookQuestionHandler` (`core/system-tools/ask_user.ts`) — genuinely
// separate classes, since `actauth`'s `Gate` has no concept of
// `system_ask_user` questions at all (see HUMAN_IN_THE_LOOP.md's
// "Durable questions" section). Nothing about *sending* a signed webhook
// POST is actauth-specific, though, once you stop assuming the approval
// half has to live in actauth's own package — both halves are the exact
// same HMAC-SHA256-over-the-raw-body scheme, just under different
// headers, so merging them removes real duplication (one class, one
// constructor, one place either concern's own webhook target/secret is
// held) rather than just looking simpler on paper.
//
// `actauth`'s own `WebhookApprover` still exists and is unaffected —
// this is loopengine's own implementation of the same `DurableApprover`
// interface, not a fork of actauth's class; a standalone actauth
// consumer (no loopengine involved) still has and should use actauth's
// own. loopengine no longer imports it anywhere, since everywhere it
// used to (this file, and adapters/http.ts's own deployment-wide
// default) now constructs one `WebhookNotifier` instead.
//
// The signed payloads below are wire-compatible with what actauth's
// `WebhookApprover`/loopengine's former `WebhookQuestionHandler` already
// sent — same fields, same `X-Actauth-Signature`/`X-Askuser-Signature`
// headers — so an existing receiving-side deployment (this repo's own
// `examples/notifier-handler/webhook.ts`, or a host's own) needs no
// changes; only where the bytes come from moved.
//
// `postLifecycleWebhook` below is the third, genuinely new piece:
// `onRunStart`/`onRunFinish` have no shipped class on either side, for
// any channel (see this repo's own history — agents/customer-service/index.ts
// used to hand-write this exact function before `AgentConfig.httpNotifier`
// existed). Same signing scheme, under its own `X-Lifecycle-Signature`
// header so a receiver can tell a lifecycle event apart from a
// pending-approval/pending-question one hitting the same URL (see
// examples/notifier-handler/webhook.ts's own `verifyWebhookNotifier` for
// the receiving side of all three).
// Delivery is retried (RETRY_DELAYS_MS, a non-2xx answer counts as a
// failure), every attempt is recorded for the console's delivery log
// (core/notifier-deliveries.ts), and each payload carries where to send
// the decision back (`resolvePath`/`answerPath`, plus a full
// `resolveUrl`/`answerUrl` when LOOPENGINE_PUBLIC_URL says where this
// server is reachable) — all additive fields, so existing receivers keep
// working unchanged.
import { createHmac, randomUUID } from 'node:crypto'
import type { DurableApprover, Scope } from 'actauth'
import type { DurableQuestionHandler } from '../agent-config.js'
import { recordDelivery, type NotifierDeliveryKind } from '../notifier-deliveries.js'

/** Waits before each retry after the first attempt — four tries in all,
 * spread over about 40 seconds. */
const RETRY_DELAYS_MS = [2_000, 10_000, 30_000]

export interface DeliveryResult {
  ok: boolean
  status?: number
  error?: string
}

function sign(body: string, secret: string): string {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`
}

/** LOOPENGINE_PUBLIC_URL (e.g. https://acme.loopengine.app), read per
 * call so a change takes effect without a restart; undefined when unset,
 * in which case payloads carry only the relative path. */
function publicUrl(path: string): string | undefined {
  const base = process.env.LOOPENGINE_PUBLIC_URL
  return base ? base.replace(/\/+$/, '') + path : undefined
}

async function attemptOnce(url: string, body: string, headers: Record<string, string>): Promise<DeliveryResult> {
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body })
    return res.ok ? { ok: true, status: res.status } : { ok: false, status: res.status, error: `HTTP ${res.status}` }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** Sends one signed POST, retrying on a network error or non-2xx answer,
 * and records every attempt. Resolves with the last attempt's result —
 * callers that must return right away (a pending decision is already
 * recorded either way) don't await it. */
async function deliver(
  url: string,
  body: string,
  headers: Record<string, string>,
  meta: { agent: string; kind: NotifierDeliveryKind; pendingId?: string },
  retryDelaysMs: number[],
): Promise<DeliveryResult> {
  let result: DeliveryResult = { ok: false }
  for (let attempt = 1; attempt <= retryDelaysMs.length + 1; attempt++) {
    if (attempt > 1) await new Promise((resolve) => setTimeout(resolve, retryDelaysMs[attempt - 2]))
    result = await attemptOnce(url, body, headers)
    recordDelivery({ at: new Date().toISOString(), url, attempt, ...meta, ...result })
    if (result.ok) return result
  }
  console.error(`[loopengine] webhook delivery to ${url} failed after ${retryDelaysMs.length + 1} attempts (${meta.kind}${meta.pendingId ? ` ${meta.pendingId}` : ''}): ${result.error}`)
  return result
}

export class WebhookNotifier implements DurableApprover, DurableQuestionHandler {
  private readonly webhookUrl: string
  private readonly signingSecret: string
  private readonly retryDelaysMs: number[]

  constructor(options: { webhookUrl: string; signingSecret: string; retryDelaysMs?: number[] }) {
    this.webhookUrl = options.webhookUrl
    this.signingSecret = options.signingSecret
    this.retryDelaysMs = options.retryDelaysMs ?? RETRY_DELAYS_MS
  }

  requestDurableApproval(tool: string, args: Record<string, unknown>, scope: Scope, reason: string): { pendingId: string } {
    const pendingId = randomUUID()
    const requestedAt = new Date().toISOString()
    const resolvePath = `/pending-approvals/${pendingId}/resolve`
    const body = JSON.stringify({
      pendingId, tool, args, scope, reason, requestedAt,
      kind: 'approval', agent: scope.agent, resolvePath, resolveUrl: publicUrl(resolvePath),
    })
    void deliver(this.webhookUrl, body, { 'X-Actauth-Signature': sign(body, this.signingSecret) }, { agent: scope.agent, kind: 'approval', pendingId }, this.retryDelaysMs)
    return { pendingId }
  }

  notifyPendingQuestion(question: string, options: string[] | undefined, agent: string, sessionId: string | undefined): { pendingId: string } {
    const pendingId = randomUUID()
    const requestedAt = new Date().toISOString()
    const answerPath = `/pending-questions/${pendingId}/answer`
    const body = JSON.stringify({
      pendingId, question, options, agent, sessionId, requestedAt,
      kind: 'question', answerPath, answerUrl: publicUrl(answerPath),
    })
    void deliver(this.webhookUrl, body, { 'X-Askuser-Signature': sign(body, this.signingSecret) }, { agent, kind: 'question', pendingId }, this.retryDelaysMs)
    return { pendingId }
  }
}

export function postLifecycleWebhook(
  webhookUrl: string,
  webhookSecret: string,
  event: 'run_start' | 'run_finish',
  context: Record<string, unknown>,
): void {
  const payload = JSON.stringify({ event, ...context, occurredAt: new Date().toISOString() })
  void deliver(webhookUrl, payload, { 'X-Lifecycle-Signature': sign(payload, webhookSecret) }, { agent: String(context.agent ?? ''), kind: event }, RETRY_DELAYS_MS)
}

/** One signed `{event: "test"}` POST (lifecycle signature header), no
 * retries, awaited — backs the console's "Send test" button so an
 * operator sees right away whether the receiver accepts it. */
export function sendTestWebhook(webhookUrl: string, webhookSecret: string, agent: string): Promise<DeliveryResult> {
  const payload = JSON.stringify({ event: 'test', agent, occurredAt: new Date().toISOString() })
  return deliver(webhookUrl, payload, { 'X-Lifecycle-Signature': sign(payload, webhookSecret) }, { agent, kind: 'test' }, [])
}
