import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openAuditDb, recordEvent, listEvents, eventPeople, setAuditDb } from '#core/audit-store.js'
import { SqliteRunStore, searchRuns, setRunStore, type WorkflowRun } from '#core/workflow-runs.js'
import { caseRow, eventText, eventsCsv } from '#web/audit-admin.js'

let dir: string
let db: DatabaseSync
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'loopengine-audit-page-'))
  db = openAuditDb(dir)!
  setAuditDb(db)
  setRunStore(new SqliteRunStore(db))
})
afterEach(() => {
  setAuditDb(undefined)
  db.close()
  rmSync(dir, { recursive: true, force: true })
})

function run(id: string, over: Partial<WorkflowRun> = {}): WorkflowRun {
  return { run_id: id, agent: 'cs', workflow_id: 'refunds', source: 'api', status: 'done', started_at: `2026-11-${id.padStart(2, '0')}T10:00:00.000Z`, message: 'm', session_id: `s${id}`, ...over }
}

describe('the Audit page', () => {
  it('searches every kept case by text, person, status and time, newest first', async () => {
    const store = new SqliteRunStore(db)
    await store.put(run('1', { params: { order: 'EM20-1' }, result: 'Refunded $84.' }))
    await store.put(run('2', { status: 'error', error: 'Stripe timed out', decisions: [{ tool: 'refund', approved: false, at: 'x', by: 'ana@shop.com', reason: 'Already refunded' }] }))
    await store.put(run('3', { agent: 'sales', answers: [{ question: 'q', answer: 'a', at: 'x', by: 'ben@shop.com' }] }))
    expect((await searchRuns({})).map((r) => r.run_id)).toEqual(['3', '2', '1'])
    expect((await searchRuns({ q: 'em20-1' })).map((r) => r.run_id)).toEqual(['1'])
    expect((await searchRuns({ by: 'ana@shop.com' })).map((r) => r.run_id)).toEqual(['2'])
    expect((await searchRuns({ by: 'ben@shop.com' })).map((r) => r.run_id)).toEqual(['3'])
    expect((await searchRuns({ status: 'error', agent: 'cs' })).map((r) => r.run_id)).toEqual(['2'])
    expect((await searchRuns({ before: '2026-11-03T00:00:00.000Z', limit: 1 })).map((r) => r.run_id)).toEqual(['2'])
    expect((await searchRuns({ q: '100%' })).map((r) => r.run_id)).toEqual([])
    expect(caseRow(run('2', { decisions: [{ tool: 'refund', approved: false, at: 'x', by: 'ana@shop.com' }], status: 'error', error: 'Stripe timed out', versions: { brief: 3 } }), 'Refunds'))
      .toMatchObject({ workflowTitle: 'Refunds', status: 'error', workflowVersion: 3, people: ['ana@shop.com'], outcome: 'Stripe timed out' })
  })

  it('lists the log by person and text, and exports it as CSV safe to open in a spreadsheet', () => {
    recordEvent({ agent: '', kind: 'change', by: 'evany@shop.com', data: { label: 'Changed shared policies', path: '/config/policies' } })
    recordEvent({ agent: 'cs', workflow_id: 'refunds', run_id: 'r1', kind: 'decision', by: 'ana@shop.com', data: { tool: 'refund', approved: false, reason: '=Already, "refunded"' } })
    expect(eventPeople()).toEqual(['ana@shop.com', 'evany@shop.com'])
    expect(listEvents({ q: 'policies' }).map((e) => e.kind)).toEqual(['change'])
    const [decision] = listEvents({ by: 'ana@shop.com' })
    expect(eventText(decision)).toEqual({ what: 'Denied refund', detail: '=Already, "refunded"' })
    const csv = eventsCsv(listEvents({}))
    expect(csv.split('\r\n')[0]).toBe('When (UTC),Kind,Person,Agent,Workflow,What,Detail,Case,Event,Hash')
    expect(csv).toContain(`,decision,ana@shop.com,cs,refunds,Denied refund,"'=Already, ""refunded""",r1,2,`)
  })
})

describe('searching cases worth a look', () => {
  it('finds runs a person overruled, marked bad, or that asked a question', async () => {
    const store = new SqliteRunStore(db)
    await store.put(run('4', { decisions: [{ tool: 'refund', approved: true, edited: true, at: 'x' }] }))
    await store.put(run('5', { feedback: { verdict: 'bad', at: 'x' } }))
    await store.put(run('6', { answers: [{ question: 'q', answer: 'a', at: 'x' }] }))
    await store.put(run('7', { decisions: [{ tool: 'refund', approved: true, at: 'x' }] }))
    expect((await searchRuns({ flag: 'overruled' })).map((r) => r.run_id)).toEqual(['4'])
    expect((await searchRuns({ flag: 'bad' })).map((r) => r.run_id)).toEqual(['5'])
    expect((await searchRuns({ flag: 'asked' })).map((r) => r.run_id)).toEqual(['6'])
  })
})
