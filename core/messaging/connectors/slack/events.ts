// The Slack connector (core/messaging/connector.ts), thread replies:
// reads the Events API body into an InboundMessage, reads a thread back,
// and replies in it.
// Slack's buttons and the signing check live in ./interactions.ts, and
// posting requests in core/http-notify-triggers/slack.ts.
import type { InboundMessage, MessagingChoice, MessagingConnector, ThreadMessage } from '../../connector.js'
import { toSlackMrkdwn } from './format.js'

export type SlackEvent = { type: 'url_verification'; challenge: string } | ({ type: 'message' } & InboundMessage) | { type: 'ignore' }

/** Reads an Events API body. Only people's new messages come through;
 * edits, deletions, joins and every bot's messages (this agent's own
 * included) are `ignore`. */
export function parseSlackEvent(rawBody: string): SlackEvent {
  let body: {
    type?: string
    challenge?: string
    event_id?: string
    event?: { type?: string; subtype?: string; bot_id?: string; user?: string; text?: string; ts?: string; thread_ts?: string; channel?: string }
  }
  try {
    body = JSON.parse(rawBody)
  } catch {
    return { type: 'ignore' }
  }
  if (body.type === 'url_verification' && typeof body.challenge === 'string') return { type: 'url_verification', challenge: body.challenge }
  const event = body.event
  if (body.type !== 'event_callback' || !event || !body.event_id) return { type: 'ignore' }
  if ((event.type !== 'message' && event.type !== 'app_mention') || event.subtype || event.bot_id) return { type: 'ignore' }
  if (!event.user || !event.channel || !event.ts || typeof event.text !== 'string') return { type: 'ignore' }
  return {
    type: 'message',
    app: 'slack',
    eventId: body.event_id,
    conversation: event.channel,
    user: event.user,
    text: event.text,
    ts: event.ts,
    ...(event.thread_ts && event.thread_ts !== event.ts ? { threadTs: event.thread_ts } : {}),
  }
}

/** The engine's buttons as Slack buttons: action_id is the action (deny
 * is the same id as on a request), value the pendingId. */
function slackButton(choice: MessagingChoice): Record<string, unknown> {
  return { type: 'button', text: { type: 'plain_text', text: choice.label }, action_id: choice.action, value: choice.pendingId, ...(choice.style ? { style: choice.style } : {}) }
}

export function createSlackConnector(botToken: string): MessagingConnector {
  return {
    app: 'slack',
    name: 'Slack',
    mention: (user) => `<@${user}>`,
    // Needs channels:history or groups:history, depending on the channel.
    async fetchThread(conversation, threadTs) {
      const params = new URLSearchParams({ channel: conversation, ts: threadTs, limit: '100' })
      const res = await fetch(`https://slack.com/api/conversations.replies?${params}`, { headers: { Authorization: `Bearer ${botToken}` } })
      const body = (await res.json()) as { ok: boolean; error?: string; messages?: { user?: string; bot_id?: string; text?: string; ts: string }[] }
      if (!body.ok) {
        console.error('[loopengine] conversations.replies failed:', body.error)
        return []
      }
      return (body.messages ?? []).map((m): ThreadMessage => ({ user: m.user, fromBot: Boolean(m.bot_id), text: m.text ?? '', ts: m.ts }))
    },
    async postInThread(conversation, threadTs, text) {
      const res = await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: { Authorization: `Bearer ${botToken}`, 'content-type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ channel: conversation, thread_ts: threadTs, text: toSlackMrkdwn(text) }),
      })
      const body = (await res.json()) as { ok: boolean; error?: string }
      if (!body.ok) console.error('[loopengine] chat.postMessage (thread reply) failed:', body.error)
    },
    async postChoice(conversation, threadTs, text, choices) {
      const mrkdwn = toSlackMrkdwn(text)
      const res = await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: { Authorization: `Bearer ${botToken}`, 'content-type': 'application/json; charset=utf-8' },
        body: JSON.stringify({
          channel: conversation,
          thread_ts: threadTs,
          text: mrkdwn,
          blocks: [{ type: 'section', text: { type: 'mrkdwn', text: mrkdwn } }, { type: 'actions', elements: choices.map(slackButton) }],
        }),
      })
      const body = (await res.json()) as { ok: boolean; error?: string }
      if (!body.ok) console.error('[loopengine] chat.postMessage (choice) failed:', body.error)
    },
    async replaceMessage(conversation, ts, text) {
      const mrkdwn = toSlackMrkdwn(text)
      const res = await fetch('https://slack.com/api/chat.update', {
        method: 'POST',
        headers: { Authorization: `Bearer ${botToken}`, 'content-type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ channel: conversation, ts, text: mrkdwn, blocks: [{ type: 'section', text: { type: 'mrkdwn', text: mrkdwn } }] }),
      })
      const body = (await res.json()) as { ok: boolean; error?: string }
      if (!body.ok) console.error('[loopengine] chat.update failed:', body.error)
    },
  }
}
