import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentConfig } from '#core/agent-config.js'
import { setAgentDir } from '#core/agent-env.js'
import { describeNotifier, resolveHttpNotifier } from '#core/http-notifier.js'
import { NotifierFileError, readNotifierFile, removeNotifierFile, validateNotifierFile, writeNotifierFile } from '#core/notifier-file.js'
import { WebhookNotifier } from '#core/http-notify-triggers/webhook.js'

let dir: string
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'loopengine-notifier-')) })
afterEach(() => rmSync(dir, { recursive: true, force: true }))

function agent(overrides: Partial<AgentConfig> = {}): AgentConfig {
  const config: AgentConfig = { name: 'notify-agent', systemPrompt: 'x', ...overrides }
  setAgentDir(config, dir)
  return config
}

describe('notifier.yml', () => {
  it('round-trips a webhook config, with a header naming where the secret lives', () => {
    writeNotifierFile(dir, { channel: 'webhook', events: ['approval', 'question'], url: 'https://app.example.com/hooks/loopengine' })
    expect(readFileSync(join(dir, 'notifier.yml'), 'utf8')).toContain('LOOPENGINE_NOTIFIER_WEBHOOK_SECRET')
    expect(readNotifierFile(dir)).toEqual({ channel: 'webhook', events: ['approval', 'question'], url: 'https://app.example.com/hooks/loopengine' })
    removeNotifierFile(dir)
    expect(readNotifierFile(dir)).toBeUndefined()
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

describe('resolveHttpNotifier falling back to notifier.yml', () => {
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
    expect(describeNotifier(config).error).toMatch(/notifier.yml is invalid/)
    consoleError.mockRestore()
  })
})
