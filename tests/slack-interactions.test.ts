import { createHmac } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { listSlackChannels, parseSlackInteraction, slackAppManifest, slackOutcomeText, verifySlackRequest } from '#core/messaging/connectors/slack/index.js'

const form = (payload: unknown) => 'payload=' + encodeURIComponent(JSON.stringify(payload))

afterEach(() => vi.unstubAllGlobals())

describe('verifySlackRequest', () => {
  it('accepts a correctly signed recent request and rejects a wrong secret or an old timestamp', () => {
    const now = 1_760_000_000_000
    const ts = String(now / 1000)
    const body = form({ type: 'block_actions' })
    const sig = 'v0=' + createHmac('sha256', 'secret').update(`v0:${ts}:${body}`).digest('hex')
    expect(verifySlackRequest(body, ts, sig, 'secret', now)).toBe(true)
    expect(verifySlackRequest(body, ts, sig, 'other', now)).toBe(false)
    expect(verifySlackRequest(body, ts, sig, 'secret', now + 6 * 60_000)).toBe(false)
    expect(verifySlackRequest(body, undefined, sig, 'secret', now)).toBe(false)
  })
})

describe('parseSlackInteraction', () => {
  it('reads approve/deny, an answer option, the Other… modal, and a modal submission', () => {
    expect(parseSlackInteraction(form({ type: 'block_actions', user: { id: 'U1' }, response_url: 'https://r', actions: [{ action_id: 'deny', value: 'p1' }] })))
      .toEqual({ type: 'decide', pendingId: 'p1', decision: 'deny', responseUrl: 'https://r', user: 'U1' })
    expect(parseSlackInteraction(form({ type: 'block_actions', actions: [{ action_id: 'answer_option', value: JSON.stringify({ pendingId: 'p2', answer: 'east' }) }] })))
      .toMatchObject({ type: 'answer', pendingId: 'p2', answer: 'east' })
    expect(parseSlackInteraction(form({ type: 'block_actions', actions: [{ action_id: 'answer_option_2', value: JSON.stringify({ pendingId: 'p2', answer: 'west' }) }] })))
      .toMatchObject({ type: 'answer', pendingId: 'p2', answer: 'west' })
    expect(parseSlackInteraction(form({ type: 'block_actions', trigger_id: 'T', actions: [{ action_id: 'open_answer_modal', value: 'p3' }] })))
      .toEqual({ type: 'open_answer', pendingId: 'p3', triggerId: 'T' })
    expect(parseSlackInteraction(form({ type: 'view_submission', view: { private_metadata: 'p4', state: { values: { answer_block: { answer_input: { value: 'typed' } } } } } })))
      .toMatchObject({ type: 'answer', pendingId: 'p4', answer: 'typed' })
    expect(parseSlackInteraction('payload=not-json')).toEqual({ type: 'ignore' })
    expect(parseSlackInteraction(form({ type: 'block_actions', actions: [{ action_id: 'something_else', value: 'x' }] }))).toEqual({ type: 'ignore' })
  })
})

describe('slackOutcomeText', () => {
  it('says what happened, who did it, and quotes the agent reply', () => {
    expect(slackOutcomeText('approve', 200, { text: 'Refund issued' }, 'U1')).toBe(':white_check_mark: Approved by <@U1>.\n>Refund issued')
    expect(slackOutcomeText('deny', 200, { alreadyResolved: true })).toBe('Already decided elsewhere.')
    expect(slackOutcomeText('approve', 200, { resolved: true })).toMatch(/Still waiting on another decision/)
    expect(slackOutcomeText('answer', 400, { error: 'bad' })).toMatch(/Couldn't record that: bad/)
  })
})

describe('slackAppManifest and listSlackChannels', () => {
  it('builds a manifest with the bot scopes, interactivity URL and events URL', () => {
    const manifest = slackAppManifest({ agentName: 'support', interactivityUrl: 'https://a.example/hooks/slack/support' }) as Record<string, any>
    expect(manifest.oauth_config.scopes.bot).toEqual(['chat:write', 'channels:read', 'groups:read', 'channels:history', 'groups:history', 'users:read'])
    expect(manifest.settings.interactivity).toEqual({ is_enabled: true, request_url: 'https://a.example/hooks/slack/support' })
    expect(manifest.settings.event_subscriptions).toEqual({ request_url: 'https://a.example/hooks/slack/support/events', bot_events: ['message.channels', 'message.groups'] })
  })

  it('lists channels the bot is in first, and explains a rejected token', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true, channels: [{ id: 'C2', name: 'zeta', is_member: false }, { id: 'C1', name: 'alpha', is_member: true, is_private: true }] }))))
    expect(await listSlackChannels('xoxb')).toEqual([
      { id: 'C1', name: 'alpha', isPrivate: true, isMember: true },
      { id: 'C2', name: 'zeta', isPrivate: false, isMember: false },
    ])
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: false, error: 'invalid_auth' }))))
    await expect(listSlackChannels('bad')).rejects.toThrow(/rejected the bot token/)
  })
})
