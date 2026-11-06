// The Telegram connector (core/messaging/connector.ts): replies in a
// request's thread, the engine's buttons, starting jobs from a DM or a
// mention (core/messaging/jobs.ts), and the Bot API calls the console's
// setup needs. Telegram can't read a chat back, so threads are kept as
// they pass through (./store.ts); reading updates is ./updates.ts, and
// formatting ./format.ts. Posting requests is TelegramNotifier's job
// (core/http-notify-triggers/telegram.ts).
import type { MessagingChoice, MessagingConnector } from '../../connector.js'
import { telegramEscape, toTelegramHtml } from './format.js'
import { readTelegramThread, recordTelegramMessage, telegramPeople } from './store.js'
import { telegramCallbackData } from './updates.js'

export { telegramArgs, telegramEscape, toTelegramHtml } from './format.js'
export { readTelegramThread, recordTelegramMessage, telegramPeople, telegramRootOf, type TelegramPerson } from './store.js'
export { parseTelegramUpdate, telegramCallbackData, verifyTelegramRequest, type TelegramButton, type TelegramUpdate } from './updates.js'

export interface TelegramResult<T = unknown> {
  ok: boolean
  result?: T
  description?: string
}

/** One Bot API call. Never throws: a network failure reads as not ok. */
export async function callTelegram<T = unknown>(botToken: string, method: string, body: Record<string, unknown>): Promise<TelegramResult<T>> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    const parsed = (await res.json().catch(() => ({}))) as TelegramResult<T>
    return parsed.ok ? parsed : { ok: false, description: parsed.description || `HTTP ${res.status}` }
  } catch (err) {
    return { ok: false, description: err instanceof Error ? err.message : String(err) }
  }
}

/** A reply under `replyTo` that still goes out if that message is gone. */
export function replyTo(messageId: string): Record<string, unknown> {
  return { reply_parameters: { message_id: Number(messageId), allow_sending_without_reply: true } }
}

export type InlineButton = { text: string; callback_data: string }

/** The engine's buttons as one row of Telegram inline buttons. */
function choiceKeyboard(choices: MessagingChoice[]): InlineButton[][] {
  return [
    choices.map((choice) => ({
      text: choice.label,
      callback_data: telegramCallbackData(choice.action === 'deny' ? { type: 'decide', decision: 'deny' } : { type: 'action', action: choice.action }, choice.pendingId),
    })),
  ]
}

/** How a person shows in a message: their @username (which Telegram
 * links), else their name. */
