import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentConfig } from '#core/agent-config.js'
import { createAgentEnv, setAgentDir } from '#core/agent-env.js'
import { describeNotifier, resolveHttpNotifier } from '#core/http-notifier.js'
import { TelegramNotifier } from '#core/http-notify-triggers/telegram.js'
import { WebhookNotifier } from '#core/http-notify-triggers/webhook.js'
import {
  NotifierFileError,
  notifierConfigFromFile,
  readActiveConnections,
  readMessagingConnections,
  readNotifierFile,
  removeMessagingConnection,
  setPrimaryConnection,
  validateNotifierFile,
  writeNotifierFile,
} from '#core/notifier-file.js'
import { describeAgentNotifier, saveAgentNotifier, setAgentApprovers, testAgentNotifier } from '#web/notifier-admin.js'

let dir: string
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'loopengine-primary-')) })
afterEach(() => {
  vi.unstubAllGlobals()
  rmSync(dir, { recursive: true, force: true })
})

function agent(): AgentConfig {
  const config: AgentConfig = { name: 'primary-agent', systemPrompt: 'x' }
  setAgentDir(config, dir)
  return config
}

const WEBHOOK = { channel: 'webhook', events: ['approval', 'question'], url: 'https://app.example.com/hook' }
const TELEGRAM = { channel: 'telegram', events: ['approval', 'question'], chatId: '-1001234567890' }
const SLACK = { channel: 'slack', events: ['approval'], channelId: 'C0123ABC' }

