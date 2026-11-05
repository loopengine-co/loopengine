// The sending half of a Telegram-backed DurableApprover/DurableQuestionHandler,
// so AgentConfig.httpNotifier (core/http-notifier.ts) can construct one
// for `channel: 'telegram'`, the way it does for Slack (read ./slack.ts
// first; this mirrors it).
//
// Posts through the Bot API's sendMessage (core.telegram.org/bots/api)
// to one chat: a group, a channel the bot can post in, or a person who
// has started the bot. Each request links to the decision page; with
// `buttons` (the bot's webhook points at this server, see
// core/messaging/connectors/telegram/) it also gets Approve/Deny or a
// question's options as inline buttons, handled at
// POST /hooks/telegram/<agent>. Messages are HTML (parse_mode), built
// from Markdown with everything the agent wrote escaped.
import { randomUUID } from 'node:crypto'
import type { DurableApprover, Scope } from 'actauth'
import type { DurableQuestionHandler } from '../agent-config.js'
import { decidePath } from '../approval-links.js'
import { formatArgs } from '../messaging/format-args.js'
import { callTelegram, type InlineButton } from '../messaging/connectors/telegram/index.js'
import { telegramEscape, toTelegramHtml } from '../messaging/connectors/telegram/format.js'
import { telegramCallbackData } from '../messaging/connectors/telegram/updates.js'
import { publicBaseUrl, type DeliveryResult } from './webhook.js'

// Telegram's limit for one message's text.
const MAX_TEXT = 4096

async function sendTelegramMessage(botToken: string, chatId: string, text: string): Promise<DeliveryResult> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: text.length > MAX_TEXT ? text.slice(0, MAX_TEXT - 1) + '…' : text, disable_web_page_preview: true }),
    })
    const body = (await res.json().catch(() => ({}))) as { ok?: boolean; description?: string }
    return body.ok ? { ok: true, status: res.status } : { ok: false, status: res.status, error: body.description || `HTTP ${res.status}` }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** The Messaging tab's Send test. */
export function sendTestTelegramMessage(botToken: string, chatId: string, text: string): Promise<DeliveryResult> {
  return sendTelegramMessage(botToken, chatId, text)
}

/** Where a message landed, and which request it is when it's one. */
export interface TelegramPosted {
  chat: string
  messageId: string
  /** The Markdown it was built from, for the thread's record. */
  text: string
  pendingId?: string
  kind?: 'approval' | 'question'
}

export class TelegramNotifier implements DurableApprover, DurableQuestionHandler {
  private readonly botToken: string
  private readonly chatId: string
  private readonly publicUrl?: string
  private readonly buttons: boolean
  private readonly replyHint: boolean
  private readonly onPosted?: (posted: TelegramPosted) => void

  /** `publicUrl`: same meaning as SlackNotifier's — each message links to
   * the decision page when the server's address is known. `buttons`:
   * add inline buttons, which only work once the bot's webhook points at
   * this server; default false. `replyHint`: say replies are answered.
   * `onPosted`: told where each message landed, so replies to it can be
   * matched to its request (core/messaging/threads.ts). */
  constructor(options: { botToken: string; chatId: string; publicUrl?: string; buttons?: boolean; replyHint?: boolean; onPosted?: (posted: TelegramPosted) => void }) {
    this.botToken = options.botToken
    this.chatId = options.chatId
    this.publicUrl = options.publicUrl
    this.buttons = options.buttons ?? false
    this.replyHint = options.replyHint ?? false
    this.onPosted = options.onPosted
  }

  private decideLine(pendingId: string, kind: 'approval' | 'question'): string {
    const base = publicBaseUrl(this.publicUrl)
    return base ? `[${kind === 'approval' ? 'Open to approve or deny' : 'Open to answer'}](${base}${decidePath(pendingId, kind)})` : ''
  }

  private send(markdown: string, label: string, keyboard?: InlineButton[][], request?: { pendingId: string; kind: 'approval' | 'question' }): void {
    // Not awaited, by DurableApprover's contract; a failure is logged.
    void callTelegram<{ message_id: number; chat?: { id: number } }>(this.botToken, 'sendMessage', {
      chat_id: this.chatId,
      text: toTelegramHtml(markdown),
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
      ...(keyboard?.length ? { reply_markup: { inline_keyboard: keyboard } } : {}),
    }).then((sent) => {
      if (!sent.ok || !sent.result) {
        console.error(`[loopengine] TelegramNotifier: send message failed for ${label}:`, sent.description)
        return
      }
      this.onPosted?.({ chat: String(sent.result.chat?.id ?? this.chatId), messageId: String(sent.result.message_id), text: markdown, ...(request ?? {}) })
    })
  }

  requestDurableApproval(tool: string, args: Record<string, unknown>, scope: Scope, reason: string, pendingId: string = randomUUID()): { pendingId: string } {
    const lines = [
      `**Approval requested:** \`${tool}\``,
      formatArgs(args, telegramEscape),
      `**Why:** ${telegramEscape(reason)}`,
      this.decideLine(pendingId, 'approval'),
      telegramEscape(`${scope.agent} · ${scope.tenant}/${scope.environment}`),
      this.replyHint ? 'Reply to this message to ask about it.' : '',
    ]
    const keyboard = this.buttons
      ? [[
          { text: 'Approve', callback_data: telegramCallbackData({ type: 'decide', decision: 'approve' }, pendingId) },
          { text: 'Deny', callback_data: telegramCallbackData({ type: 'decide', decision: 'deny' }, pendingId) },
        ]]
      : undefined
    this.send(lines.filter(Boolean).join('\n'), `pendingId '${pendingId}'`, keyboard, { pendingId, kind: 'approval' })
    return { pendingId }
  }

  notifyPendingQuestion(question: string, options: string[] | undefined, agent: string, sessionId: string | undefined, pendingId: string = randomUUID()): { pendingId: string } {
    const lines = [
      `**Question from ${telegramEscape(agent)}${sessionId ? ` (session ${telegramEscape(sessionId)})` : ''}:**`,
      telegramEscape(question),
      this.decideLine(pendingId, 'question'),
      this.replyHint ? (options?.length ? 'Or reply to this message with another answer.' : 'Reply to this message to answer.') : '',
    ]
    // One option per row: a long option would squeeze its neighbours.
    const keyboard = this.buttons ? (options ?? []).slice(0, 20).map((option, i) => [{ text: option.slice(0, 64), callback_data: telegramCallbackData({ type: 'answer_option', index: i }, pendingId) }]) : undefined
    this.send(lines.filter(Boolean).join('\n'), `pendingId '${pendingId}'`, keyboard, { pendingId, kind: 'question' })
    return { pendingId }
  }

  /** A plain announcement (run started/finished, a scheduled task's
   * result), with nothing to decide. */
  postMessage(text: string): void {
    this.send(telegramEscape(text), 'an announcement')
  }
}
