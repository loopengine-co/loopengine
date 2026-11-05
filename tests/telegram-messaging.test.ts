import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentConfig } from '#core/agent-config.js'
import { setAgentDir } from '#core/agent-env.js'
import { TelegramNotifier, type TelegramPosted } from '#core/http-notify-triggers/telegram.js'
import type { InboundMessage, MessagingConnector } from '#core/messaging/connector.js'
import { clearSightings } from '#core/messaging/engine.js'
import { handleJobMessage, isJobMessage, jobSessionId, settleJobThread, type JobDeps, type JobTurn } from '#core/messaging/jobs.js'
import { findThread } from '#core/messaging/threads.js'
import { parseSlackEvent } from '#core/messaging/connectors/slack/index.js'
import {
  createTelegramConnector,
  parseTelegramUpdate,
  readTelegramThread,
  recordTelegramMessage,
  telegramCallbackData,
  telegramEscape,
  telegramPeople,
  telegramRootOf,
  toTelegramHtml,
  verifyTelegramRequest,
} from '#core/messaging/connectors/telegram/index.js'
import { validateNotifierFile, writeNotifierFile } from '#core/notifier-file.js'
import { clickAllowed, conversationsOn, jobAllowed, jobsOn, setAgentApprovers } from '#web/notifier-admin.js'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'telegram-'))
  clearSightings()
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
  vi.unstubAllGlobals()
})

const PENDING = '4007448-6a5d-42d7-a814-23195bee15c8-0000'

function update(message: Record<string, unknown>, id = 1): string {
  return JSON.stringify({ update_id: id, message: { message_id: 10, from: { id: 42, first_name: 'Ada', username: 'ada' }, chat: { id: -100, type: 'supergroup' }, text: 'hi', ...message } })
}

describe('Telegram formatting', () => {
  it('turns Markdown into the HTML Telegram reads, escaping everything else', () => {
    expect(toTelegramHtml('**Done** with `a<b>` & [the page](https://x.example/p?a=1&b=2)')).toBe(
      '<b>Done</b> with <code>a&lt;b&gt;</code> &amp; <a href="https://x.example/p?a=1&amp;b=2">the page</a>',
    )
    expect(toTelegramHtml('```js\nif (a < b) {}\n```')).toBe('<pre>if (a &lt; b) {}\n</pre>')
    expect(toTelegramHtml('# Heading\n- one')).toBe('<b>Heading</b>\n• one')
  })

  it("leaves someone else's text plain: no tags, no formatting, no links", () => {
    expect(toTelegramHtml(`Why: ${telegramEscape('**<a href="x">click</a>** [y](https://evil.example)')}`)).toBe(
      'Why: **&lt;a href="x"&gt;click&lt;/a&gt;** [y](https://evil.example)',
    )
  })

  it("doesn't take snake_case for italics", () => {
    expect(toTelegramHtml('customer_id and _this_')).toBe('customer_id and <i>this</i>')
  })
})

