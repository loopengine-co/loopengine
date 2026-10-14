import { afterEach, describe, expect, it } from 'vitest'
import { synthesizeCreateModelCall } from '#core/discover-agents.js'

afterEach(() => {
  delete process.env.OPENAI_API_KEY
})

describe('config-declared model calls', () => {
  it('reuse the client while the key stays the same, and rebuild when it changes', async () => {
    process.env.OPENAI_API_KEY = 'sk-first-0123456789'
    const create = await synthesizeCreateModelCall({ provider: 'openai', model: 'gpt-test' })
    const first = create()
    expect(create()).toBe(first)
    process.env.OPENAI_API_KEY = 'sk-second-0123456789'
    const second = create()
    expect(second).not.toBe(first)
    expect(create()).toBe(second)
  })

  it('never rebuild for a key set in the config itself', async () => {
    const create = await synthesizeCreateModelCall({ provider: 'openai', model: 'gpt-test', apiKey: 'sk-config-0123456789' })
    const first = create()
    process.env.OPENAI_API_KEY = 'sk-env-0123456789'
    expect(create()).toBe(first)
  })
})
