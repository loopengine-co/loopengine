import { createHmac } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { callbackSecret, checkCallbackUrl, deliverCallback, isPrivateAddress, runCallbackPayload, signCallback } from '#core/run-callbacks.js'
import { FileRunStore, WorkflowRunner, getRun, setRunStore, type WorkflowRun } from '#core/workflow-runs.js'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'loopengine-callbacks-'))
  process.env.LOOPENGINE_SCHEDULER_DIR = dir
  process.env.LOOPENGINE_CALLBACK_SECRET = 'test-secret'
  setRunStore(new FileRunStore(dir))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
  delete process.env.LOOPENGINE_SCHEDULER_DIR
  delete process.env.LOOPENGINE_CALLBACK_SECRET
  delete process.env.LOOPENGINE_ALLOW_LOCAL_CALLBACKS
})

describe('callback URLs', () => {
  it('must be https on a public address', () => {
    expect(checkCallbackUrl(' https://ops.example.com/hooks/runs ')).toBe('https://ops.example.com/hooks/runs')
    expect(() => checkCallbackUrl('http://ops.example.com/hooks')).toThrow(/must use https/)
    for (const url of ['https://localhost/x', 'https://127.0.0.1/x', 'https://10.0.0.5/x', 'https://169.254.169.254/latest', 'https://[::1]/x', 'https://db.internal/x']) {
      expect(() => checkCallbackUrl(url)).toThrow(/public address/)
    }
    expect(() => checkCallbackUrl('https://user:pass@ops.example.com/x')).toThrow(/username or password/)
    expect(() => checkCallbackUrl('not a url')).toThrow(/isn't a URL/)
    expect(() => checkCallbackUrl(42)).toThrow(/must be a URL/)
  })

  it('may be local over http when allowed, for development', () => {
    process.env.LOOPENGINE_ALLOW_LOCAL_CALLBACKS = '1'
    expect(checkCallbackUrl('http://localhost:3000/runs')).toBe('http://localhost:3000/runs')
  })

  it('tell private addresses from public ones', () => {
    expect(['10.1.2.3', '172.20.0.1', '192.168.1.1', '127.0.0.1', '169.254.169.254', '100.64.0.1', '::1', 'fd00::1', 'fe80::1', '::ffff:10.0.0.1'].every(isPrivateAddress)).toBe(true)
    expect(['8.8.8.8', '172.32.0.1', '2606:4700::1111'].some(isPrivateAddress)).toBe(false)
  })
})

describe('callback signatures', () => {
  it('sign the timestamp and body with the secret, so a receiver can check them', () => {
    const body = JSON.stringify({ event: 'run.done' })
    const header = signCallback(body, 1_700_000_000)
    const [t, v1] = header.split(',').map((part) => part.split('=')[1])
    expect(t).toBe('1700000000')
    expect(v1).toBe(createHmac('sha256', 'test-secret').update(`${t}.${body}`).digest('hex'))
  })

  it('use a secret made once and kept, when none is set', () => {
    delete process.env.LOOPENGINE_CALLBACK_SECRET
    const first = callbackSecret()
    expect(first).toMatch(/^[0-9a-f]{64}$/)
    expect(callbackSecret()).toBe(first)
    expect(readFileSync(join(dir, 'callback-secret'), 'utf8').trim()).toBe(first)
  })
})

describe('delivering a callback', () => {
  beforeEach(() => { process.env.LOOPENGINE_ALLOW_LOCAL_CALLBACKS = '1' })

  it('posts the payload, signed, with the event', async () => {
    const fetchMock = vi.fn(async () => new Response('ok', { status: 200 }))
    const delivery = await deliverCallback('http://localhost:9/runs', 'run.done', { event: 'run.done', run: { run_id: 'r1' } }, { fetch: fetchMock as unknown as typeof fetch, backoffMs: [] })

    expect(delivery).toMatchObject({ event: 'run.done', delivered: true, attempts: 1, status_code: 200 })
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit & { headers: Record<string, string> }]
    expect(url).toBe('http://localhost:9/runs')
    expect(JSON.parse(String(init.body))).toEqual({ event: 'run.done', run: { run_id: 'r1' } })
    expect(init.headers['x-loopengine-event']).toBe('run.done')
    const t = init.headers['x-loopengine-signature'].match(/^t=(\d+),/)![1]
    expect(init.headers['x-loopengine-signature']).toBe(signCallback(String(init.body), Number(t)))
  })

  it('retries a failed attempt, and records the last one when all fail', async () => {
    const flaky = vi.fn().mockResolvedValueOnce(new Response('', { status: 500 })).mockRejectedValueOnce(new Error('connection reset')).mockResolvedValueOnce(new Response(null, { status: 204 }))
    expect(await deliverCallback('http://localhost:9/runs', 'run.failed', {}, { fetch: flaky as unknown as typeof fetch, backoffMs: [0, 0] })).toMatchObject({ delivered: true, attempts: 3, status_code: 204 })

    const down = vi.fn(async () => new Response('', { status: 503 }))
    expect(await deliverCallback('http://localhost:9/runs', 'run.failed', {}, { fetch: down as unknown as typeof fetch, backoffMs: [0, 0] })).toMatchObject({ delivered: false, attempts: 3, status_code: 503, error: 'It answered 503.' })
  })

  it('refuses a name that leads to a private address', async () => {
    delete process.env.LOOPENGINE_ALLOW_LOCAL_CALLBACKS
    const fetchMock = vi.fn()
    expect(await deliverCallback('https://localhost/runs', 'run.done', {}, { fetch: fetchMock as unknown as typeof fetch, backoffMs: [] })).toMatchObject({ delivered: false, error: 'The callback address leads to a private network.' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('carry the run without its session, first message or past deliveries', () => {
    const run = { run_id: 'r1', status: 'done', result: 'ok', session_id: 's', message: 'long', callbacks: [] }
    expect(runCallbackPayload('run.done', run)).toEqual({ event: 'run.done', run: { run_id: 'r1', status: 'done', result: 'ok' } })
  })
})

describe('a run reporting its changes', () => {
  it('keeps notify and callback_url, and is reported when it pauses and when it ends', async () => {
    const seen: [string, boolean | undefined, string | undefined][] = []
    const onChange = (run: WorkflowRun) => void seen.push([run.status, run.notify, run.callback_url])
    const runner = new WorkflowRunner({ execute: async () => ({ kind: 'pending', pendingIds: ['p1'] }), onChange })
    const run = await runner.start({ agent: 'cs', workflow_id: 'refund-check', source: 'api', message: 'x', notify: true, callback_url: 'https://ops.example.com/runs' })
    await runner.idle()
    await runner.settleFromResume(run.session_id, { text: 'Refunded.' })
    await new Promise((r) => setTimeout(r, 10))

    expect(seen).toEqual([['awaiting_approval', true, 'https://ops.example.com/runs'], ['done', true, 'https://ops.example.com/runs']])
    expect(await getRun('cs', run.run_id)).toMatchObject({ notify: true, callback_url: 'https://ops.example.com/runs' })
    expect(existsSync(join(dir, 'runs'))).toBe(true)
  })
})
