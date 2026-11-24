import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { briefContent, briefFromContent, getVersion, listVersions, noteVersion, openAuditDb, runEvents, setAuditDb } from '#core/audit-store.js'
import { SqliteRunStore, WorkflowRunner, getRun, listRuns, setRunStore, type WorkflowRun } from '#core/workflow-runs.js'

let dir: string
let db: DatabaseSync
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'loopengine-audit-'))
  db = openAuditDb(dir)!
  setAuditDb(db)
})
afterEach(() => {
  setAuditDb(undefined)
  db.close()
  rmSync(dir, { recursive: true, force: true })
})

const input = { agent: 'cs', workflow_id: 'refund-check', source: 'api' as const, message: 'Check the refund.' }

function oldRun(id: string, finishedDaysAgo: number): WorkflowRun {
  const at = new Date(Date.now() - finishedDaysAgo * 24 * 60 * 60 * 1000).toISOString()
  return { run_id: id, agent: 'cs', workflow_id: 'refund-check', source: 'api', status: 'done', started_at: at, finished_at: at, message: 'm', session_id: `run-${id}` }
}

describe('the run store in the database', () => {
  it('copies runs from the JSON files once, and leaves the files', async () => {
    mkdirSync(join(dir, 'runs'))
    writeFileSync(join(dir, 'runs', 'a1.json'), JSON.stringify(oldRun('a1', 2)))
    writeFileSync(join(dir, 'runs', 'bad.json'), '{not json')
    const store = new SqliteRunStore(db, { importFrom: dir })
    expect((await store.list()).map((r) => r.run_id)).toEqual(['a1'])
    // A second open doesn't import again (a removed run stays removed).
    await store.remove('a1')
    expect(await new SqliteRunStore(db, { importFrom: dir }).list()).toEqual([])
  })

  it('lists each agent’s latest finished runs, keeping older ones until the retention period ends', async () => {
    const store = new SqliteRunStore(db, { listed: 2 })
    setRunStore(store)
    for (const [id, days] of [['r1', 3], ['r2', 2], ['r3', 1], ['r4', 500]] as const) await store.put(oldRun(id, days))
    expect((await store.list()).map((r) => r.run_id)).toEqual(['r3', 'r2'])
    expect(await getRun('cs', 'r1')).toMatchObject({ run_id: 'r1' })
    expect((await listRuns('cs', { workflowId: 'refund-check', limit: 1 })).map((r) => r.run_id)).toEqual(['r3'])
    await store.prune()
    expect(await store.get('r4')).toBeUndefined()
    expect(await store.get('r1')).toBeDefined()
  })

  it('records the versions a run starts under, and each decision with what changed and why', async () => {
    setRunStore(new SqliteRunStore(db))
    const runner = new WorkflowRunner({
      execute: async () => ({ kind: 'pending', pendingIds: ['p1'] }),
      versionsFor: () => ({ brief: 3, policies: 1 }),
    })
    const run = await runner.start(input)
    await runner.idle()
    await runner.recordDecision(run.session_id, { tool: 'refund', approved: true, by: 'ana@shop.com', edited: true, before: { amount: 84 }, after: { amount: 42 } })
    await runner.recordDecision(run.session_id, { tool: 'email', approved: false, by: 'ana@shop.com', reason: 'Wrong customer.' })
    await runner.recordAnswer(run.session_id, { question: 'Include the photo?', answer: 'Yes', by: 'ben@shop.com' })

    const saved = await getRun('cs', run.run_id)
    expect(saved).toMatchObject({
      versions: { brief: 3, policies: 1 },
      decisions: [
        { tool: 'refund', approved: true, edited: true, before: { amount: 84 }, after: { amount: 42 } },
        { tool: 'email', approved: false, reason: 'Wrong customer.' },
      ],
    })
    expect(runEvents(run.run_id).map((e) => [e.kind, e.by, e.data.tool ?? e.data.answer])).toEqual([
      ['decision', 'ana@shop.com', 'refund'],
      ['decision', 'ana@shop.com', 'email'],
      ['answer', 'ben@shop.com', 'Yes'],
    ])
  })
})

describe('versions', () => {
  const key = { agent: 'cs', workflowId: 'refund-check', kind: 'brief' as const }

  it('number a text once, and again only when it changes', () => {
    expect(noteVersion(key, 'Check the order.')).toBe(1)
    expect(noteVersion(key, 'Check the order.')).toBe(1)
    expect(noteVersion(key, 'Check the order, then refund.', { by: 'ana@shop.com', reason: 'Edited in the console' })).toBe(2)
    expect(listVersions(key).map((v) => [v.number, v.by, v.reason])).toEqual([
      [2, 'ana@shop.com', 'Edited in the console'],
      [1, undefined, 'First version'],
    ])
    // Back to an earlier text is a new version, not the old number.
    expect(noteVersion(key, 'Check the order.')).toBe(3)
    expect(getVersion(key, 3)).toMatchObject({ content: 'Check the order.', reason: 'Changed outside the console' })
  })

  it('keep each workflow apart', () => {
    noteVersion(key, 'A')
    expect(noteVersion({ ...key, workflowId: 'other' }, 'B')).toBe(1)
  })

  it('hold the instructions and result format, and give them back', () => {
    const content = briefContent({ instructions: 'Check the order.', output: 'A table.' })
    expect(briefFromContent(content)).toEqual({ instructions: 'Check the order.', output: 'A table.' })
    expect(briefFromContent(briefContent({ instructions: 'Only this.' }))).toEqual({ instructions: 'Only this.' })
  })

  it('are skipped without a database', () => {
    setAuditDb(undefined)
    expect(noteVersion(key, 'x')).toBeUndefined()
    expect(listVersions(key)).toEqual([])
  })
})
