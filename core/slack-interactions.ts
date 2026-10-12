// What the server needs to handle Slack button clicks itself (POST
// /hooks/slack/<agent> in adapters/http.ts), so a Slack notifier's
// Approve/Deny and answer buttons work with no handler of your own to
// deploy: request verification, reading the interaction payload, the
// "Other…" answer modal, replying in the original message, listing
// channels for the console's channel picker, and the app manifest the
// console shows for creating the Slack app.
//
// Same button contract SlackNotifier (core/http-notify-triggers/slack.ts)
// sends: action_id approve|deny with the pendingId as value,
// answer_option with {pendingId, answer}, open_answer_modal with the
// pendingId, and the modal's answer under ANSWER_BLOCK_ID/ANSWER_ACTION_ID.
import { createHmac, timingSafeEqual } from 'node:crypto'

export const SLACK_ANSWER_BLOCK_ID = 'answer_block'
export const SLACK_ANSWER_ACTION_ID = 'answer_input'

/** https://api.slack.com/authentication/verifying-requests-from-slack —
 * rejects anything older than five minutes, so a captured request can't
 * be replayed later. */
export function verifySlackRequest(
  rawBody: string,
  timestamp: string | undefined,
  signature: string | undefined,
  signingSecret: string,
  nowMs = Date.now(),
): boolean {
  if (!timestamp || !signature) return false
  const age = Math.abs(nowMs / 1000 - Number(timestamp))
  if (!Number.isFinite(age) || age > 60 * 5) return false
  const expected = Buffer.from(`v0=${createHmac('sha256', signingSecret).update(`v0:${timestamp}:${rawBody}`).digest('hex')}`)
  const actual = Buffer.from(signature)
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

export type SlackInteraction =
  | { type: 'decide'; pendingId: string; decision: 'approve' | 'deny'; responseUrl?: string; user?: string }
  | { type: 'answer'; pendingId: string; answer: string; responseUrl?: string; user?: string }
  | { type: 'open_answer'; pendingId: string; triggerId: string }
  | { type: 'ignore' }

/** Reads Slack's form-encoded `payload=<json>` body into the one thing
 * it asks for. Anything unrecognized is `ignore`. */
export function parseSlackInteraction(rawBody: string): SlackInteraction {
  const raw = new URLSearchParams(rawBody).get('payload')
  if (!raw) return { type: 'ignore' }
  let payload: {
    type?: string
    trigger_id?: string
    response_url?: string
    user?: { id?: string; username?: string; name?: string }
    actions?: { action_id?: string; value?: string }[]
    view?: { private_metadata?: string; state?: { values?: Record<string, Record<string, { value?: string }>> } }
  }
  try {
    payload = JSON.parse(raw)
  } catch {
    return { type: 'ignore' }
  }
  const user = payload.user?.id
  if (payload.type === 'view_submission' && payload.view?.private_metadata) {
    const answer = payload.view.state?.values?.[SLACK_ANSWER_BLOCK_ID]?.[SLACK_ANSWER_ACTION_ID]?.value ?? ''
    return { type: 'answer', pendingId: payload.view.private_metadata, answer, user }
  }
  if (payload.type !== 'block_actions') return { type: 'ignore' }
  const action = payload.actions?.[0]
  if (!action?.value) return { type: 'ignore' }
  switch (action.action_id) {
    case 'approve':
    case 'deny':
      return { type: 'decide', pendingId: action.value, decision: action.action_id, responseUrl: payload.response_url, user }
    case 'answer_option': {
      try {
        const { pendingId, answer } = JSON.parse(action.value) as { pendingId?: string; answer?: string }
        return pendingId && typeof answer === 'string' ? { type: 'answer', pendingId, answer, responseUrl: payload.response_url, user } : { type: 'ignore' }
      } catch {
        return { type: 'ignore' }
      }
    }
    case 'open_answer_modal':
      return payload.trigger_id ? { type: 'open_answer', pendingId: action.value, triggerId: payload.trigger_id } : { type: 'ignore' }
    default:
      return { type: 'ignore' }
  }
}

/** Opens the free-text answer modal for "Other…". Slack's trigger_id
 * expires three seconds after the click, so call this before anything slow. */
export async function openSlackAnswerModal(botToken: string, triggerId: string, pendingId: string): Promise<void> {
  const res = await fetch('https://slack.com/api/views.open', {
    method: 'POST',
    headers: { Authorization: `Bearer ${botToken}`, 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      trigger_id: triggerId,
      view: {
        type: 'modal',
        callback_id: 'answer_modal',
        private_metadata: pendingId,
        title: { type: 'plain_text', text: 'Your answer' },
        submit: { type: 'plain_text', text: 'Send' },
        blocks: [
          {
            type: 'input',
            block_id: SLACK_ANSWER_BLOCK_ID,
            label: { type: 'plain_text', text: 'Answer' },
            element: { type: 'plain_text_input', action_id: SLACK_ANSWER_ACTION_ID, multiline: true },
          },
        ],
      },
    }),
  })
  const body = (await res.json()) as { ok: boolean; error?: string }
  if (!body.ok) throw new Error(`views.open failed: ${body.error}`)
}

