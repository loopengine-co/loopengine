import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { lastAnchor, openAuditDb, recordEvent, setAuditDb, verifyEventChain } from '#core/audit-store.js'
import { anchorLatest, fetchAnchors, signAnchorRequest } from '#core/audit-anchor.js'

let dir: string
let db: DatabaseSync
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'loopengine-chain-'))
  db = openAuditDb(dir)!
  setAuditDb(db)
  for (const by of ['ana', 'ben', 'cy', 'dee']) recordEvent({ agent: 'cs', kind: 'decision', by, data: { tool: 'refund', approved: true } })
})
afterEach(() => {
  setAuditDb(undefined)
  db.close()
  rmSync(dir, { recursive: true, force: true })
})

describe('the audit hash chain', () => {
  it('checks out when nothing was touched', () => {
    expect(verifyEventChain()).toMatchObject({ ok: true, events: 4, last: { id: 4 } })
  })

  it('shows an event changed after it was recorded', () => {
    db.prepare("UPDATE events SET by = 'mallory' WHERE id = 2").run()
    expect(verifyEventChain()).toMatchObject({ ok: false, events: 1, broken: { id: 2, problem: 'changed' } })
  })

  it('shows an event removed from the middle', () => {
    db.prepare('DELETE FROM events WHERE id = 2').run()
    expect(verifyEventChain()).toMatchObject({ ok: false, broken: { id: 3, problem: 'missing-before' } })
  })

  it('shows the chain rewritten after an edit, or cut short, against its anchors', () => {
    const anchors = [{ eventId: 4, hash: verifyEventChain().last!.hash }]
    // Rewritten: the edit, then every hash after it recomputed.
    db.prepare("UPDATE events SET by = 'mallory', hash = NULL, prev = NULL WHERE id >= 2").run()
    db.close()
    db = openAuditDb(dir)!
    setAuditDb(db)
    expect(verifyEventChain()).toMatchObject({ ok: true })
    expect(verifyEventChain(anchors)).toMatchObject({ ok: false, broken: { id: 4, problem: 'anchor-differs' } })
    // Cut short: the latest events gone.
    db.prepare('DELETE FROM events WHERE id >= 3').run()
    expect(verifyEventChain(anchors)).toMatchObject({ ok: false, broken: { id: 4, problem: 'missing-after-anchor' } })
  })

  it('chains a log recorded before the chain existed', () => {
    // The events table as it was before the chain: no prev or hash.
    db.exec(`CREATE TABLE old_events (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, agent TEXT NOT NULL, workflow_id TEXT, run_id TEXT, kind TEXT NOT NULL, by TEXT, data TEXT NOT NULL);
      INSERT INTO old_events SELECT id, at, agent, workflow_id, run_id, kind, by, data FROM events; DROP TABLE events; ALTER TABLE old_events RENAME TO events;`)
    db.close()
    db = openAuditDb(dir)!
    setAuditDb(db)
    expect(verifyEventChain()).toMatchObject({ ok: true, events: 4 })
    recordEvent({ agent: 'cs', kind: 'answer', by: 'eve', data: { answer: 'yes' } })
    expect(verifyEventChain()).toMatchObject({ ok: true, events: 5 })
  })
})

describe('anchors', () => {
  it('keep the latest hash here off Cloud, once', async () => {
    expect(await anchorLatest({ off: 'not Cloud' })).toEqual({ status: 'kept-here', eventId: 4 })
    expect(await anchorLatest({ off: 'not Cloud' })).toEqual({ status: 'nothing-new' })
    expect(verifyEventChain()).toMatchObject({ ok: true, anchors: 1 })
  })

  it('go to loopengine.co signed, and come back for checking', async () => {
    const config = { url: 'https://cp.test/api/workspace/audit-anchors', slug: 'acme', secret: 's3cret' }
    const seen: { method: string; body: string; headers: Record<string, string> }[] = []
    const kept: { eventId: number; hash: string }[] = []
    const fakeFetch = (async (_url: string, init: RequestInit) => {
      const headers = init.headers as Record<string, string>
      seen.push({ method: init.method ?? 'GET', body: String(init.body ?? ''), headers })
      if (init.method === 'POST') {
        const b = JSON.parse(String(init.body))
        kept.push({ eventId: b.eventId, hash: b.hash })
        return new Response('{}', { status: 200 })
      }
      return new Response(JSON.stringify({ anchors: kept }), { status: 200 })
    }) as unknown as typeof fetch
    expect(await anchorLatest(config, fakeFetch)).toEqual({ status: 'sent', eventId: 4 })
    const t = Number(/t=(\d+)/.exec(seen[0].headers['x-loopengine-signature'])![1])
    expect(seen[0].headers['x-loopengine-signature']).toBe(signAnchorRequest(seen[0].body, t, 's3cret'))
    expect(lastAnchor()).toMatchObject({ eventId: 4, sentAt: expect.any(String) })
    const back = await fetchAnchors(config, fakeFetch)
    expect(back).toEqual({ anchors: [{ eventId: 4, hash: expect.any(String) }] })
    expect(verifyEventChain('anchors' in back ? back.anchors : [])).toMatchObject({ ok: true, anchors: 1 })
  })
})
