import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentConfig } from '#core/agent-config.js'
import { setAgentDir } from '#core/agent-env.js'
import { describeNotifier, resolveHttpNotifier } from '#core/http-notifier.js'
import { NotifierFileError, readNotifierFile, removeNotifierFile, validateNotifierFile, writeNotifierFile } from '#core/notifier-file.js'
import { WebhookNotifier } from '#core/http-notify-triggers/webhook.js'
import { notifierConfigFromFile } from '#core/notifier-file.js'
import { createAgentEnv } from '#core/agent-env.js'
import { slackConversationsOn } from '#web/notifier-admin.js'

let dir: string
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'loopengine-notifier-')) })
afterEach(() => rmSync(dir, { recursive: true, force: true }))

function agent(overrides: Partial<AgentConfig> = {}): AgentConfig {
  const config: AgentConfig = { name: 'notify-agent', systemPrompt: 'x', ...overrides }
  setAgentDir(config, dir)
  return config
}

describe('messaging.yml', () => {
  it('round-trips a webhook config as a list of connections, with a header naming where the secret lives', () => {
    writeNotifierFile(dir, { channel: 'webhook', events: ['approval', 'question'], url: 'https://app.example.com/hooks/loopengine' })
    const text = readFileSync(join(dir, 'messaging.yml'), 'utf8')
    expect(text).toContain('LOOPENGINE_NOTIFIER_WEBHOOK_SECRET')
    expect(text).toMatch(/connections:\n  - app: webhook/)
    expect(readNotifierFile(dir)).toEqual({ channel: 'webhook', events: ['approval', 'question'], url: 'https://app.example.com/hooks/loopengine' })
    removeNotifierFile(dir)
    expect(readNotifierFile(dir)).toBeUndefined()
  })

  it('still reads an older notifier.yml, and replaces it on the next save', () => {
    writeFileSync(join(dir, 'notifier.yml'), 'channel: slack\nevents: [approval]\nchannelId: C1\n')
    expect(readNotifierFile(dir)).toEqual({ channel: 'slack', events: ['approval'], channelId: 'C1' })
    writeNotifierFile(dir, { channel: 'slack', events: ['approval'], channelId: 'C1', conversations: false })
    expect(existsSync(join(dir, 'notifier.yml'))).toBe(false)
    expect(readNotifierFile(dir)).toEqual({ channel: 'slack', events: ['approval'], channelId: 'C1', conversations: false })
  })

  it('keeps the Conversations switch for Slack only, and treats unset as on', () => {
    expect(() => validateNotifierFile({ channel: 'slack', events: ['approval'], channelId: 'C1', conversations: 'yes' })).toThrow(/conversations/)
    expect(validateNotifierFile({ channel: 'webhook', events: ['approval'], url: 'https://x', conversations: true })).not.toHaveProperty('conversations')

    const config = agent()
    writeNotifierFile(dir, { channel: 'slack', events: ['approval'], channelId: 'C1' })
    expect(slackConversationsOn(config)).toBe(true)
    writeNotifierFile(dir, { channel: 'slack', events: ['approval'], channelId: 'C1', conversations: false })
    expect(slackConversationsOn(config)).toBe(false)
  })

  it('adds the reply hint to Slack requests only with buttons on, Conversations on and a plan that allows it', () => {
    const env = (vars: string) => {
      writeFileSync(join(dir, '.env'), vars)
      return createAgentEnv('notify-agent', dir)
    }
    const slack = (file: Parameters<typeof notifierConfigFromFile>[0], vars: string) => {
      const { config } = notifierConfigFromFile(file, env(vars))
      return config?.channel === 'slack' ? config.config.replyHint : undefined
    }
    const file = { channel: 'slack' as const, events: ['approval' as const], channelId: 'C1' }
    const both = 'LOOPENGINE_NOTIFIER_SLACK_BOT_TOKEN=x\nLOOPENGINE_NOTIFIER_SLACK_SIGNING_SECRET=y\n'
    expect(slack(file, both)).toBe(true)
    expect(slack({ ...file, conversations: false }, both)).toBe(false)
    expect(slack(file, 'LOOPENGINE_NOTIFIER_SLACK_BOT_TOKEN=x\n')).toBe(false)
    vi.stubEnv('LOOPENGINE_PLAN', 'free')
    expect(slack(file, both)).toBe(false)
    vi.unstubAllEnvs()
  })

  it('rejects an unknown channel, an empty or unknown event, a non-http url, and missing channel fields', () => {
    expect(() => validateNotifierFile({ channel: 'sms', events: ['approval'] })).toThrow(NotifierFileError)
    expect(() => validateNotifierFile({ channel: 'webhook', events: [], url: 'https://x' })).toThrow(/events/)
    expect(() => validateNotifierFile({ channel: 'webhook', events: ['nope'], url: 'https://x' })).toThrow(/events/)
    expect(() => validateNotifierFile({ channel: 'webhook', events: ['approval'], url: 'ftp://x' })).toThrow(/url/)
    expect(() => validateNotifierFile({ channel: 'slack', events: ['approval'] })).toThrow(/channelId/)
    expect(() => validateNotifierFile({ channel: 'lark', events: ['approval'], appId: 'a' })).toThrow(/chatId/)
    expect(() => validateNotifierFile({ channel: 'webhook', events: ['approval'], url: 'https://x', publicUrl: 'not a url' })).toThrow(/publicUrl/)
    expect(validateNotifierFile({ channel: 'slack', events: ['approval'], channelId: 'C1', publicUrl: 'https://agents.example.com/' }).publicUrl).toBe('https://agents.example.com')
  })
})

