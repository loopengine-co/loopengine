import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { workflowContent, workflowFromContent, withoutTriggers, getVersion, listVersions, noteVersion, openAuditDb, runEvents, setAuditDb } from '#core/audit-store.js'
import { inputSchemaOf } from '#core/input-schema.js'
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
  const key = { agent: 'cs', workflowId: 'refund-check', kind: 'workflow' as const }

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

  it('hold the whole workflow as text to read, and give it back', () => {
    const w = {
      agent: 'cs', workflowId: 'refund-check', title: 'Refund check', description: 'Checks refunds.',
      parameters: { order_number: { description: 'The order', required: true }, note: { description: '', required: false } },
      model: { provider: 'openai', model: 'gpt-6' },
      tools: [{ name: 'lookup_order', permission: 'allow' }, { name: 'issue_refund', permission: 'ask' }],
      criteria: [{ kind: 'judge', text: 'Says the refund amount' }, { kind: 'contains', value: 'Thanks, "team"', text: 'Signs off' }],
      instructions: 'Check the order.\n\n## Rules\n\n- one\n\n\n# Odd', output: 'A table.',
    }
    const content = workflowContent(w)
    expect(content).toContain('## Workflow\n\ncs/refund-check')
    expect(content).toContain('## Input schema\n\n```json\n{\n  "type": "object",\n  "properties": {\n    "order_number": {\n      "type": "string",\n      "description": "The order"')
    expect(content).toContain('## Tools\n\n- lookup_order: allow\n- issue_refund: ask')
    expect(content).toContain('## Success criteria\n\n- [judge] Says the refund amount\n- [contains: "Thanks, \\"team\\""] Signs off')
    expect(workflowFromContent(content)).toEqual({ ...w, inputSchema: inputSchemaOf(w.parameters) })
    const bare = { agent: 'cs', workflowId: 'bare', title: 'Bare', description: '', parameters: {}, tools: [], criteria: [], instructions: 'Only this.' }
    expect(workflowFromContent(workflowContent(bare))).toEqual({ ...bare, inputSchema: { type: 'object', properties: {}, additionalProperties: false } })
    // A version from when only the brief was numbered.
    expect(workflowFromContent('Check it.\n\n## Result format\n\nA list')).toEqual({ instructions: 'Check it.', output: 'A list' })
  })

  it('leave out the schedules and webhooks older versions held', () => {
    const w = { agent: 'cs', workflowId: 'refund-check', title: 'Refund check', description: '', parameters: {}, tools: [], criteria: [], instructions: 'Check the order.' }
    const now = workflowContent(w)
    expect(now).not.toContain('## Triggers')
    const old = now.replace('\n\n## Success criteria', '\n\n## Triggers\n\n- Schedule "Daily": every 1d, scheduled\n\n## Success criteria')
    expect(withoutTriggers(old)).toBe(now)
    expect(workflowFromContent(old)).toEqual(workflowFromContent(now))
    expect(withoutTriggers(now)).toBe(now)
  })

  it('take over the brief versions kept before, numbers unchanged', () => {
    const dir = mkdtempSync(join(tmpdir(), 'le-versions-'))
    const first = openAuditDb(dir)!
    first.prepare("INSERT INTO versions (agent, workflow_id, kind, number, hash, content, at) VALUES ('cs', 'refund-check', 'brief', 3, 'h', 'Old brief', '2026-11-01T00:00:00Z')").run()
    first.close()
    const db = openAuditDb(dir)!
    expect(getVersion(key, 3, db)).toMatchObject({ number: 3, content: 'Old brief' })
    expect(noteVersion(key, 'New', {}, db)).toBe(4)
    db.close()
  })

  it('are skipped without a database', () => {
    setAuditDb(undefined)
    expect(noteVersion(key, 'x')).toBeUndefined()
    expect(listVersions(key)).toEqual([])
  })
})

