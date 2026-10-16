import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TurnCheckpoint } from '#core/durable-approvals.js'
import type { Message, ModelCall } from '#core/run-agent.js'
import { SlackNotifier } from '#core/http-notify-triggers/slack.js'
import type { InboundMessage, MessagingConnector, ThreadMessage } from '#core/messaging/connector.js'
import { clearSightings, discussionPrompt, firstSighting, handleInboundMessage, threadToMessages, type MessagingDeps } from '#core/messaging/engine.js'
import { findThread, recordThread } from '#core/messaging/threads.js'
import { createSlackConnector, parseSlackEvent } from '#core/messaging/connectors/slack/index.js'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'messaging-'))
  clearSightings()
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const callback = (event: Record<string, unknown>, eventId = 'Ev1') => JSON.stringify({ type: 'event_callback', event_id: eventId, event })

describe('Slack connector', () => {
  it("reads Slack's URL check and a person's thread reply", () => {
    expect(parseSlackEvent(JSON.stringify({ type: 'url_verification', challenge: 'abc' }))).toEqual({ type: 'url_verification', challenge: 'abc' })
    expect(parseSlackEvent(callback({ type: 'message', user: 'U1', text: 'why?', ts: '2.0', thread_ts: '1.0', channel: 'C1' }))).toEqual({
      type: 'message',
      app: 'slack',
      eventId: 'Ev1',
      conversation: 'C1',
      user: 'U1',
      text: 'why?',
      ts: '2.0',
      threadTs: '1.0',
    })
  })

  it("ignores bots (the agent's own replies included), edits and other events", () => {
    expect(parseSlackEvent(callback({ type: 'message', bot_id: 'B1', user: 'U1', text: 'hi', ts: '2.0', thread_ts: '1.0', channel: 'C1' })).type).toBe('ignore')
    expect(parseSlackEvent(callback({ type: 'message', subtype: 'message_changed', channel: 'C1', ts: '2.0' })).type).toBe('ignore')
    expect(parseSlackEvent(callback({ type: 'reaction_added', user: 'U1' })).type).toBe('ignore')
    expect(parseSlackEvent('not json').type).toBe('ignore')
  })

  it('treats a thread starter as a top-level message', () => {
    expect(parseSlackEvent(callback({ type: 'message', user: 'U1', text: 'hi', ts: '1.0', thread_ts: '1.0', channel: 'C1' }))).not.toHaveProperty('threadTs')
  })

  it('reads a thread back and replies in it', async () => {
    const fetchMock = vi.fn(async (url: string | URL) =>
      String(url).includes('conversations.replies')
        ? new Response(JSON.stringify({ ok: true, messages: [{ bot_id: 'B1', text: 'Approval requested', ts: '1.0' }, { user: 'U1', text: 'why?', ts: '2.0' }] }))
        : new Response(JSON.stringify({ ok: true })),
    )
    vi.stubGlobal('fetch', fetchMock)
    const slack = createSlackConnector('xoxb')
    expect(await slack.fetchThread('C1', '1.0')).toEqual([
      { user: undefined, fromBot: true, text: 'Approval requested', ts: '1.0' },
      { user: 'U1', fromBot: false, text: 'why?', ts: '2.0' },
    ])
    await slack.postInThread('C1', '1.0', 'Because.')
    const [, init] = fetchMock.mock.calls[1] as unknown as [string, RequestInit]
    expect(JSON.parse(String(init.body))).toEqual({ channel: 'C1', thread_ts: '1.0', text: 'Because.' })
    expect(slack.mention('U1')).toBe('<@U1>')
  })
})

describe('firstSighting', () => {
  it('handles a redelivery, or the same message as both message and app_mention, once', () => {
    expect(firstSighting({ app: 'slack', eventId: 'Ev1', conversation: 'C1', ts: '2.0' })).toBe(true)
    expect(firstSighting({ app: 'slack', eventId: 'Ev1', conversation: 'C1', ts: '2.0' })).toBe(false)
    expect(firstSighting({ app: 'slack', eventId: 'Ev2', conversation: 'C1', ts: '2.0' })).toBe(false)
    expect(firstSighting({ app: 'slack', eventId: 'Ev3', conversation: 'C1', ts: '3.0' })).toBe(true)
    expect(firstSighting({ app: 'telegram', eventId: 'Ev1', conversation: 'C1', ts: '2.0' })).toBe(true)
  })
})

