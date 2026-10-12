import { createHmac } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WebhookNotifier, postLifecycleWebhook, sendTestWebhook } from '#core/http-notify-triggers/webhook.js'
import { clearDeliveries, listDeliveries } from '#core/notifier-deliveries.js'

function verify(rawBody: string, signatureHeader: string, signingSecret: string): boolean {
  const expected = `sha256=${createHmac('sha256', signingSecret).update(rawBody).digest('hex')}`
  return expected === signatureHeader
}

describe('WebhookNotifier', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('requestDurableApproval posts a signed X-Actauth-Signature payload and returns a pendingId immediately', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const webhook = new WebhookNotifier({ webhookUrl: 'https://example.com/hook', signingSecret: 'shh' })

    const { pendingId } = webhook.requestDurableApproval(
      'issue_refund',
      { amount: 50 },
      { tenant: 'acme', environment: 'production', agent: 'support' },
      'ask rule',
    )

    expect(typeof pendingId).toBe('string')
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://example.com/hook')
    const body = init?.body as string
    const headers = init?.headers as Record<string, string>
    expect(verify(body, headers['X-Actauth-Signature'], 'shh')).toBe(true)
    expect(JSON.parse(body)).toMatchObject({ pendingId, tool: 'issue_refund', args: { amount: 50 }, reason: 'ask rule' })
  })

  it('notifyPendingQuestion posts a signed X-Askuser-Signature payload and returns a pendingId immediately', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const webhook = new WebhookNotifier({ webhookUrl: 'https://example.com/hook', signingSecret: 'shh' })

    const { pendingId } = webhook.notifyPendingQuestion('Which warehouse?', ['east', 'west'], 'support', 'session-1')

    expect(typeof pendingId).toBe('string')
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const [, init] = fetchMock.mock.calls[0]
    const body = init?.body as string
    const headers = init?.headers as Record<string, string>
    expect(verify(body, headers['X-Askuser-Signature'], 'shh')).toBe(true)
    expect(JSON.parse(body)).toMatchObject({ pendingId, question: 'Which warehouse?', options: ['east', 'west'], agent: 'support', sessionId: 'session-1' })
  })

  it('retries a failed delivery, then logs rather than throws once every attempt fails', async () => {
    const fetchMock = vi.fn(async () => Promise.reject(new Error('network down')))
    vi.stubGlobal('fetch', fetchMock)
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const webhook = new WebhookNotifier({ webhookUrl: 'https://example.com/hook', signingSecret: 'shh', retryDelaysMs: [0, 0] })

    const { pendingId } = webhook.requestDurableApproval('t', {}, { tenant: 'acme', environment: 'production', agent: 'a' }, 'r')

    await vi.waitFor(() => expect(consoleError).toHaveBeenCalledWith(expect.stringContaining(`failed after 3 attempts (approval ${pendingId})`)))
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('treats a non-2xx answer as a failure and stops retrying once one succeeds, recording each attempt', async () => {
    clearDeliveries()
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(null, { status: 503 })).mockResolvedValueOnce(new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const webhook = new WebhookNotifier({ webhookUrl: 'https://example.com/hook', signingSecret: 'shh', retryDelaysMs: [0, 0, 0] })

    const { pendingId } = webhook.requestDurableApproval('t', {}, { tenant: 'acme', environment: 'production', agent: 'retry-agent' }, 'r')

    await vi.waitFor(() => expect(listDeliveries('retry-agent')).toHaveLength(2))
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(listDeliveries('retry-agent')).toMatchObject([
      { attempt: 2, ok: true, status: 200, kind: 'approval', pendingId },
      { attempt: 1, ok: false, status: 503, error: 'HTTP 503' },
    ])
  })

  it('tells the receiver where to send the decision back, with a full URL once LOOPENGINE_PUBLIC_URL is set', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const webhook = new WebhookNotifier({ webhookUrl: 'https://example.com/hook', signingSecret: 'shh' })

    const { pendingId: relativeId } = webhook.requestDurableApproval('t', {}, { tenant: 'acme', environment: 'production', agent: 'support' }, 'r')
    vi.stubEnv('LOOPENGINE_PUBLIC_URL', 'https://acme.loopengine.app/')
    const { pendingId: questionId } = webhook.notifyPendingQuestion('Which?', undefined, 'support', 's-1')
    vi.unstubAllEnvs()

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    const approval = JSON.parse(fetchMock.mock.calls[0][1]?.body as string)
    const question = JSON.parse(fetchMock.mock.calls[1][1]?.body as string)
    expect(approval).toMatchObject({ kind: 'approval', agent: 'support', resolvePath: `/pending-approvals/${relativeId}/resolve` })
    expect(approval.resolveUrl).toBeUndefined()
    expect(question).toMatchObject({ kind: 'question', answerPath: `/pending-questions/${questionId}/answer`, answerUrl: `https://acme.loopengine.app/pending-questions/${questionId}/answer` })
  })
})

describe('WebhookNotifier decision links', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

  it('always carries a decidePath, and a full decideUrl from its publicUrl option (LOOPENGINE_PUBLIC_URL wins)', async () => {
    vi.stubEnv('LOOPENGINE_LINK_SECRET', 'test-secret')
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const webhook = new WebhookNotifier({ webhookUrl: 'https://example.com/hook', signingSecret: 'shh', publicUrl: 'https://from-file.example' })

    webhook.requestDurableApproval('t', {}, { tenant: 'acme', environment: 'production', agent: 'support' }, 'r')
    vi.stubEnv('LOOPENGINE_PUBLIC_URL', 'https://from-env.example')
    webhook.notifyPendingQuestion('Which?', undefined, 'support', 's-1')

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    const approval = JSON.parse(fetchMock.mock.calls[0][1]?.body as string)
    const question = JSON.parse(fetchMock.mock.calls[1][1]?.body as string)
    expect(approval.decidePath).toMatch(/^\/decide\//)
    expect(approval.decideUrl).toBe('https://from-file.example' + approval.decidePath)
    expect(question.decideUrl).toBe('https://from-env.example' + question.decidePath)
  })
})

describe('sendTestWebhook', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('sends one signed test event and reports the receiver\'s answer', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 401 }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await sendTestWebhook('https://example.com/hook', 'shh', 'support')

    expect(result).toEqual({ ok: false, status: 401, error: 'HTTP 401' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const init = fetchMock.mock.calls[0][1]
    expect(JSON.parse(init?.body as string)).toMatchObject({ event: 'test', agent: 'support' })
    expect(verify(init?.body as string, (init?.headers as Record<string, string>)['X-Lifecycle-Signature'], 'shh')).toBe(true)
  })
})

describe('postLifecycleWebhook', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('signs the payload with X-Lifecycle-Signature over the raw JSON body', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    postLifecycleWebhook('https://example.com/hook', 'shh', 'run_finish', { agent: 'test-agent', text: 'done' })

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://example.com/hook')
    const body = init?.body as string
    const headers = init?.headers as Record<string, string>
    expect(verify(body, headers['X-Lifecycle-Signature'], 'shh')).toBe(true)
    expect(JSON.parse(body)).toMatchObject({ event: 'run_finish', agent: 'test-agent', text: 'done' })
  })
})