/** Replaces the original message (its buttons included) with what
 * happened, so nobody clicks a decision that's already made. */
export async function replyInSlack(responseUrl: string, text: string): Promise<void> {
  await fetch(responseUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ replace_original: true, text }),
  })
}

/** What to say in Slack after a decision, from the resolve route's own
 * response body. */
export function slackOutcomeText(
  kind: 'approve' | 'deny' | 'answer',
  status: number,
  body: { alreadyResolved?: boolean; resolved?: boolean; text?: string; error?: string; pending?: unknown[] },
  user?: string,
): string {
  const who = user ? ` by <@${user}>` : ''
  if (status >= 400) return `:warning: Couldn't record that: ${body.error ?? `HTTP ${status}`}`
  if (body.alreadyResolved) return 'Already decided elsewhere.'
  const what = kind === 'approve' ? ':white_check_mark: Approved' : kind === 'deny' ? ':no_entry: Denied' : ':speech_balloon: Answered'
  if (body.resolved) return `${what}${who}. Still waiting on another decision in the same turn.`
  if (body.pending?.length) return `${what}${who}. The agent needs another decision; a new message is on its way.`
  return `${what}${who}.${body.text ? `\n>${body.text.replace(/\n/g, '\n>')}` : ''}`
}

export interface SlackChannel {
  id: string
  name: string
  isPrivate: boolean
  isMember: boolean
}

/** Channels the bot can see — needs the channels:read (and, for private
 * channels, groups:read) scope. */
export async function listSlackChannels(botToken: string): Promise<SlackChannel[]> {
  const channels: SlackChannel[] = []
  let cursor = ''
  for (let page = 0; page < 10; page++) {
    const params = new URLSearchParams({ types: 'public_channel,private_channel', exclude_archived: 'true', limit: '200' })
    if (cursor) params.set('cursor', cursor)
    const res = await fetch(`https://slack.com/api/conversations.list?${params}`, { headers: { Authorization: `Bearer ${botToken}` } })
    const body = (await res.json()) as {
      ok: boolean
      error?: string
      channels?: { id: string; name: string; is_private?: boolean; is_member?: boolean }[]
      response_metadata?: { next_cursor?: string }
    }
    if (!body.ok) {
      const reasons: Record<string, string> = {
        missing_scope: 'The bot token is missing the channels:read scope; reinstall the app from the manifest',
        invalid_auth: 'Slack rejected the bot token; copy the Bot User OAuth Token (xoxb-...) again',
        not_authed: 'Enter the bot token first',
        token_revoked: 'This bot token was revoked; reinstall the app and copy the new one',
      }
      throw new Error(reasons[body.error ?? ''] ?? `Slack said: ${body.error}`)
    }
    for (const c of body.channels ?? []) channels.push({ id: c.id, name: c.name, isPrivate: Boolean(c.is_private), isMember: Boolean(c.is_member) })
    cursor = body.response_metadata?.next_cursor ?? ''
    if (!cursor) break
  }
  return channels.sort((a, b) => Number(b.isMember) - Number(a.isMember) || a.name.localeCompare(b.name))
}

/** A Slack app manifest for one agent's notifier: a bot that can post and
 * read the channel list, with interactivity pointed at this server.
 * Paste it into api.slack.com/apps → Create New App → From a manifest. */
export function slackAppManifest(options: { agentName: string; interactivityUrl: string }): Record<string, unknown> {
  const name = `LoopEngine ${options.agentName}`.slice(0, 35)
  return {
    display_information: { name, description: `Approval requests and questions from the ${options.agentName} agent` },
    features: { bot_user: { display_name: name, always_online: true } },
    oauth_config: { scopes: { bot: ['chat:write', 'channels:read', 'groups:read'] } },
    settings: {
      interactivity: { is_enabled: true, request_url: options.interactivityUrl },
      org_deploy_enabled: false,
      socket_mode_enabled: false,
      token_rotation_enabled: false,
    },
  }
}
