import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { InputSpecError, checkInputSpec, checkInputValue, inputSchemaOf } from '#core/input-schema.js'
import { readWorkflow, validateParams, workflowRunMessage, type Workflow } from '#core/workflows.js'
import { WorkflowError, updateWorkflow } from '#web/workflow-admin.js'
import { workflowContent, workflowFromContent } from '#core/audit-store.js'

const workflow = (parameters: Workflow['parameters']): Workflow => ({ id: 'refund', title: 'Refund', description: '', startMessage: '', trigger: 'When asked', parameters, steps: 'Refund it.', instructions: 'Refund it.' })

describe('an input’s type and limits', () => {
  it('are checked when saved: a known type, a format for text only, a valid default', () => {
    expect(checkInputSpec('amount', { type: 'number', minimum: 0, default: '10' })).toEqual({ type: 'number', minimum: 0, default: 10 })
    expect(checkInputSpec('note', { type: 'string' })).toEqual({})
    expect(() => checkInputSpec('x', { type: 'money' })).toThrow(InputSpecError)
    expect(() => checkInputSpec('x', { type: 'number', format: 'email' })).toThrow(/format is for text only/)
    expect(() => checkInputSpec('x', { pattern: '(' })).toThrow(/regular expression/)
    expect(() => checkInputSpec('tier', { enum: ['a', 'b'], default: 'c' })).toThrow(/default isn't valid/)
  })

  it('take values as JSON types or as text that reads as the type, and keep them as text', () => {
    expect(checkInputValue('n', { type: 'integer' }, '42')).toEqual({ ok: true, value: 42, text: '42' })
    expect(checkInputValue('n', { type: 'integer' }, 4.5)).toMatchObject({ ok: false })
    expect(checkInputValue('ok', { type: 'boolean' }, 'yes')).toEqual({ ok: true, value: true, text: 'true' })
    expect(checkInputValue('items', { type: 'array' }, '["a"]')).toEqual({ ok: true, value: ['a'], text: '["a"]' })
    expect(checkInputValue('meta', { type: 'object' }, { a: 1 })).toEqual({ ok: true, value: { a: 1 }, text: '{"a":1}' })
    expect(checkInputValue('meta', { type: 'object' }, '[1]')).toEqual({ ok: false, error: '"meta" must be an object' })
    expect(checkInputValue('email', { format: 'email' }, 'nope')).toEqual({ ok: false, error: '"email" must match format "email"' })
    expect(checkInputValue('tier', { enum: ['gold', 'silver'] }, 'bronze')).toEqual({ ok: false, error: '"tier" must be one of "gold", "silver"' })
    expect(checkInputValue('note', {}, 12)).toEqual({ ok: true, value: '12', text: '12' })
  })
})

describe('a run’s inputs', () => {
  const w = workflow({
    order_id: { description: 'The order', required: true },
    amount: { description: 'How much', required: true, type: 'number', minimum: 0 },
    reason: { description: 'Why', required: false, enum: ['damaged', 'late'], default: 'late' },
    notify: { description: 'Email them', required: false, type: 'boolean' },
    items: { description: 'Lines', required: false, type: 'array' },
  })

  it('are checked against their types, with defaults filled in, and kept as text', () => {
    expect(validateParams(w, { order_id: 'EM-1', amount: 20.5, notify: 'no', items: [{ sku: 'A' }] })).toEqual({ order_id: 'EM-1', amount: '20.5', reason: 'late', notify: 'false', items: '[{"sku":"A"}]' })
  })

  it('say everything wrong at once', () => {
    expect(() => validateParams(w, { amount: '-3', reason: 'lost', items: 'x' })).toThrow('Refund: "amount" must be >= 0; "reason" must be one of "damaged", "late"; "items" must be a list as JSON; "order_id" is required')
  })

  it('show a list or an object to the agent laid out', () => {
    const message = workflowRunMessage(w, validateParams(w, { order_id: 'EM-1', amount: 1, items: [{ sku: 'A' }] }))
    expect(message).toContain('"sku": "A"')
  })

  it('are one JSON Schema for apps', () => {
    expect(inputSchemaOf(w.parameters)).toEqual({
      type: 'object',
      properties: {
        order_id: { type: 'string', description: 'The order' },
        amount: { type: 'number', minimum: 0, description: 'How much' },
        reason: { type: 'string', enum: ['damaged', 'late'], description: 'Why', default: 'late' },
        notify: { type: 'boolean', description: 'Email them' },
        items: { type: 'array', description: 'Lines' },
      },
      required: ['order_id', 'amount'],
      additionalProperties: false,
    })
  })

  it('keep working for a workflow saved before types: every input is text', () => {
    expect(validateParams(workflow({ order_number: { description: '', required: true } }), { order_number: 123 })).toEqual({ order_number: '123' })
  })
})

describe('typed inputs saved and versioned', () => {
  it('are saved from the editor, checked first; a bad one in the file is ignored', () => {
    const dir = mkdtempSync(join(tmpdir(), 'le-inputs-'))
    try {
      mkdirSync(join(dir, 'skills', 'refund'), { recursive: true })
      writeFileSync(join(dir, 'skills', 'refund', 'SKILL.md'), '---\nname: refund\ndescription: Refunds.\nworkflow: true\n---\nRefund it.\n')
      updateWorkflow(dir, 'refund', { title: 'Refund', instructions: 'Refund it.', parameters: { amount: { description: 'How much', required: true, type: 'number', minimum: 0 } } })
      expect(readWorkflow(dir, 'refund')!.parameters.amount).toEqual({ description: 'How much', required: true, type: 'number', minimum: 0 })
      expect(() => updateWorkflow(dir, 'refund', { title: 'Refund', instructions: 'Refund it.', parameters: { amount: { type: 'money' } } })).toThrow(WorkflowError)
      writeFileSync(join(dir, 'skills', 'refund', 'SKILL.md'), '---\nname: refund\ndescription: Refunds.\nworkflow: true\nparameters:\n  amount:\n    description: How much\n    type: money\n---\nRefund it.\n')
      expect(readWorkflow(dir, 'refund')!.parameters.amount).toEqual({ description: 'How much', required: false })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('are part of the workflow version, and come back from it', () => {
    const parameters = {
      amount: { description: 'How much: in dollars {roughly}', required: true, type: 'number', minimum: 0 },
      note: { description: '', required: false },
      tags: { description: 'Labels', required: false, type: 'array', default: ['a'] },
    }
    const w = { agent: 'cs', workflowId: 'refund', title: 'Refund', description: '', parameters, tools: [], triggers: [], criteria: [], instructions: 'Refund it.' }
    const content = workflowContent(w)
    // One JSON Schema, the one apps get.
    expect(workflowFromContent(content).inputSchema).toEqual(inputSchemaOf(parameters))
    expect(content).toContain('"amount": {\n      "type": "number",\n      "minimum": 0,\n      "description": "How much: in dollars {roughly}"')
    expect(workflowFromContent(content).parameters).toEqual(parameters)
  })
})
