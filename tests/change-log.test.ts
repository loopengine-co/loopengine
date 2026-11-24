import { describe, expect, it } from 'vitest'
import { changeOf, keptBody } from '#web/change-log.js'

describe('the change log', () => {
  it('names settings changes, with their agent and workflow', () => {
    expect(changeOf('PUT', '/agents/cs/workflows/refund-check')).toEqual({ label: 'Edited the workflow', agent: 'cs', workflowId: 'refund-check' })
    expect(changeOf('PUT', '/agents/cs/workflows/refund-check/messages')).toMatchObject({ label: 'Changed where messages go' })
    expect(changeOf('POST', '/agents/cs/workflows/refund-check/versions/2/restore')).toMatchObject({ label: 'Restored brief version 2' })
    expect(changeOf('PUT', '/agents/cs/actauth/rules/r1')).toMatchObject({ label: 'Changed permissions', agent: 'cs' })
    expect(changeOf('PUT', '/config/policies')).toEqual({ label: 'Changed shared policies' })
  })

  it('leaves out reading, running and deciding', () => {
    expect(changeOf('GET', '/agents/cs/workflows/refund-check')).toBeUndefined()
    expect(changeOf('POST', '/agents/cs/workflows/refund-check/run')).toBeUndefined()
    expect(changeOf('POST', '/agents/cs/workflows/refund-check/evals/run')).toBeUndefined()
    expect(changeOf('POST', '/agents/cs/messages')).toBeUndefined()
    expect(changeOf('POST', '/agents/cs/runs/abc/feedback')).toBeUndefined()
    expect(changeOf('POST', '/pending-approvals/p1/resolve')).toBeUndefined()
  })

  it('keeps bodies without their secrets', () => {
    expect(keptBody('/config/models/openai', { apiKey: 'sk-1', model: 'gpt' })).toEqual({ apiKey: '(hidden)', model: 'gpt' })
    expect(keptBody('/agents/cs/notifier', { telegram: { botToken: 't', chatId: '1' } })).toEqual({ telegram: { botToken: '(hidden)', chatId: '1' } })
    expect(keptBody('/agents/cs/env/STRIPE_KEY', { value: 'x' })).toBeUndefined()
  })
})