describe('the webhook always sends; one messaging app is primary', () => {
  it('keeps every app saved and makes the first messaging app primary, never the webhook', () => {
    writeNotifierFile(dir, WEBHOOK)
    expect(readMessagingConnections(dir).primary).toBeUndefined()
    expect(readActiveConnections(dir).map((c) => c.channel)).toEqual(['webhook'])

    writeNotifierFile(dir, TELEGRAM)
    writeNotifierFile(dir, SLACK)
    const saved = readMessagingConnections(dir)
    expect(saved.connections.map((c) => c.channel)).toEqual(['webhook', 'telegram', 'slack'])
    expect(saved.primary).toBe('telegram')
    expect(readActiveConnections(dir).map((c) => c.channel)).toEqual(['webhook', 'telegram'])
    expect(readNotifierFile(dir)?.channel).toBe('telegram')
    expect(readFileSync(join(dir, 'messaging.yml'), 'utf8')).toMatch(/^primary: telegram$/m)
  })

  it("replaces an app's earlier connection rather than adding a second one", () => {
    writeNotifierFile(dir, WEBHOOK)
    writeNotifierFile(dir, { ...WEBHOOK, url: 'https://other.example.com/hook' })

    expect(readMessagingConnections(dir).connections).toEqual([{ ...WEBHOOK, url: 'https://other.example.com/hook' }])
  })

  it('sends each request to the webhook and the primary app under one request id', () => {
    writeFileSync(join(dir, '.env'), 'LOOPENGINE_NOTIFIER_WEBHOOK_SECRET=shh\nLOOPENGINE_NOTIFIER_TELEGRAM_BOT_TOKEN=123:abc\nLOOPENGINE_NOTIFIER_SLACK_BOT_TOKEN=xoxb-1\n')
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ ok: true }), { status: 200 }))
    writeNotifierFile(dir, WEBHOOK)
    writeNotifierFile(dir, TELEGRAM)
    writeNotifierFile(dir, SLACK)
    const webhook = vi.spyOn(WebhookNotifier.prototype, 'requestDurableApproval')
    const telegram = vi.spyOn(TelegramNotifier.prototype, 'requestDurableApproval')
    const config = agent()

    const approver = resolveHttpNotifier(config).approver as unknown as { requestDurableApproval: (...a: unknown[]) => { pendingId: string } }
    const { pendingId } = approver.requestDurableApproval('issue_refund', { amount: 40 }, { tenant: 't', environment: 'production', agent: 'a' }, 'over limit')

    expect(webhook).toHaveBeenCalledTimes(1)
    expect(telegram).toHaveBeenCalledTimes(1)
    // The second notifier is handed the first one's id.
    expect(telegram.mock.calls[0][4]).toBe(pendingId)
    expect(describeNotifier(config)).toMatchObject({ source: 'file', channel: 'telegram', active: [{ channel: 'webhook' }, { channel: 'telegram' }] })

    // Slack is saved but not primary, so it sends nothing until made primary.
    setPrimaryConnection(dir, 'slack')
    expect(describeNotifier(config).active).toEqual([{ channel: 'webhook' }, { channel: 'slack' }])
  })

  it('uses a lone webhook as it is, and the primary app as it is', () => {
    writeFileSync(join(dir, '.env'), 'LOOPENGINE_NOTIFIER_WEBHOOK_SECRET=shh\nLOOPENGINE_NOTIFIER_TELEGRAM_BOT_TOKEN=123:abc\n')
    writeNotifierFile(dir, WEBHOOK)
    expect(resolveHttpNotifier(agent()).approver).toBeInstanceOf(WebhookNotifier)
    removeMessagingConnection(dir, 'webhook')
    writeNotifierFile(dir, TELEGRAM)
    expect(resolveHttpNotifier(agent()).approver).toBeInstanceOf(TelegramNotifier)
  })

  it('leaves out a connection whose secret is missing, and says which', () => {
    writeFileSync(join(dir, '.env'), 'LOOPENGINE_NOTIFIER_WEBHOOK_SECRET=shh\n')
    writeNotifierFile(dir, WEBHOOK)
    writeNotifierFile(dir, TELEGRAM)
    const config = agent()

    expect(resolveHttpNotifier(config).approver).toBeInstanceOf(WebhookNotifier)
    expect(describeNotifier(config)).toMatchObject({ source: 'file', active: [{ channel: 'webhook' }, { channel: 'telegram', missingSecret: 'LOOPENGINE_NOTIFIER_TELEGRAM_BOT_TOKEN' }] })
  })

  it('refuses to make the webhook primary, or an app that is not set up', () => {
    writeNotifierFile(dir, WEBHOOK)
    expect(() => setPrimaryConnection(dir, 'webhook')).toThrow(/webhook always sends/)
    expect(() => setPrimaryConnection(dir, 'slack')).toThrow(NotifierFileError)
    writeNotifierFile(dir, WEBHOOK, { makePrimary: true })
    expect(readMessagingConnections(dir).primary).toBeUndefined()
  })

  it('leaves no app primary when the primary is removed, and the webhook keeps sending', () => {
    writeNotifierFile(dir, WEBHOOK)
    writeNotifierFile(dir, TELEGRAM)
    writeNotifierFile(dir, SLACK)

    removeMessagingConnection(dir, 'telegram')
    expect(readMessagingConnections(dir).primary).toBeUndefined()
    expect(readActiveConnections(dir).map((c) => c.channel)).toEqual(['webhook'])

    // Saving a messaging app while none is primary makes it primary.
    writeNotifierFile(dir, SLACK)
    expect(readMessagingConnections(dir).primary).toBe('slack')
  })

  it('uses the first messaging app of a file written before there was a primary', () => {
    writeFileSync(join(dir, 'messaging.yml'), 'connections:\n  - app: webhook\n    url: https://app.example.com/hook\n    events: [approval]\n  - app: telegram\n    chatId: "-100123"\n    events: [approval]\n')
    expect(readMessagingConnections(dir).primary).toBe('telegram')
    expect(readActiveConnections(dir).map((c) => c.channel)).toEqual(['webhook', 'telegram'])

    writeFileSync(join(dir, 'messaging.yml'), 'primary:\nconnections:\n  - app: telegram\n    chatId: "-100123"\n    events: [approval]\n')
    expect(readActiveConnections(dir)).toEqual([])
  })
})

