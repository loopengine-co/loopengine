import { createHmac } from 'node:crypto'
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { leverEventsSyncConfig, sendLeverEvents, sharesLeverStats, signLeverEvents } from '#web/lever-events-sync.js'

const CLOUD = { LOOPENGINE_TRUSTED_PROXY_SECRET: 'shh', LOOPENGINE_PUBLIC_URL: 'https://acme.loopengine.app' }
const config = { url: 'https://loopengine.co/api/workspace/lever-events', slug: 'acme', secret: 'shh' }

function project(events: number, settings?: Record<string, unknown>) {
  const dir = mkdtempSync(join(tmpdir(), 'loopengine-lever-events-'))
  mkdirSync(join(dir, 'goals'))
  if (settings) writeFileSync(join(dir, 'goals', 'about.json'), JSON.stringify(settings))
  for (let i = 0; i < events; i++) addEvent(dir, i)
  return dir
}
function addEvent(dir: string, i: number) {
  appendFileSync(join(dir, 'goals', 'lever-events.jsonl'), JSON.stringify({
    id: `e-${i}`, type: 'saved', at: '2026-11-14T00:00:00.000Z', goal: 'g-secret-goal', goalWorkflow: 'w-1', leverId: 'new-signups.answer-intent-posts', lever: 'answer intent posts', focus: 'new-signups', playbookVersion: 1, detail: {},
  }) + '\n')
}
const ok = () => new Response('{}', { status: 200 })

describe('sending lever events', () => {
  it('is for Cloud workspaces, on by default there, and follows the workspace’s choice', () => {
    expect(leverEventsSyncConfig({})).toEqual({ off: 'not a LoopEngine Cloud workspace' })
    expect(leverEventsSyncConfig(CLOUD)).toEqual(config)
    expect(sharesLeverStats(project(0), CLOUD)).toBe(true)
    expect(sharesLeverStats(project(0, { shareLeverStats: false }), CLOUD)).toBe(false)
    expect(sharesLeverStats(project(0), {})).toBe(false)
    expect(sharesLeverStats(project(0, { shareLeverStats: true }), { ...CLOUD, LOOPENGINE_LEVER_SHARING: 'off' })).toBe(false)
  })

  it('sends each event once, signed, with only the anonymous fields and the kind of business', async () => {
    const dir = project(3, { businessKind: 'saas', about: 'Our secret business' })
    const fetchMock = vi.fn(async () => ok())
    expect(await sendLeverEvents(dir, config, fetchMock as unknown as typeof fetch, CLOUD)).toEqual({ status: 'sent', events: 3 })
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, { body: string; headers: Record<string, string> }]
    const t = init.headers['x-loopengine-signature']!.match(/^t=(\d+),/)![1]
    expect(init.headers['x-loopengine-signature']).toBe(`t=${t},v1=${createHmac('sha256', 'shh').update(`${t}.${init.body}`).digest('hex')}`)
    expect(init.headers['x-loopengine-workspace']).toBe('acme')
    const sent = JSON.parse(init.body).events
    expect(sent[0]).toEqual({ id: 'e-0', type: 'saved', leverId: 'new-signups.answer-intent-posts', lever: 'answer intent posts', focus: 'new-signups', playbookVersion: 1, businessKind: 'saas', workflowRef: 'w-1', detail: {}, at: '2026-11-14T00:00:00.000Z' })
    expect(init.body).not.toContain('g-secret-goal')
    expect(init.body).not.toContain('secret business')
    // Nothing new: nothing sent. A new event: only that one.
    expect(await sendLeverEvents(dir, config, fetchMock as unknown as typeof fetch, CLOUD)).toEqual({ status: 'nothing' })
    addEvent(dir, 3)
    expect(await sendLeverEvents(dir, config, fetchMock as unknown as typeof fetch, CLOUD)).toEqual({ status: 'sent', events: 1 })
    expect(JSON.parse((fetchMock.mock.calls[1] as unknown as [string, { body: string }])[1].body).events.map((e: { id: string }) => e.id)).toEqual(['e-3'])
  })

  it('sends in batches of 500, and sends a failed batch again next time', async () => {
    const dir = project(1201)
    const failing = vi.fn(async () => new Response('', { status: 503 }))
    expect(await sendLeverEvents(dir, config, failing as unknown as typeof fetch, CLOUD)).toMatchObject({ status: 'failed', reason: expect.stringContaining('503') })
    const fetchMock = vi.fn(async () => ok())
    expect(await sendLeverEvents(dir, config, fetchMock as unknown as typeof fetch, CLOUD)).toEqual({ status: 'sent', events: 1201 })
    expect(fetchMock.mock.calls.map((c) => JSON.parse((c as unknown as [string, { body: string }])[1].body).events.length)).toEqual([500, 500, 201])
  })

  it('sends nothing while sharing is off, and keeps the events for later', async () => {
    const dir = project(2, { shareLeverStats: false })
    const fetchMock = vi.fn(async () => ok())
    expect(await sendLeverEvents(dir, config, fetchMock as unknown as typeof fetch, CLOUD)).toEqual({ status: 'off', reason: 'sharing is off' })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(readFileSync(join(dir, 'goals', 'lever-events.jsonl'), 'utf8').split('\n').filter(Boolean)).toHaveLength(2)
  })

  it('signs a body the way loopengine.co checks it', () => {
    expect(signLeverEvents('{}', 5, 'k')).toBe(`t=5,v1=${createHmac('sha256', 'k').update('5.{}').digest('hex')}`)
  })
})
