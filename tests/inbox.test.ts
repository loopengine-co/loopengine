import { describe, expect, it } from 'vitest'
import { canDecide, inboxOnly, inboxOnlyAllows, workspaceRole } from '#core/workspace-roles.js'
import { getInboxCase, listInbox, timelineOf, type InboxDeps, type InboxPending } from '#web/inbox-admin.js'
import type { WorkflowRun } from '#core/workflow-runs.js'

describe('workspace roles', () => {
  it('reads a role, treating one it does not know as viewer and none as the owner', () => {
    expect(workspaceRole('approver')).toBe('approver')
    expect(workspaceRole(undefined)).toBe('owner')
    expect(workspaceRole('superuser')).toBe('viewer')
  })

  it('lets approvers decide and keeps approvers and viewers to the Inbox', () => {
    expect(canDecide('approver')).toBe(true)
    expect(canDecide('viewer')).toBe(false)
    expect(inboxOnly('editor')).toBe(false)
    expect(inboxOnly('viewer')).toBe(true)
    expect(inboxOnlyAllows('GET', '/inbox')).toBe(true)
    expect(inboxOnlyAllows('GET', '/inbox/cases/r1')).toBe(true)
    expect(inboxOnlyAllows('POST', '/pending-questions/p1/answer')).toBe(true)
    expect(inboxOnlyAllows('POST', '/pending-approvals/p1/resolve')).toBe(true)
    expect(inboxOnlyAllows('GET', '/agents')).toBe(false)
    expect(inboxOnlyAllows('POST', '/agents/cs/workflows/x/run')).toBe(false)
  })
})

const run = (over: Partial<WorkflowRun>): WorkflowRun => ({
  run_id: 'r1', agent: 'cs', workflow_id: 'handle-dispute', source: 'webhook', status: 'done', started_at: '2026-11-20T01:00:00.000Z', message: 'm', session_id: 's1', ...over,
})
const pending = (over: Partial<InboxPending>): InboxPending => ({
  pendingId: 'p1', kind: 'question', tool: 'system_ask_user', args: { question: 'Records?' }, reason: 'Records?', sessionId: 's2', createdAt: '2026-11-20T02:00:00.000Z', agent: 'cs', ...over,
})

function deps(runs: WorkflowRun[], open: InboxPending[]): InboxDeps {
  return {
    runs: async () => runs,
    pending: async () => open,
    history: async () => [
      { role: 'user', content: 'instructions' },
      { role: 'assistant', content: [{ type: 'text', text: 'Looking it up.' }, { type: 'tool_use', id: 't1', name: 'lookup_order', input: { order: 'EM-1' } }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: '{"shipped":false}' }] },
      { role: 'assistant', content: [{ type: 'tool_use', id: 't2', name: 'system_ask_user', input: { question: 'Records?' } }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't2', content: 'None' }] },
    ],
    workflowTitle: () => 'Handle dispute',
  }
}