describe('Telegram', () => {
  it('needs a chat id or @channel, kept as a string even when YAML would read a number', () => {
    expect(() => validateNotifierFile({ ...TELEGRAM, chatId: undefined })).toThrow(/Telegram chat id/)
    expect(() => validateNotifierFile({ ...TELEGRAM, chatId: 'not a chat' })).toThrow(/Telegram chat id/)
    expect(validateNotifierFile({ ...TELEGRAM, chatId: '@loopengine_ops' }).chatId).toBe('@loopengine_ops')

    writeFileSync(join(dir, 'messaging.yml'), 'primary: telegram\nconnections:\n  - app: telegram\n    chatId: -1001234567890\n    events: [approval]\n')
    expect(readNotifierFile(dir)?.chatId).toBe('-1001234567890')
    writeNotifierFile(dir, TELEGRAM)
    expect(readFileSync(join(dir, 'messaging.yml'), 'utf8')).toContain('"-1001234567890"')
  })

  it('reads its bot token from the agent env', () => {
    const file = validateNotifierFile(TELEGRAM)
    expect(notifierConfigFromFile(file, createAgentEnv('primary-agent', dir))).toEqual({ missingSecret: 'LOOPENGINE_NOTIFIER_TELEGRAM_BOT_TOKEN' })
    writeFileSync(join(dir, '.env'), 'LOOPENGINE_NOTIFIER_TELEGRAM_BOT_TOKEN=123:abc\n')
    expect(notifierConfigFromFile(file, createAgentEnv('primary-agent', dir)).config).toEqual({
      channel: 'telegram', config: { botToken: '123:abc', chatId: '-1001234567890', publicUrl: undefined }, events: ['approval', 'question'],
    })
  })

  it('posts a request with its decision link through sendMessage', async () => {
    const sent: Array<{ url: string; body: Record<string, unknown> }> = []
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      sent.push({ url, body: JSON.parse(init.body as string) })
      return new Response(JSON.stringify({ ok: true }), { status: 200 })
    })
    const telegram = new TelegramNotifier({ botToken: '123:abc', chatId: '-100123', publicUrl: 'https://le.example.com' })

    const { pendingId } = telegram.requestDurableApproval('issue_refund', { amount: 40 }, { tenant: 't', environment: 'production', agent: 'a' }, 'over limit')
    await vi.waitFor(() => expect(sent).toHaveLength(1))

    expect(sent[0].url).toBe('https://api.telegram.org/bot123:abc/sendMessage')
    expect(sent[0].body.chat_id).toBe('-100123')
    expect(sent[0].body.text).toContain('issue_refund')
    // The link carries a signed token for this request (made fresh each time).
    expect(pendingId).toBeTruthy()
    expect(sent[0].body.text).toMatch(/Approve or deny: https:[/][/]le[.]example[.]com[/]decide[/][A-Za-z0-9_.-]+/)
  })
})

describe('the console admin', () => {
  it('lists every connection and the primary, saves one app at a time, and keeps Slack approvers when Slack stops being primary', async () => {
    const config = agent()
    await saveAgentNotifier(config, { ...WEBHOOK })
    await saveAgentNotifier(config, { ...SLACK })
    setAgentApprovers(config, [{ user: 'U0123ABC', name: 'Sam' }])
    await saveAgentNotifier(config, { ...SLACK, channelId: 'C0999XYZ' })

    const view = describeAgentNotifier(config)
    expect(view.primary).toBe('slack')
    expect(view.channels).toEqual(['slack', 'telegram', 'lark', 'email', 'webhook'])
    expect(view.primaryChannels).toEqual(['telegram', 'slack', 'lark', 'email'])
    expect(view.connections.find((c) => c.channel === 'slack')).toMatchObject({ channelId: 'C0999XYZ', approvers: [{ user: 'U0123ABC', name: 'Sam' }] })

    // (A secret in the body is written to the agent's registered env file,
    // so this test sets it in its own folder instead.)
    writeFileSync(join(dir, '.env'), 'LOOPENGINE_NOTIFIER_TELEGRAM_BOT_TOKEN=123:abc\n')
    await saveAgentNotifier(config, { ...TELEGRAM, primary: true })
    expect(describeAgentNotifier(config)).toMatchObject({ primary: 'telegram', source: 'file', channel: 'telegram', secretsSet: { telegram: true } })
  })

  it('tests a saved app that is not primary, and says when an app is not set up', async () => {
    const config = agent()
    writeFileSync(join(dir, '.env'), 'LOOPENGINE_NOTIFIER_TELEGRAM_BOT_TOKEN=123:abc\n')
    writeNotifierFile(dir, WEBHOOK)
    writeNotifierFile(dir, TELEGRAM)
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ ok: true }), { status: 200 }))

    expect(await testAgentNotifier(config, undefined, 'telegram')).toMatchObject({ ok: true, channel: 'telegram' })
    expect(await testAgentNotifier(config, undefined, 'lark')).toMatchObject({ ok: false, error: 'Save the lark connection first' })
  })
})
