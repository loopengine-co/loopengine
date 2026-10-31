// The sending half of a Telegram-backed DurableApprover/DurableQuestionHandler,
// so AgentConfig.httpNotifier (core/http-notifier.ts) can construct one
// for `channel: 'telegram'`, the way it does for Slack and Lark (read
// ./lark.ts first; this mirrors it).
//
// Posts through the Bot API's sendMessage (core.telegram.org/bots/api)
// to one chat: a group, a channel the bot can post in, or a person who
// has started the bot. Like a console-configured Lark notifier, each
// request carries a link to the decision page rather than buttons:
// inline-keyboard callbacks would need a webhook this server receives
// and verifies, which nothing here sets up yet. Plain text, no
// parse_mode, so tool names and arguments never need escaping.
import { randomUUID } from 'node:crypto'
import type { DurableApprover, Scope } from 'actauth'
import type { DurableQuestionHandler } from '../agent-config.js'
import { decidePath } from '../approval-links.js'
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

export class TelegramNotifier implements DurableApprover, DurableQuestionHandler {
  private readonly botToken: string
  private readonly chatId: string
  private readonly publicUrl?: string

  /** `publicUrl`: same meaning as SlackNotifier's — each message links to
   * the decision page when the server's address is known. */
  constructor(options: { botToken: string; chatId: string; publicUrl?: string }) {
    this.botToken = options.botToken
    this.chatId = options.chatId
    this.publicUrl = options.publicUrl
  }

  private decideLine(pendingId: string, kind: 'approval' | 'question'): string {
    const base = publicBaseUrl(this.publicUrl)
    return base ? `\n\n${kind === 'approval' ? 'Approve or deny' : 'Answer'}: ${base}${decidePath(pendingId, kind)}` : ''
  }

  private send(text: string, label: string): void {
    void sendTelegramMessage(this.botToken, this.chatId, text).then((result) => {
      if (!result.ok) console.error(`[loopengine] TelegramNotifier: send message failed for ${label}:`, result.error)
    })
  }

  requestDurableApproval(tool: string, args: Record<string, unknown>, scope: Scope, reason: string, pendingId: string = randomUUID()): { pendingId: string } {
    this.send(
      `Approval requested\n\ntool: ${tool}\nargs: ${JSON.stringify(args)}\nscope: ${scope.tenant}/${scope.environment}/${scope.agent}\nreason: ${reason}${this.decideLine(pendingId, 'approval')}`,
      `pendingId '${pendingId}'`,
    )
    return { pendingId }
  }

  notifyPendingQuestion(question: string, options: string[] | undefined, agent: string, sessionId: string | undefined, pendingId: string = randomUUID()): { pendingId: string } {
    const choices = options?.length ? `\n\nOptions: ${options.join(' / ')}` : ''
    this.send(`Question from ${agent}\n\n${question}${choices}${sessionId ? `\n(session ${sessionId})` : ''}${this.decideLine(pendingId, 'question')}`, `pendingId '${pendingId}'`)
    return { pendingId }
  }

  /** A plain announcement (run started/finished, a scheduled task's
   * result), with nothing to decide. */
  postMessage(text: string): void {
    this.send(text, 'an announcement')
  }
}
