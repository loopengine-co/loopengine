import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentConfig } from '#core/agent-config.js'
import { createAgentEnv, setAgentDir } from '#core/agent-env.js'
import { createProviderSendEmail, htmlToText, parseAddress, parseRecipients } from '#core/email-senders.js'
import { describeNotifier, resolveHttpNotifier } from '#core/http-notifier.js'
import { EmailNotifier } from '#core/http-notify-triggers/email.js'
import { clearDeliveries, listDeliveries } from '#core/notifier-deliveries.js'
import { NotifierFileError, notifierConfigFromFile, readNotifierFile, writeNotifierFile } from '#core/notifier-file.js'
import { testAgentNotifier } from '#web/notifier-admin.js'

let dir: string
const realFetch = globalThis.fetch
let sent: { url: string; init: RequestInit }[]
let reply: { status: number; body: unknown }

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'loopengine-email-'))
  sent = []
  reply = { status: 200, body: { id: 'em_1' } }
  clearDeliveries()
  globalThis.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    sent.push({ url: String(url), init: init ?? {} })
    return new Response(JSON.stringify(reply.body), { status: reply.status, headers: { 'content-type': 'application/json' } })
  }) as typeof fetch
})
afterEach(() => {
  globalThis.fetch = realFetch
  rmSync(dir, { recursive: true, force: true })
})

function agent(): AgentConfig {
  const config: AgentConfig = { name: 'mail-agent', systemPrompt: 'x' }
  setAgentDir(config, dir)
  return config
}

const emailFile = { channel: 'email', events: ['approval', 'question'], to: 'ops@example.com; Lead <lead@example.com>', from: 'LoopEngine <approvals@example.com>', provider: 'resend', publicUrl: 'https://le.example.com/' }

describe('the email channel in messaging.yml', () => {
  it('round-trips, normalising the recipients, and names the API key in the header', () => {
    writeNotifierFile(dir, emailFile)
    expect(readFileSync(join(dir, 'messaging.yml'), 'utf8')).toContain('LOOPENGINE_NOTIFIER_EMAIL_API_KEY')
    expect(readNotifierFile(dir)).toEqual({
      channel: 'email',
      events: ['approval', 'question'],
      to: 'ops@example.com, Lead <lead@example.com>',
      from: 'LoopEngine <approvals@example.com>',
      provider: 'resend',
      publicUrl: 'https://le.example.com',
    })
  })

  it('refuses bad recipients, senders and providers', () => {
    expect(() => writeNotifierFile(dir, { ...emailFile, to: 'ops@example.com, nope' })).toThrow(/to must be one or more email addresses/)
    expect(() => writeNotifierFile(dir, { ...emailFile, from: 'LoopEngine' })).toThrow(/from must be an email address/)
    expect(() => writeNotifierFile(dir, { ...emailFile, provider: 'smtp' })).toThrow(NotifierFileError)
  })

  it('needs its API key before it sends anything', () => {
    writeNotifierFile(dir, emailFile)
    const config = agent()
    expect(describeNotifier(config)).toMatchObject({ source: 'none', channel: 'email', missingSecret: 'LOOPENGINE_NOTIFIER_EMAIL_API_KEY' })
    expect(resolveHttpNotifier(config).approver).toBeUndefined()
  })

  it('emails an approval request with a link to the decision page, and logs the delivery', async () => {
    writeNotifierFile(dir, emailFile)
    writeFileSync(join(dir, '.env'), 'LOOPENGINE_NOTIFIER_EMAIL_API_KEY=re_key\n')
    const config = agent()
    expect(describeNotifier(config)).toMatchObject({ source: 'file', channel: 'email' })
    const { approver } = resolveHttpNotifier(config)
    const { pendingId } = (approver as EmailNotifier).requestDurableApproval('issue_refund', { amount: 50 }, { tenant: 't', environment: 'production', agent: 'mail-agent' }, 'ask rule')

    await vi.waitFor(() => expect(sent).toHaveLength(1))
    expect(sent[0].url).toBe('https://api.resend.com/emails')
    expect((sent[0].init.headers as Record<string, string>).authorization).toBe('Bearer re_key')
    const body = JSON.parse(String(sent[0].init.body))
    expect(body.to).toEqual(['ops@example.com', 'Lead <lead@example.com>'])
    expect(body.from).toBe('LoopEngine <approvals@example.com>')
    expect(body.subject).toBe('Approval requested: issue_refund')
    expect(body.html).toMatch(/<a href="https:\/\/le\.example\.com\/decide\/[^"]+">Review and approve or deny<\/a>/)
    expect(body.text).toContain('Review and approve or deny (https://le.example.com/decide/')
    await vi.waitFor(() => expect(listDeliveries('mail-agent')).toHaveLength(1))
    expect(listDeliveries('mail-agent')[0]).toMatchObject({ kind: 'approval', pendingId, ok: true, status: 200, url: 'resend:ops@example.com,Lead <lead@example.com>' })
  })

  it('sends a test email from the Messaging tab, and reports the provider\'s refusal', async () => {
    writeNotifierFile(dir, { ...emailFile, provider: 'postmark' })
    writeFileSync(join(dir, '.env'), 'LOOPENGINE_NOTIFIER_EMAIL_API_KEY=pm_key\n')
    const config = agent()
    expect(await testAgentNotifier(config)).toEqual({ channel: 'email', ok: true })
    expect(sent[0].url).toBe('https://api.postmarkapp.com/email')
    expect((sent[0].init.headers as Record<string, string>)['x-postmark-server-token']).toBe('pm_key')
    expect(JSON.parse(String(sent[0].init.body))).toMatchObject({ From: 'LoopEngine <approvals@example.com>', To: 'ops@example.com, Lead <lead@example.com>', Subject: 'Test from LoopEngine: mail-agent', MessageStream: 'outbound' })

    reply = { status: 422, body: { ErrorCode: 400, Message: "The 'From' address you supplied is not a Sender Signature." } }
    const failed = await testAgentNotifier(config)
    expect(failed).toMatchObject({ channel: 'email', ok: false })
    expect(failed.error).toContain("postmark refused the email (HTTP 422: The 'From' address you supplied is not a Sender Signature.)")
    expect(listDeliveries('mail-agent')[0]).toMatchObject({ kind: 'test', ok: false, status: 422 })
  })
})