describe('Telegram updates', () => {
  const rootOf = (_chat: string, id: string) => (id === '7' ? '5' : id)

  it('checks the secret token Telegram sends back', () => {
    expect(verifyTelegramRequest('s3cret', 's3cret')).toBe(true)
    expect(verifyTelegramRequest('nope', 's3cret')).toBe(false)
    expect(verifyTelegramRequest(undefined, 's3cret')).toBe(false)
  })

  it('reads a private chat as direct, and a reply as in the thread it belongs to', () => {
    expect(parseTelegramUpdate(update({ chat: { id: 42, type: 'private' }, text: 'refund order 12' }), { botUsername: 'le_bot', rootOf })).toEqual({
      type: 'message', app: 'telegram', eventId: '1', conversation: '42', user: '42', text: 'refund order 12', ts: '10', direct: true, userName: 'Ada', username: 'ada',
    })
    const reply = parseTelegramUpdate(update({ reply_to_message: { message_id: 7 } }), { botUsername: 'le_bot', rootOf })
    expect(reply).toMatchObject({ threadTs: '5' })
    expect(reply).not.toHaveProperty('direct')
  })

  it('spots a mention of the bot and takes it off the text', () => {
    const text = '@LE_bot refund order 12'
    const parsed = parseTelegramUpdate(update({ text, entities: [{ type: 'mention', offset: 0, length: 7 }] }), { botUsername: 'le_bot', rootOf })
    expect(parsed).toMatchObject({ mentioned: true, text: 'refund order 12' })
    const other = parseTelegramUpdate(update({ text: '@someone hi', entities: [{ type: 'mention', offset: 0, length: 8 }] }), { botUsername: 'le_bot', rootOf })
    expect(other).not.toHaveProperty('mentioned')
  })

  it("ignores bots, /start's command and anything that isn't text", () => {
    expect(parseTelegramUpdate(update({ from: { id: 9, is_bot: true } }), { rootOf }).type).toBe('ignore')
    expect(parseTelegramUpdate(update({ text: undefined, photo: [] }), { rootOf }).type).toBe('ignore')
    expect(parseTelegramUpdate('not json', { rootOf }).type).toBe('ignore')
    expect(parseTelegramUpdate(update({ chat: { id: 42, type: 'private' }, text: '/start' }), { rootOf })).toMatchObject({ text: '' })
  })

  it('reads a button click, and keeps callback data inside 64 bytes', () => {
    const id = '4007448a-6a5d-42d7-a814-23195bee15c8'
    for (const button of [{ type: 'decide', decision: 'approve' }, { type: 'answer_option', index: 19 }, { type: 'action', action: 'cancel_confirm' }] as const) {
      const data = telegramCallbackData(button, id)
      expect(Buffer.byteLength(data)).toBeLessThanOrEqual(64)
      const click = parseTelegramUpdate(JSON.stringify({ update_id: 2, callback_query: { id: 'cb1', from: { id: 42, username: 'ada' }, data, message: { message_id: 10, chat: { id: -100 } } } }), { rootOf })
      expect(click).toEqual({ type: 'click', callbackId: 'cb1', conversation: '-100', messageId: '10', user: '42', username: 'ada', button, pendingId: id })
    }
    expect(parseTelegramUpdate(JSON.stringify({ update_id: 3, callback_query: { id: 'cb', from: { id: 1 }, data: 'zz:x', message: { message_id: 1, chat: { id: 1 } } } }), { rootOf }).type).toBe('ignore')
  })
})

describe('the Telegram thread store', () => {
  it('keeps threads as reply chains, and the people seen', () => {
    recordTelegramMessage(dir, { chat: '-100', id: '5', root: '5', fromBot: true, text: 'Approval requested' })
    recordTelegramMessage(dir, { chat: '-100', id: '6', root: '5', user: '42', fromBot: false, text: 'why?', name: 'Ada', username: 'ada' })
    recordTelegramMessage(dir, { chat: '-100', id: '9', root: '9', user: '43', fromBot: false, text: 'other', name: 'Bo' })
    expect(telegramRootOf(dir, '-100', '6')).toBe('5')
    expect(telegramRootOf(dir, '-100', '77')).toBe('77')
    expect(readTelegramThread(dir, '-100', '5')).toEqual([
      { fromBot: true, text: 'Approval requested', ts: '5' },
      { user: '42', fromBot: false, text: 'why?', ts: '6' },
    ])
    expect(telegramPeople(dir)).toEqual([{ id: '43', name: 'Bo' }, { id: '42', name: 'Ada', username: 'ada' }])
  })
})