describe('thread map', () => {
  it('finds the request a thread belongs to, per app, and nothing for other threads', () => {
    recordThread(dir, { app: 'slack', conversation: 'C1', ts: '1.0', pendingId: 'p1', kind: 'approval' })
    recordThread(dir, { app: 'slack', conversation: 'C1', ts: '5.0', pendingId: 'p2', kind: 'question' })
    expect(findThread(dir, 'slack', 'C1', '1.0')).toMatchObject({ pendingId: 'p1', kind: 'approval' })
    expect(findThread(dir, 'slack', 'C1', '5.0')).toMatchObject({ pendingId: 'p2', kind: 'question' })
    expect(findThread(dir, 'telegram', 'C1', '1.0')).toBeUndefined()
    expect(findThread(dir, 'slack', 'C2', '1.0')).toBeUndefined()
    expect(findThread(join(dir, 'missing'), 'slack', 'C1', '1.0')).toBeUndefined()
  })

  it('SlackNotifier reports where each request landed, from the ts Slack answers with', async () => {
    const posted: unknown[] = []
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true, channel: 'C9', ts: '111.222' }))))
    const notifier = new SlackNotifier({ botToken: 'xoxb', channelId: 'C9', onThread: (p) => posted.push(p) })
    const { pendingId } = notifier.requestDurableApproval('refund', { amount: 60 }, { tenant: 't', environment: 'e', agent: 'a' } as never, 'money')
    await vi.waitFor(() => expect(posted).toEqual([{ channel: 'C9', ts: '111.222', pendingId, kind: 'approval' }]))
  })
})

describe('threadToMessages', () => {
  const mention = (u: string) => `<@${u}>`
  it("keeps people's messages as user and the agent's as assistant, without the request itself", () => {
    const thread: ThreadMessage[] = [
      { fromBot: true, text: 'Approval requested', ts: '1.0' },
      { user: 'U1', fromBot: false, text: 'were both charges captured?', ts: '2.0' },
      { fromBot: true, text: 'Yes, both.', ts: '3.0' },
    ]
    expect(threadToMessages(thread, '1.0', { user: 'U2', text: 'ok, and the date?', ts: '4.0' }, mention)).toEqual([
      { role: 'user', content: '<@U1>: were both charges captured?' },
      { role: 'assistant', content: 'Yes, both.' },
      { role: 'user', content: '<@U2>: ok, and the date?' },
    ])
  })

  it("returns nothing when the last word is already the agent's", () => {
    const thread: ThreadMessage[] = [
      { user: 'U1', fromBot: false, text: 'hi', ts: '2.0' },
      { fromBot: true, text: 'hello', ts: '3.0' },
    ]
    expect(threadToMessages(thread, '1.0', { user: 'U1', text: 'hi', ts: '2.0' }, mention)).toEqual([])
  })
})

describe('discussionPrompt', () => {
  it('describes the pending call and says the thread cannot decide', () => {
    const prompt = discussionPrompt('support', 'Be kind.', 'Slack', 'approval', { tool: 'stripe_refund', args: { amount: 60 }, reason: 'moves money' }, [
      { role: 'user', content: 'refund my duplicate charge' },
    ])
    expect(prompt).toContain('`stripe_refund`')
    expect(prompt).toContain('{"amount":60}')
    expect(prompt).toContain('refund my duplicate charge')
    expect(prompt).toContain('Slack thread')
    expect(prompt).toContain("can't approve, deny or edit")
    expect(prompt).toContain('Be kind.')
  })
})