describe('resolveHttpNotifier falling back to the messaging settings', () => {
  it('uses the file once its secret is set in the agent env, and re-reads it on every call', () => {
    writeNotifierFile(dir, { channel: 'webhook', events: ['approval'], url: 'https://app.example.com/hook' })
    const config = agent()

    expect(resolveHttpNotifier(config).approver).toBeUndefined()
    expect(describeNotifier(config)).toMatchObject({ source: 'none', channel: 'webhook', missingSecret: 'LOOPENGINE_NOTIFIER_WEBHOOK_SECRET' })

    writeFileSync(join(dir, '.env'), 'LOOPENGINE_NOTIFIER_WEBHOOK_SECRET=shh\n')
    const resolved = resolveHttpNotifier(config)
    expect(resolved.approver).toBeInstanceOf(WebhookNotifier)
    expect(resolved.questionHandler).toBeUndefined()
    expect(describeNotifier(config)).toMatchObject({ source: 'file', channel: 'webhook', events: ['approval'] })

    removeNotifierFile(dir)
    expect(resolveHttpNotifier(config).approver).toBeUndefined()
  })

  it('lets AgentConfig.httpNotifier in code win over the file', () => {
    writeNotifierFile(dir, { channel: 'webhook', events: ['approval'], url: 'https://file.example.com' })
    writeFileSync(join(dir, '.env'), 'LOOPENGINE_NOTIFIER_WEBHOOK_SECRET=shh\n')
    const config = agent({ httpNotifier: { channel: 'webhook', config: { webhookUrl: 'https://code.example.com', webhookSecret: 'c' }, events: ['question'] } })

    expect(describeNotifier(config)).toEqual({ source: 'code', channel: 'webhook', events: ['question'] })
    expect(resolveHttpNotifier(config).approver).toBeUndefined()
    expect(resolveHttpNotifier(config).questionHandler).toBeInstanceOf(WebhookNotifier)
  })

  it('ignores an invalid file rather than failing the turn', () => {
    writeFileSync(join(dir, 'notifier.yml'), 'channel: carrier-pigeon\nevents: [approval]\n')
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const config = agent()
    expect(resolveHttpNotifier(config)).toEqual({})
    expect(describeNotifier(config).error).toMatch(/messaging settings are invalid/)
    consoleError.mockRestore()
  })
})