describe('the Telegram connector', () => {
  it('replies into the thread as HTML, with buttons, and records what it sent', async () => {
    const sent: Array<{ url: string; body: Record<string, any> }> = []
    let next = 100
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      sent.push({ url, body: JSON.parse(init.body as string) })
      return new Response(JSON.stringify({ ok: true, result: { message_id: next++ } }))
    })
    recordTelegramMessage(dir, { chat: '-100', id: '6', root: '5', user: '42', fromBot: false, text: 'why?', username: 'ada' })
    const telegram = createTelegramConnector('123:abc', dir)
    expect(telegram.mention('42')).toBe('@ada')
    await telegram.postInThread('-100', '5', 'It is **over** the limit')
    expect(sent[0].url).toBe('https://api.telegram.org/bot123:abc/sendMessage')
    expect(sent[0].body).toMatchObject({ chat_id: '-100', parse_mode: 'HTML', text: 'It is <b>over</b> the limit', reply_parameters: { message_id: 5, allow_sending_without_reply: true } })
    const id = await telegram.postChoice('-100', '5', 'Confirm?', [
      { action: 'confirm', label: 'Confirm', pendingId: PENDING },
      { action: 'deny', label: 'Deny', pendingId: PENDING },
    ])
    expect(id).toBe('101')
    expect(sent[1].body.reply_markup).toEqual({ inline_keyboard: [[{ text: 'Confirm', callback_data: `c:${PENDING}` }, { text: 'Deny', callback_data: `d:${PENDING}` }]] })
    expect((await telegram.fetchThread('-100', '5')).map((m) => m.text)).toEqual(['why?', 'It is **over** the limit', 'Confirm?'])
    await telegram.replaceMessage!('-100', '101', 'Confirmed.')
    expect(sent[2].url).toContain('/editMessageText')
    expect(sent[2].body).not.toHaveProperty('reply_markup')
  })
})

describe('TelegramNotifier', () => {
  it('adds Approve and Deny buttons and reports where the request landed', async () => {
    const sent: Array<Record<string, any>> = []
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      sent.push(JSON.parse(init.body as string))
      return new Response(JSON.stringify({ ok: true, result: { message_id: 55, chat: { id: -100 } } }))
    })
    const posted: TelegramPosted[] = []
    const telegram = new TelegramNotifier({ botToken: 't', chatId: '-100', buttons: true, replyHint: true, onPosted: (p) => posted.push(p) })
    const { pendingId } = telegram.requestDurableApproval('issue_refund', { amount: 40 }, { tenant: 't', environment: 'production', agent: 'a' }, 'over <limit>')
    await vi.waitFor(() => expect(posted).toHaveLength(1))
    expect(sent[0].reply_markup.inline_keyboard[0].map((b: { callback_data: string }) => b.callback_data)).toEqual([`a:${pendingId}`, `d:${pendingId}`])
    expect(sent[0].text).toContain('over &lt;limit&gt;')
    expect(sent[0].text).toContain('Reply to this message to ask about it.')
    expect(posted[0]).toMatchObject({ chat: '-100', messageId: '55', pendingId, kind: 'approval' })

    telegram.notifyPendingQuestion('Which plan?', ['Basic', 'Pro'], 'a', undefined, PENDING)
    await vi.waitFor(() => expect(posted).toHaveLength(2))
    expect(sent[1].reply_markup.inline_keyboard).toEqual([[{ text: 'Basic', callback_data: `q0:${PENDING}` }], [{ text: 'Pro', callback_data: `q1:${PENDING}` }]])
  })
})

describe('Slack DMs and mentions', () => {
  const callback = (event: Record<string, unknown>) => JSON.stringify({ type: 'event_callback', event_id: 'Ev1', event })
  it('marks a DM as direct and an app_mention as mentioned, without the mention', () => {
    expect(parseSlackEvent(callback({ type: 'message', channel_type: 'im', user: 'U1', text: 'hi', ts: '1.0', channel: 'D1' }))).toMatchObject({ direct: true })
    const mention = parseSlackEvent(callback({ type: 'app_mention', user: 'U1', text: '<@UBOT> refund order 12', ts: '1.0', channel: 'C1' }))
    expect(mention).toMatchObject({ mentioned: true, text: 'refund order 12' })
    expect(parseSlackEvent(callback({ type: 'message', channel_type: 'channel', user: 'U1', text: 'hi', ts: '1.0', channel: 'C1' }))).not.toHaveProperty('mentioned')
  })
})

