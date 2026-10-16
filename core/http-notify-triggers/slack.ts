// The *sending* half of a Slack-backed DurableApprover/DurableQuestionHandler,
// real, maintained core/ code so AgentConfig.httpNotifier
// (core/http-notifier.ts) can construct one directly for `channel:
// 'slack'`, the same way it already constructs actauth's own
// WebhookApprover for `channel: 'webhook'`. Not "DurableSlackNotifier":
// unlike the Web/Webhook pair, there's no live "SlackNotifier" this name
// could collide with (Slack's own *live* approver, actauth's
// `SlackChatApprover`, has an entirely different name already) — durable is
// just what a Slack-backed notifier defaults to being, so the name
// doesn't need to say so.
//
// The *receiving* side — verifying a Slack Interactivity payload really
// came from Slack, then dispatching approve/deny/answer back into
// loopengine's own resolve/answer routes — deliberately stays out of
// core and out of this class: that's an HTTP endpoint only the host can
// deploy (it needs a route, a public URL, Slack app configuration), the
// same "sending built for you, receiving you deploy" split every other
// durable channel in this repo has. See
// examples/notifier-handler/slack.ts's own `SlackNotifierHandler` for
// that half.
//
// One class for both concerns, not two: nothing about what a Slack
// integration needs to send is approval-specific or question-specific,
// it's Slack-specific (the bot token, the channel, the chat.postMessage
// call shape).
import { randomUUID } from 'node:crypto'
import type { DurableApprover, Scope } from 'actauth'
import type { DurableQuestionHandler } from '../agent-config.js'
import { decidePath } from '../approval-links.js'
import { publicBaseUrl } from './webhook.js'

/** Where a request landed: its channel and its message ts (the id of
 * the thread under it). */
export interface SlackPostedRequest {
  channel: string
  ts: string
  pendingId: string
  kind: 'approval' | 'question'
}

export class SlackNotifier implements DurableApprover, DurableQuestionHandler {
  private readonly botToken: string
  private readonly channelId: string
  private readonly publicUrl?: string
  private readonly buttons: boolean
  private readonly onThread?: (posted: SlackPostedRequest) => void

  /** `publicUrl`: where this server is reachable (LOOPENGINE_PUBLIC_URL
   * wins when set) — when known, each message links to a decision page
   * (core/approval-links.ts) anyone in the channel can open. `buttons`:
   * whether to add interactive Approve/Deny buttons, which only work with
   * a Slack interactivity endpoint deployed (examples/notifier-handler/
   * slack.ts); default true, false for a console-configured notifier,
   * which relies on the link instead. `onThread`: told where each
   * approval request or question landed, so a reply in its thread can be
   * matched to it (core/messaging/threads.ts). */
  constructor(options: { botToken: string; channelId: string; publicUrl?: string; buttons?: boolean; onThread?: (posted: SlackPostedRequest) => void }) {
    this.botToken = options.botToken
    this.channelId = options.channelId
    this.publicUrl = options.publicUrl
    this.buttons = options.buttons ?? true
    this.onThread = options.onThread
  }

  private threadRecorder(pendingId: string, kind: SlackPostedRequest['kind']): ((posted: { channel: string; ts: string }) => void) | undefined {
    const onThread = this.onThread
    return onThread ? (posted) => onThread({ ...posted, pendingId, kind }) : undefined
  }

  private decideLine(pendingId: string, kind: 'approval' | 'question'): string {
    const base = publicBaseUrl(this.publicUrl)
    return base ? `\n<${base}${decidePath(pendingId, kind)}|${kind === 'approval' ? 'Open to approve or deny' : 'Open to answer'}>` : ''
  }

  requestDurableApproval(tool: string, args: Record<string, unknown>, scope: Scope, reason: string): { pendingId: string } {
    const pendingId = randomUUID()
    this.postMessage(`Approval requested: ${tool} on ${scope.tenant}/${scope.environment}/${scope.agent}`, [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Approval requested*\n*tool:* ${tool}\n*args:* \`${JSON.stringify(args)}\`\n*scope:* ${scope.tenant}/${scope.environment}/${scope.agent}\n*reason:* ${reason}${this.decideLine(pendingId, 'approval')}`,
        },
      },
      ...(this.buttons
        ? [{
            type: 'actions',
            elements: [
              { type: 'button', text: { type: 'plain_text', text: 'Approve' }, style: 'primary', action_id: 'approve', value: pendingId },
              { type: 'button', text: { type: 'plain_text', text: 'Deny' }, style: 'danger', action_id: 'deny', value: pendingId },
            ],
          }]
        : []),
    ], this.threadRecorder(pendingId, 'approval'))
    return { pendingId }
  }

  notifyPendingQuestion(question: string, options: string[] | undefined, agent: string, sessionId: string | undefined): { pendingId: string } {
    const pendingId = randomUUID()
    const optionButtons = (options ?? []).map((option) => ({
      type: 'button',
      text: { type: 'plain_text', text: option },
      value: JSON.stringify({ pendingId, answer: option }),
      action_id: 'answer_option',
    }))
    this.postMessage(`Question from ${agent}: ${question}`, [
      { type: 'section', text: { type: 'mrkdwn', text: `*Question from ${agent}${sessionId ? ` (session ${sessionId})` : ''}:*\n${question}${this.decideLine(pendingId, 'question')}` } },
      ...(this.buttons
        ? [{ type: 'actions', elements: [...optionButtons, { type: 'button', text: { type: 'plain_text', text: 'Other…' }, action_id: 'open_answer_modal', value: pendingId }] }]
        : []),
    ], this.threadRecorder(pendingId, 'question'))
    return { pendingId }
  }

  /** Public, not private: core/http-notifier.ts's own onRunStart/onRunFinish
   * lifecycle sender for `channel: 'slack'` calls this directly with no
   * `blocks` — a plain announcement, since there's nothing to resolve and
   * so nothing to attach buttons to. `onPosted` gets the channel and ts
   * Slack answered with. */
  postMessage(text: string, blocks?: unknown[], onPosted?: (posted: { channel: string; ts: string }) => void): void {
    // Not awaited — both requestDurableApproval/notifyPendingQuestion
    // above return immediately, by contract (see DurableApprover's own
    // doc comment); a delivery failure here has no synchronous way to
    // surface to either caller, so it's logged instead of thrown.
    fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.botToken}`, 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ channel: this.channelId, text, ...(blocks ? { blocks } : {}) }),
    })
      .then((res) => res.json() as Promise<{ ok: boolean; error?: string; channel?: string; ts?: string }>)
      .then((body) => {
        if (!body.ok) console.error('[loopengine] SlackNotifier: chat.postMessage failed:', body.error)
        else if (onPosted && body.ts) onPosted({ channel: body.channel ?? this.channelId, ts: body.ts })
      })
      .catch((err) => {
        console.error('[loopengine] SlackNotifier: chat.postMessage failed:', err)
      })
  }
}

/** One plain chat.postMessage, awaited, reporting whether Slack accepted
 * it — backs the console's "Send test" for a Slack notifier, where
 * SlackNotifier.postMessage's fire-and-forget contract would hide the
 * answer (a bad token, a channel the bot isn't in). */
export async function sendTestSlackMessage(botToken: string, channelId: string, text: string): Promise<{ ok: boolean; status?: number; error?: string }> {
  try {
    const res = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: { Authorization: `Bearer ${botToken}`, 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ channel: channelId, text }),
    })
    const body = (await res.json()) as { ok: boolean; error?: string }
    return body.ok ? { ok: true, status: res.status } : { ok: false, status: res.status, error: body.error ?? `HTTP ${res.status}` }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
