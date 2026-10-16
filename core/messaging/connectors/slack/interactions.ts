// What the server needs to handle Slack button clicks itself (POST
// /hooks/slack/<agent> in adapters/http.ts), so a Slack notifier's
// Approve/Deny and answer buttons work with no handler of your own to
// deploy: request verification (also used for thread replies, see
// ./events.ts), reading the interaction payload, the "Other…" answer
// modal, and replying in the original message.
//
// Same button contract SlackNotifier (core/http-notify-triggers/slack.ts)
// sends: action_id approve|deny with the pendingId as value,
// answer_option_<n> with {pendingId, answer}, open_answer_modal with the
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
  | { type: 'open_answer'; pendingId: string; triggerId: string; responseUrl?: string; user?: string }
  /** A button under one of the engine's thread replies (core/messaging/engine.ts). */
  | { type: 'action'; action: 'approve_edited' | 'keep_original' | 'confirm' | 'cancel_confirm'; pendingId: string; responseUrl?: string; user?: string }
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
  // answer_option_<n> (one per option); a plain answer_option is from
  // messages posted before each button got its own id.
  const actionId = action.action_id?.startsWith('answer_option') ? 'answer_option' : action.action_id
  switch (actionId) {
    case 'approve':
    case 'deny':
      return { type: 'decide', pendingId: action.value, decision: actionId, responseUrl: payload.response_url, user }
    case 'answer_option': {
      try {
        const { pendingId, answer } = JSON.parse(action.value) as { pendingId?: string; answer?: string }
        return pendingId && typeof answer === 'string' ? { type: 'answer', pendingId, answer, responseUrl: payload.response_url, user } : { type: 'ignore' }
      } catch {
        return { type: 'ignore' }
      }
    }
    case 'approve_edited':
    case 'keep_original':
    case 'confirm':
    case 'cancel_confirm':
      return { type: 'action', action: actionId, pendingId: action.value, responseUrl: payload.response_url, user }
    case 'open_answer_modal':
      return payload.trigger_id ? { type: 'open_answer', pendingId: action.value, triggerId: payload.trigger_id, responseUrl: payload.response_url, user } : { type: 'ignore' }
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

/** A reply only the person who clicked sees, leaving the message as it is. */
export async function replyPrivatelyInSlack(responseUrl: string, text: string): Promise<void> {
  await fetch(responseUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ response_type: 'ephemeral', replace_original: false, text }),
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
