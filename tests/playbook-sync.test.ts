import { createHmac } from 'node:crypto'
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LEVERS, PLAYBOOK_VERSION, activePlaybook, leversFor, mergePlaybooks, setPlaybookProjectDir } from '#core/system-agents/goal-playbooks.js'
import { PLAYBOOK_PATH, playbookSyncConfig, readPlaybookCache, signPlaybookRequest, syncPlaybook } from '#core/playbook-sync.js'

const project = () => mkdtempSync(join(tmpdir(), 'loopengine-playbook-'))
const lever = (over: Record<string, unknown> = {}) => ({ ...LEVERS[0]!, ...over })
const respond = (status: number, body?: unknown, etag?: string) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers: etag ? { etag } : {} })

afterEach(() => setPlaybookProjectDir(undefined))

describe('where the playbook is fetched from', () => {
  it('is off outside LoopEngine Cloud, and signs as the workspace inside it', () => {
    expect(playbookSyncConfig({})).toEqual({ off: 'not a LoopEngine Cloud workspace' })
    expect(playbookSyncConfig({ LOOPENGINE_TRUSTED_PROXY_SECRET: 's' })).toMatchObject({ off: expect.stringContaining('LOOPENGINE_PUBLIC_URL') })
    expect(playbookSyncConfig({ LOOPENGINE_TRUSTED_PROXY_SECRET: 's', LOOPENGINE_PUBLIC_URL: 'https://everymarket.loopengine.app' }))
      .toEqual({ url: 'https://loopengine.co/api/workspace/playbook', slug: 'everymarket', secret: 's' })
    expect(playbookSyncConfig({ LOOPENGINE_PLAYBOOK_URL: 'https://example.com/pb.json' })).toEqual({ url: 'https://example.com/pb.json' })
    expect(playbookSyncConfig({ LOOPENGINE_PLAYBOOK_SYNC: 'off', LOOPENGINE_PLAYBOOK_URL: 'https://x' })).toMatchObject({ off: expect.any(String) })
  })

  it('signs the request line with the workspace secret, like its run reports', () => {
    expect(signPlaybookRequest(100, 'secret')).toBe(`t=100,v1=${createHmac('sha256', 'secret').update(`100.GET ${PLAYBOOK_PATH}`).digest('hex')}`)
  })
})

describe('fetching the playbook', () => {
  const config = { url: 'https://loopengine.co/api/workspace/playbook', slug: 'acme', secret: 'shh' }

  it('caches a new playbook, then asks with its version and keeps it when unchanged', async () => {
    const dir = project()
    const fetchMock = vi.fn(async () => respond(200, { version: 2, levers: [lever({ name: 'Answer people (v2)' })], retired: ['new-signups.creator-outreach'] }, '"pb-2"'))
    expect(await syncPlaybook(dir, config, fetchMock as unknown as typeof fetch, 1_000_000)).toEqual({ status: 'updated', version: 2, levers: 1 })
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, { headers: Record<string, string> }]
    expect(init.headers['x-loopengine-workspace']).toBe('acme')
    expect(init.headers['x-loopengine-signature']).toBe(signPlaybookRequest(1000, 'shh'))
    expect(readPlaybookCache(dir)).toMatchObject({ etag: '"pb-2"', version: 2, retired: ['new-signups.creator-outreach'] })

    const again = vi.fn(async () => respond(304))
    expect(await syncPlaybook(dir, config, again as unknown as typeof fetch)).toEqual({ status: 'unchanged' })
    expect((again.mock.calls[0] as unknown as [string, { headers: Record<string, string> }])[1].headers['if-none-match']).toBe('"pb-2"')
    expect(readPlaybookCache(dir)?.version).toBe(2)
  })

  it('keeps the last good copy when the server fails or sends a bad playbook', async () => {
    const dir = project()
    await syncPlaybook(dir, config, (async () => respond(200, { version: 2, levers: [lever()] }, '"pb-2"')) as unknown as typeof fetch)
    expect(await syncPlaybook(dir, config, (async () => respond(401, { error: 'no' })) as unknown as typeof fetch)).toMatchObject({ status: 'kept', reason: expect.stringContaining('401') })
    expect(await syncPlaybook(dir, config, (async () => respond(200, { version: 3, levers: [lever({ template: '' })] })) as unknown as typeof fetch)).toMatchObject({ status: 'kept', reason: expect.stringContaining('"template"') })
    expect(await syncPlaybook(dir, config, (async () => { throw new Error('offline') }) as unknown as typeof fetch)).toMatchObject({ status: 'kept', reason: expect.stringContaining('offline') })
    expect(readPlaybookCache(dir)?.version).toBe(2)
  })
})

describe('the playbook in use', () => {
  it('merges by id: fetched levers replace and add, retired ones go', () => {
    const merged = mergePlaybooks(LEVERS, {
      levers: [lever({ name: 'Reworded' }), lever({ id: 'new-signups.app-marketplaces', name: 'App marketplaces' })],
      retired: ['new-signups.creator-outreach'],
    })
    expect(merged.find((l) => l.id === 'new-signups.answer-intent-posts')?.name).toBe('Reworded')
    expect(merged.some((l) => l.id === 'new-signups.app-marketplaces')).toBe(true)
    expect(merged.some((l) => l.id === 'new-signups.creator-outreach')).toBe(false)
    expect(merged).toHaveLength(LEVERS.length)
  })

  it('uses the fetched playbook from the project, the bundled one without it, or when it is broken', () => {
    const dir = project()
    setPlaybookProjectDir(dir)
    expect(activePlaybook()).toMatchObject({ version: PLAYBOOK_VERSION, levers: LEVERS })
    mkdirSync(join(dir, '.loopengine'), { recursive: true })
    writeFileSync(join(dir, '.loopengine', 'playbook-cache.json'), JSON.stringify({ etag: 'x', version: 5, fetchedAt: '', levers: [lever({ name: 'From loopengine.co' })], retired: [] }))
    expect(activePlaybook().version).toBe(5)
    expect(leversFor('new-signups')[0]!.name).toBe('From loopengine.co')
    writeFileSync(join(dir, '.loopengine', 'playbook-cache.json'), '{ not json')
    expect(activePlaybook().version).toBe(PLAYBOOK_VERSION)
  })
})
