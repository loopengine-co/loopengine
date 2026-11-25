import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readWorkflow, setWorkflowFields, setWorkflowName } from '#core/workflows.js'
import { workflowEdit } from '#web/workflow-admin.js'
import { changeDraft, discardDraft, draftChanges, isEmptyDraft, messagesText, readDraft, saveDraft, withDraft, type DraftState } from '#web/workflow-drafts.js'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'le-drafts-'))
  mkdirSync(join(dir, 'agents', 'cs', 'skills', 'refund'), { recursive: true })
  writeFileSync(join(dir, 'agents', 'cs', 'skills', 'refund', 'SKILL.md'), '---\nname: refund\ndescription: Refunds orders.\nworkflow: true\ntitle: Refund\nparameters:\n  order_id:\n    description: The order\n    required: true\n---\nCheck the order, then refund it.\n')
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))
const agentDir = () => join(dir, 'agents', 'cs')

describe('a workflow draft', () => {
  it('is kept apart from the workflow, which stays as published', () => {
    const { title: _t, description: _d, ...fields } = workflowEdit(agentDir(), 'refund', { title: 'Refund', instructions: 'Check the order.\nAsk before refunding.', parameters: { order_id: { description: 'The order', required: true } } })
    saveDraft(dir, 'cs', 'refund', { fields, savedAt: '', savedBy: 'ana@shop.com', basedOn: 3 })
    expect(readWorkflow(agentDir(), 'refund')!.instructions).toBe('Check the order, then refund it.')
    expect(readDraft(dir, 'cs', 'refund')).toMatchObject({ savedBy: 'ana@shop.com', basedOn: 3, fields: { instructions: 'Check the order.\nAsk before refunding.' } })
  })

  it('keeps the version it began from as parts are added, and is removed once empty', () => {
    changeDraft(dir, 'cs', 'refund', { by: 'ana@shop.com', basedOn: 3 }, (d) => ({ ...d, criteria: [{ text: 'Says the amount', kind: 'judge' }] }))
    changeDraft(dir, 'cs', 'refund', { by: 'ben@shop.com', basedOn: 5 }, (d) => ({ ...d, messages: { delivery: { result_to_chat: true } } }))
    expect(readDraft(dir, 'cs', 'refund')).toMatchObject({ basedOn: 3, savedBy: 'ben@shop.com', criteria: [{ text: 'Says the amount' }], messages: { delivery: { result_to_chat: true } } })
    changeDraft(dir, 'cs', 'refund', {}, ({ criteria: _c, messages: _m, ...d }) => d)
    expect(readDraft(dir, 'cs', 'refund')).toBeUndefined()
    expect(isEmptyDraft({ savedAt: '', schedules: { add: [], remove: [] }, webhooks: { added: [], update: {}, remove: [] } })).toBe(true)
    changeDraft(dir, 'cs', 'refund', {}, (d) => ({ ...d, schedules: { add: [], remove: ['t-1'] } }))
    discardDraft(dir, 'cs', 'refund')
    expect(readDraft(dir, 'cs', 'refund')).toBeUndefined()
  })

  it('says what publishing changes: the editor’s fields, criteria, messages and triggers', () => {
    const workflow = readWorkflow(agentDir(), 'refund')!
    const { title: _t, description: _d, ...fields } = workflowEdit(agentDir(), 'refund', {
      title: 'Refund',
      instructions: 'Check the order, then refund it.\nAsk before refunding over $50.',
      parameters: { order_id: { description: 'The order', required: true }, amount: { description: 'How much', required: true, type: 'number', minimum: 0 } },
      outputSchema: '{"type":"object","properties":{"refunded":{"type":"boolean"}}}',
    })
    const published: DraftState = { workflow, criteria: [{ text: 'Says the amount', kind: 'judge' }], delivery: undefined, triggers: ['Schedule "Daily": every 1d, scheduled'] }
    const drafted: DraftState = {
      workflow: withDraft(workflow, fields),
      criteria: [{ text: 'Says the amount', kind: 'judge' }, { text: 'Never refunds twice', kind: 'tool_not_called', value: 'issue_refund' }],
      delivery: { result_to_chat: true },
      triggers: ['Webhook "Stripe": from stripe, on'],
    }
    const changes = draftChanges(published, drafted)
    expect(changes.map((c) => c.field)).toEqual(['instructions', 'inputs', 'output schema', 'success criteria', 'messaging', 'triggers'])
    expect(changes.find((c) => c.field === 'instructions')).toEqual({ field: 'instructions', added: ['Ask before refunding over $50.'], removed: [] })
    expect(changes.find((c) => c.field === 'success criteria')).toEqual({ field: 'success criteria', added: ['[tool_not_called: issue_refund] Never refunds twice'], removed: [] })
    expect(changes.find((c) => c.field === 'messaging')).toEqual({ field: 'messaging', from: 'the messaging app', to: 'result to chat' })
    expect(changes.find((c) => c.field === 'triggers')).toEqual({ field: 'triggers', from: 'Schedule "Daily": every 1d, scheduled', to: 'Webhook "Stripe": from stripe, on' })
    expect(draftChanges(published, published)).toEqual([])
  })

  it('says where messages go in words', () => {
    expect(messagesText(null)).toBe('the messaging app')
    expect(messagesText({ callback_url: 'https://app.example/hooks', decisions_to: 'callback', chat_notice: 'New {{id}}' })).toBe('updates to https://app.example/hooks; approvals and questions to your app; start notice “New {{id}}”')
  })

  it('when published, is the workflow; its name and description were saved already', () => {
    setWorkflowName(agentDir(), 'refund', { title: 'Refund check', description: 'Checks and refunds orders.' })
    const { title: _t, description: _d, ...fields } = workflowEdit(agentDir(), 'refund', { title: 'Refund check', instructions: 'New.', parameters: {}, model: { provider: 'openai', model: 'gpt-6' } })
    const before = readWorkflow(agentDir(), 'refund')!
    const expected = withDraft(before, fields)
    setWorkflowFields(agentDir(), 'refund', { ...fields, title: before.title })
    const live = readWorkflow(agentDir(), 'refund')!
    expect([live.title, live.description, live.instructions, live.parameters, live.model]).toEqual(['Refund check', 'Checks and refunds orders.', expected.instructions, expected.parameters, expected.model])
  })
})