describe('message threads in the database', () => {
  it('copy an agent’s old thread files once, and find the latest record', async () => {
    const { findJobThreadBySession, findThread, findThreadByPending, recordThread } = await import('#core/messaging/threads.js')
    const agentDir = join(dir, 'agents', 'cs')
    mkdirSync(join(agentDir, '.messaging'), { recursive: true })
    writeFileSync(join(agentDir, '.messaging', 'threads.jsonl'), JSON.stringify({ app: 'telegram', conversation: 'c1', ts: '10', pendingId: 'p1', kind: 'approval' }) + '\n')
    writeFileSync(join(agentDir, '.messaging', 'jobs.jsonl'), JSON.stringify({ app: 'telegram', conversation: 'c1', ts: '20', sessionId: 's1' }) + '\n')

    expect(findThreadByPending(agentDir, 'p1')).toMatchObject({ ts: '10', kind: 'approval' })
    expect(findJobThreadBySession(agentDir, 's1')).toEqual({ app: 'telegram', conversation: 'c1', ts: '20', sessionId: 's1' })
    recordThread(agentDir, { app: 'telegram', conversation: 'c1', ts: '10', pendingId: 'p1', kind: 'approval', proposedArgs: { amount: 42 } })
    expect(findThread(agentDir, 'telegram', 'c1', '10')).toMatchObject({ proposedArgs: { amount: 42 } })
    expect(db.prepare("SELECT count(*) AS n FROM threads WHERE agent = 'cs'").get()).toMatchObject({ n: 2 })
  })
})

describe('sessions in the database', () => {
  it('keep each turn, and copy a session from its old file when first opened', async () => {
    const { SqliteSessionStore } = await import('#core/session-store.js')
    const old = join(dir, 'sessions')
    mkdirSync(old)
    writeFileSync(join(old, 's1.jsonl'), JSON.stringify({ id: 'a', parentId: null, message: { role: 'user', content: 'hi' } }) + '\n')
    const store = new SqliteSessionStore(db, { importFrom: old })
    expect(await store.getHistory('s1')).toEqual([{ role: 'user', content: 'hi' }])
    await store.withSession('s1', async (history) => ({ newMessages: [{ role: 'assistant', content: `seen ${history.length}` }], result: undefined }))
    expect(await store.getHistory('s1')).toEqual([{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'seen 1' }])
    expect(await store.getHistory('new')).toEqual([])
  })
})

describe('a case’s steps', () => {
  it('carry each model call’s tokens and time, and the wait for a person', async () => {
    const { timelineOf } = await import('#web/inbox-admin.js')
    const history = [
      { role: 'user' as const, content: 'Run it.' },
      { role: 'assistant' as const, content: [{ type: 'tool_use' as const, id: 't1', name: 'system_ask_user', input: { question: 'Which order?' } }] },
      { role: 'user' as const, content: [{ type: 'tool_result' as const, tool_use_id: 't1', content: 'EM20-1' }] },
      { role: 'assistant' as const, content: [{ type: 'text' as const, text: 'Done.' }] },
    ]
    const call = (id: number, at: string, durationMs: number) => ({ id, at, agent: 'cs', tenant: 'default', inputTokens: 100 * id, outputTokens: 10 * id, durationMs })
    const steps = timelineOf(history, [call(1, '2026-11-24T10:00:02.000Z', 2000), call(2, '2026-11-24T10:05:03.000Z', 1000)])
    expect(steps[0]).toMatchObject({ kind: 'question', answer: 'EM20-1', call: { inputTokens: 100, durationMs: 2000 }, waitMs: 300000 })
    expect(steps[1]).toMatchObject({ kind: 'text', call: { inputTokens: 200, durationMs: 1000 } })
    // Calls that don't line up with the replies (a retry) give no step times.
    expect(timelineOf(history, [call(1, '2026-11-24T10:00:02.000Z', 2000)])[0].call).toBeUndefined()
  })
})
