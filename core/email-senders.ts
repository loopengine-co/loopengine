// Sends email through a provider's HTTP API, for the email channel set
// from the console's Messaging tab (agents/<name>/messaging.yml, app:
// email). One fetch per provider, so this package still carries no mail
// library; plain SMTP isn't offered for the same reason (an app that needs
// it can pass its own AgentConfig.SendEmail in code instead).
//
// Every attempt is recorded in core/notifier-deliveries.ts, so the
// Messaging tab's deliveries list shows whether an email went out and why
// not.
import type { SendEmail, SendEmailMeta } from '#core/agent-config.js'
import { recordDelivery } from '#core/notifier-deliveries.js'

export type EmailProvider = 'resend' | 'sendgrid' | 'postmark'

export const EMAIL_PROVIDERS: EmailProvider[] = ['resend', 'sendgrid', 'postmark']

const ENDPOINTS: Record<EmailProvider, string> = {
  resend: 'https://api.resend.com/emails',
  sendgrid: 'https://api.sendgrid.com/v3/mail/send',
  postmark: 'https://api.postmarkapp.com/email',
}

const ADDRESS = /^[^\s@<>,"]+@[^\s@<>,"]+\.[^\s@<>,"]+$/

/** "Ops <ops@example.com>" or "ops@example.com". */
export function parseAddress(value: string): { name?: string; email: string } | undefined {
  const trimmed = value.trim()
  const named = /^(.*?)\s*<([^<>]+)>$/.exec(trimmed)
  const email = (named ? named[2] : trimmed).trim()
  if (!ADDRESS.test(email)) return undefined
  const name = named?.[1].replace(/^"|"$/g, '').trim()
  return name ? { name, email } : { email }
}

/** A comma- or semicolon-separated list of addresses; undefined when any
 * of them isn't a valid address. */
export function parseRecipients(value: string): string[] | undefined {
  const parts = value.split(/[,;]/).map((p) => p.trim()).filter(Boolean)
  if (!parts.length || parts.some((p) => !parseAddress(p))) return undefined
  return parts
}

/** A plain-text version of the HTML body, for mail clients (and spam
 * filters) that prefer one. */
export function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n')
    .replace(/<a [^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, '$2 ($1)')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function requestFor(provider: EmailProvider, apiKey: string, from: string, to: string[], subject: string, html: string): RequestInit {
  const text = htmlToText(html)
  switch (provider) {
    case 'resend':
      return {
        method: 'POST',
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({ from, to, subject, html, text }),
      }
    case 'sendgrid': {
      const sender = parseAddress(from)!
      return {
        method: 'POST',
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          personalizations: [{ to: to.map((t) => parseAddress(t)!) }],
          from: sender,
          subject,
          content: [
            { type: 'text/plain', value: text },
            { type: 'text/html', value: html },
          ],
        }),
      }
    }
    case 'postmark':
      return {
        method: 'POST',
        headers: { 'x-postmark-server-token': apiKey, 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ From: from, To: to.join(', '), Subject: subject, HtmlBody: html, TextBody: text, MessageStream: 'outbound' }),
      }
  }
}

/** The provider's own error message, when its response carries one. */
async function errorDetail(res: Response): Promise<string> {
  const body = (await res.json().catch(() => undefined)) as
    | { message?: string; Message?: string; errors?: { message?: string }[]; name?: string }
    | undefined
  return body?.message ?? body?.Message ?? body?.errors?.[0]?.message ?? body?.name ?? ''
}

export interface ProviderSenderOptions {
  provider: EmailProvider
  apiKey: string
  /** The sender, e.g. "LoopEngine <approvals@example.com>"; the provider
   * must allow sending from its domain. */
  from: string
  /** For the deliveries list. */
  agent: string
}

/** A SendEmail that sends through `provider`. Throws when the provider
 * refuses the email, after recording the failure. */
export function createProviderSendEmail(options: ProviderSenderOptions): SendEmail {
  return async (to: string, subject: string, html: string, meta?: SendEmailMeta) => {
    const recipients = parseRecipients(to)
    if (!recipients) throw new Error(`"${to}" isn't a valid list of email addresses`)
    const delivery = { agent: options.agent, kind: meta?.kind ?? 'approval', url: `${options.provider}:${recipients.join(',')}`, attempt: 1, ...(meta?.pendingId ? { pendingId: meta.pendingId } : {}) } as const
    let res: Response
    try {
      res = await fetch(ENDPOINTS[options.provider], requestFor(options.provider, options.apiKey, options.from, recipients, subject, html))
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err)
      recordDelivery({ at: new Date().toISOString(), ...delivery, ok: false, error })
      throw new Error(`${options.provider} couldn't be reached: ${error}`)
    }
    if (!res.ok) {
      const detail = await errorDetail(res)
      const error = `HTTP ${res.status}${detail ? `: ${detail}` : ''}`
      recordDelivery({ at: new Date().toISOString(), ...delivery, ok: false, status: res.status, error })
      throw new Error(`${options.provider} refused the email (${error})`)
    }
    recordDelivery({ at: new Date().toISOString(), ...delivery, ok: true, status: res.status })
  }
}
