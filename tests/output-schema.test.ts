import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OutputSchemaError, checkOutput, checkOutputSchema, jsonInReply, outputSchemaInstructions } from '#core/output-schema.js'
import { FileRunStore, WorkflowRunner, getRun, setRunStore, type ExecuteRun } from '#core/workflow-runs.js'
import { resultField } from '#web/goals-admin.js'
import { OUTPUT_SCHEMA_CRITERION, codeCheck } from '#web/workflow-evidence.js'
import { workflowContent, workflowFromContent } from '#core/audit-store.js'
import { readWorkflow, workflowRunMessage } from '#core/workflows.js'
import { WorkflowError, updateWorkflow } from '#web/workflow-admin.js'

const schema = checkOutputSchema({
  type: 'object',
  properties: { summary: { type: 'string' }, priority: { enum: ['low', 'high'] }, lead: { type: 'object', properties: { email: { type: 'string', format: 'email' } } } },
  required: ['summary', 'priority'],
  additionalProperties: false,
})

describe('an output schema', () => {
  it('must be a JSON Schema for an object or a list', () => {
    expect(checkOutputSchema('{"type":"array","items":{"type":"string"}}')).toEqual({ type: 'array', items: { type: 'string' } })
    expect(() => checkOutputSchema('{nope')).toThrow(OutputSchemaError)
    expect(() => checkOutputSchema({ type: 'string' })).toThrow(/"object" or "array"/)
    expect(() => checkOutputSchema({ type: 'object', properties: { a: { type: 'nonsense' } } })).toThrow(/isn't a valid JSON Schema/)
  })

  it('finds the JSON in a reply: the whole reply, a ```json block, or the braces in it', () => {
    expect(jsonInReply('{"a":1}')).toEqual({ found: true, value: { a: 1 } })
    expect(jsonInReply('Done.\n```json\n{"a":2}\n```')).toEqual({ found: true, value: { a: 2 } })
    expect(jsonInReply('Here: {"a":3} — that is all')).toEqual({ found: true, value: { a: 3 } })
    expect(jsonInReply('no json here')).toEqual({ found: false })
  })

  it('says what doesn’t match, field by field', () => {
    expect(checkOutput(schema, '{"summary":"ok","priority":"low"}')).toEqual({ ok: true, value: { summary: 'ok', priority: 'low' } })
    const bad = checkOutput(schema, '{"summary":"ok","priority":"urgent","lead":{"email":"nope"},"extra":1}')
    expect(bad.ok).toBe(false)
    expect(!bad.ok && bad.errors).toEqual(expect.arrayContaining([
      'the result must NOT have additional properties (extra)',
      'priority must be equal to one of the allowed values: "low", "high"',
      'lead.email must match format "email"',
    ]))
    expect(checkOutput(schema, 'sorry')).toEqual({ ok: false, errors: ['The reply has no JSON in it.'] })
    expect(outputSchemaInstructions(schema)).toContain('"priority"')
  })
})

describe('a run of a workflow with an output schema', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'le-output-'))
    setRunStore(new FileRunStore(dir))
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))
  const input = { agent: 'cs', workflow_id: 'triage', source: 'api' as const, message: 'Triage it.' }

  it('keeps the JSON as its output when the reply matches', async () => {
    const runner = new WorkflowRunner({ execute: async () => ({ kind: 'done', text: 'Done.\n```json\n{"summary":"Late parcel","priority":"high"}\n```' }), outputSchemaFor: () => schema })
    const run = await runner.start(input)
    await runner.idle()
    expect(await getRun('cs', run.run_id)).toMatchObject({ status: 'done', output: { summary: 'Late parcel', priority: 'high' } })
  })

  it('tells the agent what’s wrong and asks again, in the same conversation', async () => {
    const execute = vi.fn<ExecuteRun>()
      .mockResolvedValueOnce({ kind: 'done', text: '{"summary":"Late parcel","priority":"urgent"}' })
      .mockResolvedValueOnce({ kind: 'done', text: '{"summary":"Late parcel","priority":"high"}' })
    const runner = new WorkflowRunner({ execute, outputSchemaFor: () => schema })
    const run = await runner.start(input)
    await runner.idle()
    expect(execute).toHaveBeenCalledTimes(2)
    expect(execute.mock.calls[1]![1]).toContain('priority must be equal to one of the allowed values')
    expect(execute.mock.calls[1]![2]).toBe(run.session_id)
    expect(await getRun('cs', run.run_id)).toMatchObject({ status: 'done', output: { priority: 'high' }, output_retries: 1 })
  })

  it('fails after two retries that still don’t match, keeping the reply and what was wrong', async () => {
    const execute = vi.fn<ExecuteRun>(async () => ({ kind: 'done', text: 'I could not do it.' }))
    const runner = new WorkflowRunner({ execute, outputSchemaFor: () => schema })
    const run = await runner.start(input)
    await runner.idle()
    expect(execute).toHaveBeenCalledTimes(3)
    const saved = await getRun('cs', run.run_id)
    expect(saved).toMatchObject({ status: 'error', result: 'I could not do it.', output_retries: 2, output_errors: ['The reply has no JSON in it.'] })
    expect(saved!.error).toMatch(/didn't match the workflow's output schema after 2 retries/)
    expect(saved!.output).toBeUndefined()
  })

  it('checks nothing for a workflow without one', async () => {
    const runner = new WorkflowRunner({ execute: async () => ({ kind: 'done', text: 'plain words' }), outputSchemaFor: () => undefined })
    const run = await runner.start(input)
    await runner.idle()
    expect(await getRun('cs', run.run_id)).toMatchObject({ status: 'done', result: 'plain words' })
  })

  it('checks a run resumed after an approval too', async () => {
    const runner = new WorkflowRunner({ execute: async () => ({ kind: 'pending', pendingIds: ['p1'] }), outputSchemaFor: () => schema })
    const run = await runner.start(input)
    await runner.idle()
    await runner.settleFromResume(run.session_id, { text: '{"summary":"ok","priority":"low"}' })
    expect(await getRun('cs', run.run_id)).toMatchObject({ status: 'done', output: { summary: 'ok', priority: 'low' } })
  })
})

