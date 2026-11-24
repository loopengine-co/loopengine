import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { latestEventHash, openAuditDb, recordEvent, setAuditDb, verifyEventChain } from '#core/audit-store.js'

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

function reopen(): void {
  db.close()
  db = openAuditDb(dir)!
  setAuditDb(db)
}

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

  it("doesn't catch a chain rewritten after an edit, but its latest hash then differs from one written down before", () => {
    const before = latestEventHash()!
    db.prepare("UPDATE events SET by = 'mallory', hash = NULL, prev = NULL WHERE id >= 2").run()
    reopen()
    expect(verifyEventChain()).toMatchObject({ ok: true })
    expect(latestEventHash()).toMatchObject({ id: before.id })
    expect(latestEventHash()!.hash).not.toBe(before.hash)
  })

  it('chains a log recorded before the chain existed', () => {
    // The events table as it was before the chain: no prev or hash.
    db.exec(`CREATE TABLE old_events (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, agent TEXT NOT NULL, workflow_id TEXT, run_id TEXT, kind TEXT NOT NULL, by TEXT, data TEXT NOT NULL);
      INSERT INTO old_events SELECT id, at, agent, workflow_id, run_id, kind, by, data FROM events; DROP TABLE events; ALTER TABLE old_events RENAME TO events;`)
    reopen()
    expect(verifyEventChain()).toMatchObject({ ok: true, events: 4 })
    recordEvent({ agent: 'cs', kind: 'answer', by: 'eve', data: { answer: 'yes' } })
    expect(verifyEventChain()).toMatchObject({ ok: true, events: 5 })
  })
})