describe('starting jobs from messages', () => {
  function fakeConnector(): MessagingConnector & { posts: Array<{ conversation: string; threadTs: string; text: string }> } {
    const posts: Array<{ conversation: string; threadTs: string; text: string }> = []
    return {
      app: 'slack', name: 'Slack', posts,
      mention: (u) => `<@${u}>`,
      escape: (t) => t,
      fetchThread: async () => [],
      postInThread: async (conversation, threadTs, text) => { posts.push({ conversation, threadTs, text }) },
      postChoice: async () => undefined,
    }
  }
  function deps(connector: MessagingConnector, turns: JobTurn[], seen: Array<{ sessionId: string; text: string }> = []): JobDeps {
    return {
      agentName: 'ops', agentDir: dir, connector,
      allowed: () => ({ allowed: true }),
      runTurn: async (sessionId, text) => { seen.push({ sessionId, text }); return turns.shift()! },
      decideLink: (id) => `https://le.example.com/decide/${id}`,
    }
  }
  const mention: InboundMessage = { app: 'slack', eventId: 'E1', conversation: 'C1', user: 'U1', text: 'refund order 12', ts: '1.0', mentioned: true }

  it('runs the agent on a mention and answers in its thread; a reply there continues the session', async () => {
    const connector = fakeConnector()
    const seen: Array<{ sessionId: string; text: string }> = []
    const d = deps(connector, [{ kind: 'done', text: 'Refunded.' }, { kind: 'done', text: 'It was $40.' }], seen)
    await handleJobMessage(mention, d)
    expect(connector.posts).toEqual([{ conversation: 'C1', threadTs: '1.0', text: 'Refunded.' }])
    const followUp: InboundMessage = { app: 'slack', eventId: 'E2', conversation: 'C1', user: 'U1', text: 'how much?', ts: '2.0', threadTs: '1.0' }
    expect(isJobMessage(dir, followUp)).toBe(true)
    await handleJobMessage(followUp, d)
    expect(seen.map((s) => s.sessionId)).toEqual(['slack-C1-1_0', 'slack-C1-1_0'])
    expect(connector.posts[1]).toEqual({ conversation: 'C1', threadTs: '1.0', text: 'It was $40.' })
    // A message in some other thread isn't a job.
    expect(isJobMessage(dir, { ...followUp, threadTs: '9.0' })).toBe(false)
  })

  it('keeps one session per DM', async () => {
    expect(jobSessionId({ app: 'telegram', conversation: '42', direct: true }, '10')).toBe('telegram-dm-42')
    const connector = fakeConnector()
    const seen: Array<{ sessionId: string; text: string }> = []
    const d = deps(connector, [{ kind: 'done', text: 'a' }, { kind: 'done', text: 'b' }], seen)
    await handleJobMessage({ ...mention, conversation: 'D1', direct: true, mentioned: undefined }, d)
    await handleJobMessage({ ...mention, conversation: 'D1', direct: true, mentioned: undefined, ts: '3.0' }, d)
    expect(seen.map((s) => s.sessionId)).toEqual(['slack-dm-D1', 'slack-dm-D1'])
    expect(connector.posts.map((p) => p.threadTs)).toEqual(['1.0', '3.0'])
  })

  it('says when a run waits for approval, links the thread to the request, and answers there once it resumes', async () => {
    const connector = fakeConnector()
    const d = deps(connector, [{ kind: 'pending', items: [{ pendingId: PENDING, kind: 'approval', tool: 'issue_refund' }] }])
    await handleJobMessage(mention, d)
    expect(connector.posts[0].text).toContain('This needs approval before it runs `issue_refund`.')
    expect(connector.posts[0].text).toContain(`[open the request](https://le.example.com/decide/${PENDING})`)
    expect(findThread(dir, 'slack', 'C1', '1.0')).toMatchObject({ pendingId: PENDING, kind: 'approval' })
    await settleJobThread(d, 'slack-C1-1_0', { kind: 'done', text: 'Refunded $40.' })
    expect(connector.posts[1]).toEqual({ conversation: 'C1', threadTs: '1.0', text: 'Refunded $40.' })
    // Another app's connector doesn't answer a Slack job.
    await settleJobThread({ ...d, connector: { ...connector, app: 'telegram' } }, 'slack-C1-1_0', { kind: 'done', text: 'x' })
    expect(connector.posts).toHaveLength(2)
  })

  it("refuses someone who can't give jobs, and the free plan", async () => {
    const connector = fakeConnector()
    const runTurn = vi.fn()
    await handleJobMessage(mention, { ...deps(connector, []), runTurn, allowed: () => ({ allowed: false, message: 'Only approvers can give me jobs here.' }) })
    await handleJobMessage(mention, { ...deps(connector, []), runTurn, plan: 'free' })
    expect(runTurn).not.toHaveBeenCalled()
    expect(connector.posts.map((p) => p.text)).toEqual(['Only approvers can give me jobs here.', 'Starting jobs from Slack needs LoopEngine Pro.'])
  })

  it('says so when the run fails', async () => {
    const connector = fakeConnector()
    await handleJobMessage(mention, { ...deps(connector, []), runTurn: async () => { throw new Error('model unavailable') } })
    expect(connector.posts[0].text).toBe("That didn't work: model unavailable")
  })
})