describe('the Inbox', () => {
  it('shows what needs you, however long it has waited, the longest first; else the last 7 days', async () => {
    const now = Date.parse('2026-11-24T12:00:00.000Z')
    const runs = [
      run({ run_id: 'old', status: 'done', started_at: '2026-11-20T01:00:00.000Z', finished_at: '2026-11-20T01:06:00.000Z', chat_notice: 'New dispute du_1', decisions: [{ tool: 'submit', approved: true, at: '2026-11-20T01:05:00.000Z', by: 'jane@example.com' }] }),
      run({ run_id: 'auto', status: 'done', started_at: '2026-11-23T00:00:00.000Z', finished_at: '2026-11-23T00:01:00.000Z' }),
      run({ run_id: 'stale', status: 'done', started_at: '2026-11-01T00:00:00.000Z', finished_at: '2026-11-01T00:01:00.000Z' }),
      run({ run_id: 'waiting', status: 'awaiting_approval', session_id: 's2', started_at: '2026-11-20T00:00:00.000Z', params: { dispute_id: 'du_2' } }),
      run({ run_id: 'long-waiting', status: 'awaiting_approval', session_id: 's3', started_at: '2026-11-02T00:00:00.000Z' }),
    ]
    const waits = [pending({ createdAt: '2026-11-20T00:01:00.000Z' }), pending({ pendingId: 'p3', sessionId: 's3', createdAt: '2026-11-02T00:01:00.000Z' })]
    // Something waits: the Inbox opens on it.
    const needs = await listInbox(deps(runs, waits), { now })
    expect(needs).toMatchObject({ view: 'needs', open: 2 })
    expect(needs.items.map((i) => i.id)).toEqual(['long-waiting', 'waiting'])
    expect(needs.items[1]).toMatchObject({ title: 'Handle dispute: du_2', waiting: ['question'], waitingSince: '2026-11-20T00:01:00.000Z' })
    // Recent: everything not waiting from the last 7 days, the latest first, with what happened.
    const recent = await listInbox(deps(runs, waits), { view: 'recent', now })
    expect(recent.items.map((i) => [i.id, i.outcome])).toEqual([['auto', 'Done automatically'], ['old', 'Approved by jane@example.com']])
    expect((await listInbox(deps(runs, waits), { view: 'recent', q: 'jane', now })).items.map((i) => i.id)).toEqual(['old'])
    // Nothing waits: the Inbox opens on All.
    expect((await listInbox(deps(runs, []), { now })).view).toBe('all')
    // The workflow picker lists every workflow with a case, whatever the view.
    expect(needs.workflows.map((w) => w.id).sort()).toEqual([...new Set(runs.map((r) => r.workflow_id))].sort())
  })

  it('sorts conversations into All, Needs attention, Completed, Failed and Archived, each with what it last said', async () => {
    const runs = [
      run({ run_id: 'done', status: 'done', started_at: '2026-11-23T00:00:00.000Z', finished_at: '2026-11-23T00:01:00.000Z', result: 'Refunded **$84**.' }),
      run({ run_id: 'failed', status: 'error', started_at: '2026-11-22T00:00:00.000Z', finished_at: '2026-11-22T00:01:00.000Z', error: 'Missing transaction data for `ledger_q4`.' }),
      run({ run_id: 'put-away', status: 'done', started_at: '2026-11-21T00:00:00.000Z', finished_at: '2026-11-21T00:01:00.000Z', result: 'Done.' }),
      run({ run_id: 'asks', status: 'awaiting_approval', session_id: 's4', started_at: '2026-11-20T00:00:00.000Z' }),
    ]
    const waits = [pending({ pendingId: 'p4', sessionId: 's4', kind: 'approval', tool: 'publish', args: {} })]
    const d: InboxDeps = {
      ...deps(runs, waits),
      history: async () => [{ role: 'user', content: 'go' }, { role: 'assistant', content: 'The content is ready. Please review before publishing.' }],
      agentLabel: () => 'Content Agent',
      archived: () => ({ 'put-away': { at: '2026-11-24T00:00:00.000Z', by: 'ana@shop.com' }, asks: { at: '2026-11-24T00:00:00.000Z' } }),
    }
    const all = await listInbox(d, { view: 'all' })
    // What waits on a person first, then the latest; the archived left out.
    expect(all.items.map((i) => i.id)).toEqual(['asks', 'done', 'failed'])
    expect(all.counts).toEqual({ all: 3, needs: 1, completed: 1, failed: 1, archived: 1 })
    expect(all.items.map((i) => [i.state, i.summary])).toEqual([
      ['needs', 'The content is ready. Please review before publishing.'],
      ['completed', 'Refunded $84.'],
      ['failed', 'Missing transaction data for ledger_q4.'],
    ])
    expect(all.items[0]).toMatchObject({ agentLabel: 'Content Agent', workflowTitle: 'Handle dispute' })
    // One waiting on a person is never archived away.
    expect(all.items[0]).not.toHaveProperty('archived')
    expect((await listInbox(d, { view: 'failed' })).items.map((i) => i.id)).toEqual(['failed'])
    expect((await listInbox(d, { view: 'archived' })).items.map((i) => [i.id, i.archived?.by])).toEqual([['put-away', 'ana@shop.com']])
    expect((await getInboxCase(d, 'put-away'))?.archived).toMatchObject({ by: 'ana@shop.com' })
  })

  it('lists a decision outside any run as a case of its own', async () => {
    const { items } = await listInbox(deps([], [pending({ pendingId: 'p9', sessionId: 'chat-1', kind: 'approval', tool: 'refund', args: {} })]))
    expect(items).toEqual([expect.objectContaining({ id: 'p-p9', title: 'Approve refund', workflowTitle: 'Chat', waiting: ['approval'] })])
    expect((await getInboxCase(deps([], [pending({ pendingId: 'p9', sessionId: 'chat-1' })]), 'p-p9'))?.pending[0].question).toBe('Records?')
  })

  it("shows a case's timeline: the agent's words, tools with what came back, and questions with answers", async () => {
    const c = await getInboxCase(deps([run({ status: 'awaiting_approval', session_id: 's2' })], [pending({ options: undefined, args: { question: 'Records?', options: ['Yes', 'No'] } })]), 'r1')
    expect(c?.pending[0]).toMatchObject({ question: 'Records?', options: ['Yes', 'No'] })
    expect(c?.steps).toEqual([
      { kind: 'text', text: 'Looking it up.' },
      { kind: 'tool', tool: 'lookup_order', args: { order: 'EM-1' }, result: '{"shipped":false}' },
      { kind: 'question', question: 'Records?', answer: 'None' },
    ])
    expect(c?.run).not.toHaveProperty('session_id')
    expect(timelineOf([])).toEqual([])
  })
})
