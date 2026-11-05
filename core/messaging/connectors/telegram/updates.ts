// Reading what Telegram sends to POST /hooks/telegram/<agent>: checking
// it came from Telegram, and turning an Update into a person's message or
// a button click.
//
// Telegram signs nothing; instead setWebhook is given a secret_token that
// Telegram sends back in X-Telegram-Bot-Api-Secret-Token with every
// update (./setup.ts makes one per agent).
//
// Buttons carry `<code>:<pendingId>` as callback_data, which Telegram
// caps at 64 bytes (a pendingId is a 36-character UUID): a/d for a
// request's Approve/Deny, q<n> for a question's n-th option, and the
// engine's own thread buttons (core/messaging/engine.ts).
import { timingSafeEqual } from 'node:crypto'
import type { InboundMessage, MessagingAction } from '../../connector.js'

export function verifyTelegramRequest(header: string | undefined, secret: string): boolean {
  if (!header) return false
  const expected = Buffer.from(secret)
  const actual = Buffer.from(header)
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

const ACTION_CODES: Record<Exclude<MessagingAction, 'deny'>, string> = {
  approve_edited: 'ae',
  keep_original: 'ko',
  confirm: 'c',
  cancel_confirm: 'cc',
}

export type TelegramButton =
  | { type: 'decide'; decision: 'approve' | 'deny' }
  | { type: 'answer_option'; index: number }
  | { type: 'action'; action: Exclude<MessagingAction, 'deny'> }

/** The callback_data for a button. */
export function telegramCallbackData(button: TelegramButton, pendingId: string): string {
  const code =
    button.type === 'decide' ? (button.decision === 'approve' ? 'a' : 'd') : button.type === 'answer_option' ? `q${button.index}` : ACTION_CODES[button.action]
  return `${code}:${pendingId}`
}

function readCallbackData(data: string): { button: TelegramButton; pendingId: string } | undefined {
  const match = /^([a-z]+)(\d*):(.+)$/.exec(data)
  if (!match) return undefined
  const [, code, index, pendingId] = match as unknown as [string, string, string, string]
  if (code === 'a' && !index) return { button: { type: 'decide', decision: 'approve' }, pendingId }
  if (code === 'd' && !index) return { button: { type: 'decide', decision: 'deny' }, pendingId }
  if (code === 'q' && index) return { button: { type: 'answer_option', index: Number(index) }, pendingId }
  const action = (Object.keys(ACTION_CODES) as Array<keyof typeof ACTION_CODES>).find((a) => ACTION_CODES[a] === code)
  return action && !index ? { button: { type: 'action', action }, pendingId } : undefined
}

interface TelegramUser {
  id?: number
  is_bot?: boolean
  first_name?: string
  last_name?: string
  username?: string
}

export type TelegramUpdate =
  | ({ type: 'message'; username?: string } & InboundMessage)
  | {
      type: 'click'
      /** answerCallbackQuery takes it, to stop the button's spinner. */
      callbackId: string
      conversation: string
      /** The message the button is on. */
      messageId: string
      user: string
      userName?: string
      username?: string
      button: TelegramButton
      pendingId: string
    }
  | { type: 'ignore' }

const nameOf = (u: TelegramUser) => [u.first_name, u.last_name].filter(Boolean).join(' ') || undefined

/** Reads an Update. Only people's new text messages and clicks on the
 * agent's buttons come through. `botUsername` (without @) is how a
 * mention is spotted; `rootOf` finds the thread a replied-to message is
 * in (./store.ts). */
export function parseTelegramUpdate(rawBody: string, options: { botUsername?: string; rootOf: (chat: string, id: string) => string }): TelegramUpdate {
  let update: {
    update_id?: number
    message?: {
      message_id?: number
      from?: TelegramUser
      chat?: { id?: number; type?: string }
      text?: string
      entities?: { type?: string; offset?: number; length?: number }[]
      reply_to_message?: { message_id?: number }
    }
    callback_query?: { id?: string; from?: TelegramUser; data?: string; message?: { message_id?: number; chat?: { id?: number } } }
  }
  try {
    update = JSON.parse(rawBody)
  } catch {
    return { type: 'ignore' }
  }
  const click = update.callback_query
  if (click) {
    const parsed = click.data ? readCallbackData(click.data) : undefined
    if (!parsed || !click.id || !click.from?.id || click.message?.message_id === undefined || click.message.chat?.id === undefined) return { type: 'ignore' }
    return {
      type: 'click',
      callbackId: click.id,
      conversation: String(click.message.chat.id),
      messageId: String(click.message.message_id),
      user: String(click.from.id),
      ...(nameOf(click.from) ? { userName: nameOf(click.from) } : {}),
      ...(click.from.username ? { username: click.from.username } : {}),
      ...parsed,
    }
  }
  const message = update.message
  if (update.update_id === undefined || !message || message.message_id === undefined || message.chat?.id === undefined) return { type: 'ignore' }
  if (!message.from?.id || message.from.is_bot || typeof message.text !== 'string') return { type: 'ignore' }
  const chat = String(message.chat.id)
  const bot = options.botUsername?.toLowerCase()
  let text = message.text
  let mentioned = false
  if (bot) {
    // @bot as a mention entity, or a command addressed to it (/do@bot).
    for (const entity of message.entities ?? []) {
      const part = text.slice(entity.offset ?? 0, (entity.offset ?? 0) + (entity.length ?? 0)).toLowerCase()
      if ((entity.type === 'mention' && part === `@${bot}`) || (entity.type === 'bot_command' && part.endsWith(`@${bot}`))) mentioned = true
    }
    if (mentioned) text = text.replace(new RegExp(`@${bot}\\b`, 'ig'), '').trim()
  }
  // Opening a chat with a bot sends /start; it isn't a job.
  if (/^\/start(\s|$)/.test(text)) text = text.replace(/^\/start\s*/, '')
  const replyTo = message.reply_to_message?.message_id
  return {
    type: 'message',
    app: 'telegram',
    eventId: String(update.update_id),
    conversation: chat,
    user: String(message.from.id),
    text,
    ts: String(message.message_id),
    ...(replyTo !== undefined ? { threadTs: options.rootOf(chat, String(replyTo)) } : {}),
    ...(message.chat.type === 'private' ? { direct: true } : {}),
    ...(mentioned ? { mentioned: true } : {}),
    ...(nameOf(message.from) ? { userName: nameOf(message.from) } : {}),
    ...(message.from.username ? { username: message.from.username } : {}),
  }
}