describe('Telegram settings', () => {
  function agent(): AgentConfig {
    const config: AgentConfig = { name: 'tg-agent', systemPrompt: 'x' }
    setAgentDir(config, dir)
    return config
  }

  it('takes numeric approver ids, conversations and jobs for Telegram', () => {
    const file = validateNotifierFile({ channel: 'telegram', events: ['approval'], chatId: '-100', conversations: false, jobs: true, approvers: [{ user: 123, name: 'Ada' }] })
    expect(file).toMatchObject({ conversations: false, jobs: true, approvers: [{ user: '123', name: 'Ada' }] })
    expect(() => validateNotifierFile({ channel: 'telegram', events: ['approval'], chatId: '-100', approvers: [{ user: 'U123' }] })).toThrow('Telegram user id')
    expect(validateNotifierFile({ channel: 'lark', events: ['approval'], appId: 'a', chatId: 'c', jobs: true })).not.toHaveProperty('jobs')
  })

  it('lets approvers give jobs anywhere, and with none, people in the agent’s own chat but not by DM', () => {
    const config = agent()
    writeNotifierFile(dir, { channel: 'telegram', events: ['approval'], chatId: '-100', jobs: true })
    expect(jobsOn(config, 'telegram')).toBe(true)
    expect(jobsOn(config, 'slack')).toBe(false)
    expect(conversationsOn(config, 'telegram')).toBe(true)
    expect(jobAllowed(config, 'telegram', { user: '42', conversation: '-100' }).allowed).toBe(true)
    expect(jobAllowed(config, 'telegram', { user: '42', conversation: '-200' }).allowed).toBe(false)
    expect(jobAllowed(config, 'telegram', { user: '42', conversation: '42', direct: true }).allowed).toBe(false)
    setAgentApprovers(config, [{ user: '42', name: 'Ada' }], 'telegram')
    expect(jobAllowed(config, 'telegram', { user: '42', conversation: '42', direct: true }).allowed).toBe(true)
    expect(jobAllowed(config, 'telegram', { user: '43', conversation: '-100' })).toEqual({ allowed: false, message: 'Only approvers can give me jobs here: Ada.' })
    expect(clickAllowed(config, 'telegram', '43').allowed).toBe(false)
    // Slack's approvers are its own.
    expect(clickAllowed(config, 'slack', '43').allowed).toBe(true)
  })
})