describe('handleInboundMessage', () => {
  const checkpoint: TurnCheckpoint = {
    id: 'c1',
    sessionId: 's1',
    agent: 'support',
    tenant: 'default',
    resultsSoFar: [],
    outstanding: { p1: { toolUseId: 'tu1', tool: 'stripe_refund', args: { amount: 60 }, reason: 'moves money' } },
    closed: false,
  }

  function setup(over: Partial<MessagingDeps> = {}) {
    const posts: string[] = []
    const calls: { messages: Message[]; system: string; tools: unknown[] }[] = []
    const modelCall: ModelCall = async (messages, system, tools) => {
      calls.push({ messages, system, tools })
      return { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Both charges were captured.' }] }
    }
    const connector: MessagingConnector = {
      app: 'chat',
      name: 'Chat',
      mention: (u) => `@${u}`,
      fetchThread: async () => [{ fromBot: true, text: 'Approval requested', ts: '1.0' }],
      postInThread: async (conversation, threadTs, text) => void posts.push(`${conversation}/${threadTs}: ${text}`),
    }
    const deps: MessagingDeps = {
      agentName: 'support',
      agentDir: dir,
      systemPrompt: 'Be kind.',
      connector,
      createModelCall: () => modelCall,
      getCheckpoint: async (id) => (id === 'p1' ? checkpoint : undefined),
      getHistory: async () => [{ role: 'user', content: 'I was charged twice' }],
      ...over,
    }
    return { deps, posts, calls }
  }
  const reply = (text = 'were both captured?', threadTs: string | undefined = '1.0'): InboundMessage => ({
    app: 'chat',
    eventId: `E-${text}`,
    conversation: 'C1',
    user: 'U1',
    text,
    ts: '2.0',
    ...(threadTs ? { threadTs } : {}),
  })
  const mapRequest = (pendingId = 'p1') => recordThread(dir, { app: 'chat', conversation: 'C1', ts: '1.0', pendingId, kind: 'approval' })

  it("answers a reply in a request's thread with no tools, from the pending call and the run", async () => {
    mapRequest()
    const { deps, posts, calls } = setup()
    await handleInboundMessage(reply(), deps)
    expect(posts).toEqual(['C1/1.0: Both charges were captured.'])
    expect(calls).toHaveLength(1)
    expect(calls[0].tools).toEqual([])
    expect(calls[0].messages).toEqual([{ role: 'user', content: '@U1: were both captured?' }])
    expect(calls[0].system).toContain('I was charged twice')
    expect(calls[0].system).toContain('Chat thread')
  })

  it('leaves other threads, other apps and top-level messages alone, without building a model client', async () => {
    recordThread(dir, { app: 'slack', conversation: 'C1', ts: '1.0', pendingId: 'p1', kind: 'approval' })
    const createModelCall = vi.fn()
    const { deps, posts } = setup({ createModelCall })
    await handleInboundMessage(reply('hi', '9.0'), deps)
    await handleInboundMessage(reply('hi there'), deps)
    await handleInboundMessage(reply('top', undefined), deps)
    expect(posts).toEqual([])
    expect(createModelCall).not.toHaveBeenCalled()
  })

  it('says so when the request was already decided', async () => {
    mapRequest('gone')
    const { deps, posts, calls } = setup()
    await handleInboundMessage(reply(), deps)
    expect(posts[0]).toMatch(/already been decided/)
    expect(calls).toEqual([])
  })

  it('on the free plan, says once that conversations need Pro and never calls the model', async () => {
    mapRequest()
    const { deps, posts, calls } = setup({ plan: 'free' })
    await handleInboundMessage(reply(), deps)
    await handleInboundMessage(reply('again?'), deps)
    expect(posts).toHaveLength(1)
    expect(posts[0]).toMatch(/in Chat needs LoopEngine Pro/)
    expect(calls).toEqual([])
  })

  it('points back to the buttons when the model call fails', async () => {
    mapRequest()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { deps, posts } = setup({ createModelCall: () => async () => Promise.reject(new Error('down')) })
    await handleInboundMessage(reply(), deps)
    expect(posts[0]).toMatch(/buttons and the decision link/)
  })
})