describe('provider senders', () => {
  it('builds a SendGrid request with split sender and recipients, and a text part', async () => {
    const send = createProviderSendEmail({ provider: 'sendgrid', apiKey: 'SG.key', from: 'Ops <ops@example.com>', agent: 'a' })
    await send('x@example.com, Y <y@example.com>', 'Hi', '<p>Hello <b>there</b></p>', { kind: 'question', pendingId: 'p1' })
    expect(sent[0].url).toBe('https://api.sendgrid.com/v3/mail/send')
    expect(JSON.parse(String(sent[0].init.body))).toEqual({
      personalizations: [{ to: [{ email: 'x@example.com' }, { name: 'Y', email: 'y@example.com' }] }],
      from: { name: 'Ops', email: 'ops@example.com' },
      subject: 'Hi',
      content: [
        { type: 'text/plain', value: 'Hello there' },
        { type: 'text/html', value: '<p>Hello <b>there</b></p>' },
      ],
    })
    expect(listDeliveries('a')[0]).toMatchObject({ kind: 'question', pendingId: 'p1', ok: true })
  })

  it('throws, after logging, when the provider can\'t be reached or the recipients are invalid', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('ECONNRESET')
    }) as typeof fetch
    const send = createProviderSendEmail({ provider: 'resend', apiKey: 'k', from: 'a@example.com', agent: 'a' })
    await expect(send('b@example.com', 's', '<p>x</p>')).rejects.toThrow(/resend couldn't be reached: ECONNRESET/)
    expect(listDeliveries('a')[0]).toMatchObject({ ok: false, error: 'ECONNRESET' })
    await expect(send('not an address', 's', '<p>x</p>')).rejects.toThrow(/isn't a valid list of email addresses/)
  })

  it('parses addresses and turns HTML into text', () => {
    expect(parseAddress('"Ops Team" <ops@example.com>')).toEqual({ name: 'Ops Team', email: 'ops@example.com' })
    expect(parseAddress('nope')).toBeUndefined()
    expect(parseRecipients('a@example.com,, b@example.com')).toEqual(['a@example.com', 'b@example.com'])
    expect(htmlToText('<p>A &amp; B</p><p><a href="https://x/y">Open</a></p>')).toBe('A & B\nOpen (https://x/y)')
  })
})

describe('EmailNotifier in decision-page mode', () => {
  it('says where to decide when the server\'s address isn\'t known, and offers suggested answers', async () => {
    const sendEmail = vi.fn(async () => {})
    const prev = process.env.LOOPENGINE_PUBLIC_URL
    delete process.env.LOOPENGINE_PUBLIC_URL
    try {
      const notifier = new EmailNotifier({ to: 'a@example.com', sendEmail })
      notifier.notifyPendingQuestion('Which warehouse?', ['east', 'west'], 'support', undefined)
      await vi.waitFor(() => expect(sendEmail).toHaveBeenCalledTimes(1))
      const [, subject, html, meta] = sendEmail.mock.calls[0] as unknown as [string, string, string, { kind: string }]
      expect(subject).toBe('Question from support')
      expect(html).toContain('Suggested answers: east, west')
      expect(html).toContain("Open this agent's Messaging tab in the LoopEngine console to answer.")
      expect(meta.kind).toBe('question')
    } finally {
      if (prev !== undefined) process.env.LOOPENGINE_PUBLIC_URL = prev
    }
  })

  it('refuses half a magic-link setup', () => {
    expect(() => new EmailNotifier({ to: 'a@example.com', sendEmail: async () => {}, signingSecret: 'shh' })).toThrow(/together/)
  })

  it('builds from messaging.yml without an agent name too (labels deliveries with an empty agent)', () => {
    writeNotifierFile(dir, emailFile)
    writeFileSync(join(dir, '.env'), 'LOOPENGINE_NOTIFIER_EMAIL_API_KEY=k\n')
    const { config } = notifierConfigFromFile(readNotifierFile(dir)!, createAgentEnv('mail-agent', dir))
    expect(config).toMatchObject({ channel: 'email', config: { to: 'ops@example.com, Lead <lead@example.com>', publicUrl: 'https://le.example.com' } })
  })
})