describe('the output elsewhere', () => {
  it('gives the next workflow in a chain one field of it', () => {
    const output = { lead: { email: 'ann@acme.co', tags: ['b2b'] }, count: 3 }
    expect(resultField(output, 'lead.email')).toBe('ann@acme.co')
    expect(resultField(output, 'lead.tags')).toBe('["b2b"]')
    expect(resultField(output, 'count')).toBe('3')
    expect(resultField(output, 'lead.missing')).toBe('')
    expect(resultField(undefined, 'lead')).toBe('')
  })

  it('is checked in every eval round, in code', () => {
    expect(codeCheck(OUTPUT_SCHEMA_CRITERION, { result: '{"summary":"x","priority":"low"}', tools: [], outputSchema: schema })).toEqual({ criterionId: 'output-schema', pass: true })
    expect(codeCheck(OUTPUT_SCHEMA_CRITERION, { result: 'words', tools: [], outputSchema: schema })).toMatchObject({ pass: false, reason: 'The reply has no JSON in it.' })
  })

  it('is part of the workflow version, and comes back from it', () => {
    const w = { agent: 'cs', workflowId: 'triage', title: 'Triage', description: '', parameters: {}, tools: [], criteria: [], instructions: 'Triage it.', outputSchema: schema }
    expect(workflowContent(w)).toContain('## Output schema\n\n```json\n{\n  "type": "object"')
    expect(workflowFromContent(workflowContent(w)).outputSchema).toEqual(schema)
    expect(workflowFromContent(workflowContent({ ...w, outputSchema: undefined })).outputSchema).toBeUndefined()
  })

  it('is saved with the workflow from the editor, checked first, and told to the agent', () => {
    const dir = mkdtempSync(join(tmpdir(), 'le-wf-'))
    try {
      mkdirSync(join(dir, 'skills', 'triage'), { recursive: true })
      writeFileSync(join(dir, 'skills', 'triage', 'SKILL.md'), '---\nname: triage\ndescription: Triage tickets.\nworkflow: true\n---\nTriage it.\n')
      const base = { title: 'Triage', instructions: 'Triage it.', parameters: {} }
      updateWorkflow(dir, 'triage', { ...base, outputSchema: JSON.stringify(schema) })
      const saved = readWorkflow(dir, 'triage')!
      expect(saved.outputSchema).toEqual(schema)
      expect(workflowRunMessage(saved, {})).toContain('End with your result as JSON that matches this JSON Schema')
      expect(() => updateWorkflow(dir, 'triage', { ...base, outputSchema: '{"type":"string"}' })).toThrow(WorkflowError)
      updateWorkflow(dir, 'triage', { ...base })
      expect(readWorkflow(dir, 'triage')!.outputSchema).toEqual(schema)
      updateWorkflow(dir, 'triage', { ...base, outputSchema: '' })
      expect(readWorkflow(dir, 'triage')!.outputSchema).toBeUndefined()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
