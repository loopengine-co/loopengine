import { afterEach, describe, expect, it, vi } from 'vitest'
import { slackBotIdentity } from '#core/messaging/connectors/slack/index.js'

describe("a Slack bot token's identity", () => {
  afterEach(() => vi.unstubAllGlobals())

  it('names the bot and its workspace, from auth.test, and remembers them', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true, user: 'loopengine', team: 'Everymarket' })))
    vi.stubGlobal('fetch', fetchMock)
    expect(await slackBotIdentity('xoxb-identity-1')).toEqual({ bot: 'loopengine', team: 'Everymarket' })
    expect(await slackBotIdentity('xoxb-identity-1')).toEqual({ bot: 'loopengine', team: 'Everymarket' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toBe('https://slack.com/api/auth.test')
  })

  it("says nothing when Slack rejects the token or can't be reached", async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: false, error: 'invalid_auth' }))))
    expect(await slackBotIdentity('xoxb-identity-2')).toBeUndefined()
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    expect(await slackBotIdentity('xoxb-identity-3')).toBeUndefined()
  })
})