function personLabel(agentDir: string, user: string): string {
  const person = telegramPeople(agentDir).find((p) => p.id === user)
  if (person?.username) return `@${person.username}`
  return (person?.name ?? `user ${user}`).replace(/[*_~`[\]<>]/g, '')
}

export function createTelegramConnector(botToken: string, agentDir: string): MessagingConnector {
  const send = async (conversation: string, threadTs: string, text: string, keyboard?: InlineButton[][]): Promise<string | undefined> => {
    const sent = await callTelegram<{ message_id: number }>(botToken, 'sendMessage', {
      chat_id: conversation,
      text: toTelegramHtml(text),
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
      ...replyTo(threadTs),
      ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}),
    })
    if (!sent.ok || !sent.result) {
      console.error('[loopengine] Telegram sendMessage (thread reply) failed:', sent.description)
      return undefined
    }
    const id = String(sent.result.message_id)
    recordTelegramMessage(agentDir, { chat: conversation, id, root: threadTs, fromBot: true, text })
    return id
  }
  return {
    app: 'telegram',
    name: 'Telegram',
    mention: (user) => personLabel(agentDir, user),
    escape: telegramEscape,
    async fetchThread(conversation, threadTs) {
      // Without telegramEscape's markers, which are for formatting only.
      return readTelegramThread(agentDir, conversation, threadTs).map((m) => ({ ...m, text: m.text.replace(/[\u0001\u0002]/g, '') }))
    },
    async postInThread(conversation, threadTs, text) {
      await send(conversation, threadTs, text)
    },
    async postChoice(conversation, threadTs, text, choices) {
      return send(conversation, threadTs, text, choiceKeyboard(choices))
    },
    async replaceMessage(conversation, ts, text) {
      // Editing without reply_markup also takes the buttons away.
      const edited = await callTelegram(botToken, 'editMessageText', {
        chat_id: conversation,
        message_id: Number(ts),
        text: toTelegramHtml(text),
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
      })
      if (!edited.ok) console.error('[loopengine] Telegram editMessageText failed:', edited.description)
    },
  }
}

/** Stops a clicked button's spinner, with a short note when there's one. */
export async function answerTelegramClick(botToken: string, callbackId: string, text?: string): Promise<void> {
  const answered = await callTelegram(botToken, 'answerCallbackQuery', { callback_query_id: callbackId, ...(text ? { text: text.slice(0, 200) } : {}) })
  if (!answered.ok) console.error('[loopengine] Telegram answerCallbackQuery failed:', answered.description)
}

/** Replaces a message's text and takes its buttons away. */
export async function editTelegramMessage(botToken: string, chat: string, messageId: string, text: string): Promise<void> {
  const edited = await callTelegram(botToken, 'editMessageText', { chat_id: chat, message_id: Number(messageId), text: toTelegramHtml(text), parse_mode: 'HTML', link_preview_options: { is_disabled: true } })
  if (!edited.ok) console.error('[loopengine] Telegram editMessageText failed:', edited.description)
}

const botNames = new Map<string, { username: string; at: number }>()

/** The bot's @username (without @), asked once an hour per token; how a
 * mention of it is spotted. */
export async function telegramBotUsername(botToken: string): Promise<string | undefined> {
  const cached = botNames.get(botToken)
  if (cached && Date.now() - cached.at < 60 * 60 * 1000) return cached.username
  const me = await callTelegram<{ username?: string }>(botToken, 'getMe', {})
  if (!me.ok || !me.result?.username) return cached?.username
  botNames.set(botToken, { username: me.result.username, at: Date.now() })
  return me.result.username
}

/** Points the bot's updates at `url` with `secret` as the secret_token
 * (./updates.ts checks it). Only messages and button clicks are sent. */
export async function setTelegramWebhook(botToken: string, url: string, secret: string): Promise<{ ok: boolean; error?: string; botUsername?: string }> {
  const set = await callTelegram(botToken, 'setWebhook', { url, secret_token: secret, allowed_updates: ['message', 'callback_query'] })
  if (!set.ok) return { ok: false, error: telegramSetupError(set.description) }
  return { ok: true, botUsername: await telegramBotUsername(botToken) }
}

/** Where the bot's updates go now, and the last delivery error Telegram saw. */
/** Where the bot's updates go now; the last delivery error Telegram saw
 * and when (it keeps it until a newer one); and how many are waiting. */
export async function telegramWebhookInfo(botToken: string): Promise<{ ok: boolean; url?: string; lastError?: string; lastErrorAt?: string; pending?: number; error?: string }> {
  const info = await callTelegram<{ url?: string; last_error_message?: string; last_error_date?: number; pending_update_count?: number }>(botToken, 'getWebhookInfo', {})
  if (!info.ok) return { ok: false, error: telegramSetupError(info.description) }
  const r = info.result
  return {
    ok: true,
    url: r?.url || undefined,
    ...(r?.last_error_message ? { lastError: r.last_error_message } : {}),
    ...(r?.last_error_date ? { lastErrorAt: new Date(r.last_error_date * 1000).toISOString() } : {}),
    ...(r?.pending_update_count ? { pending: r.pending_update_count } : {}),
  }
}

function telegramSetupError(description: string | undefined): string {
  if (/unauthorized|not found/i.test(description ?? '')) return 'Telegram rejected the bot token; copy it from @BotFather again'
  if (/https/i.test(description ?? '')) return 'Telegram only sends updates to an https address; set LOOPENGINE_PUBLIC_URL to this server\'s https address'
  return `Telegram said: ${description ?? 'no answer'}`
}
