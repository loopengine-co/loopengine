import { describe, expect, it, vi } from 'vitest'
import { createAgentNamesReporter } from '#web/agent-names-sync.js'
import { agentsFor } from '#core/workspace-roles.js'

const env = { LOOPENGINE_TRUSTED_PROXY_SECRET: 'secret-0123456789', LOOPENGINE_PUBLIC_URL: 'https://acme.loopengine.app', LOOPENGINE_CONTROL_PLANE_URL: 'https://cp.test' }

describe('agent names for the dashboard', () => {
  it('sends the sorted names, signed, only when they change', async () => {
    let names = ['ops-agent', 'cs-agent']
    const fetch = vi.fn(async () => new Response('{}', { status: 200 }))
    const reporter = createAgentNamesReporter(() => names, { env, fetch: fetch as unknown as typeof globalThis.fetch })
    await reporter.report()
    await reporter.report()
    expect(fetch).toHaveBeenCalledTimes(1)
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit & { headers: Record<string, string> }]
    expect(url).toBe('https://cp.test/api/workspace/agents')
    expect(JSON.parse(String(init.body))).toEqual({ agents: ['cs-agent', 'ops-agent'] })
    expect(init.headers['x-loopengine-workspace']).toBe('acme')
    expect(init.headers['x-loopengine-signature']).toMatch(/^t=\d+,v1=[0-9a-f]{64}$/)
    names = ['cs-agent']
    await reporter.report()
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('tries a failed send again, and is off outside LoopEngine Cloud', async () => {
    const fetch = vi.fn(async () => new Response('', { status: 500 }))
    const log = vi.fn()
    const reporter = createAgentNamesReporter(() => ['cs-agent'], { env, fetch: fetch as unknown as typeof globalThis.fetch, log, retryMs: 5 })
    await reporter.report()
    await new Promise((r) => setTimeout(r, 30))
    expect(fetch.mock.calls.length).toBeGreaterThanOrEqual(2)
    expect(log).toHaveBeenCalled()
    const offFetch = vi.fn()
    await createAgentNamesReporter(() => ['cs-agent'], { env: {}, fetch: offFetch as unknown as typeof globalThis.fetch }).report()
    expect(offFetch).not.toHaveBeenCalled()
  })

  it('limits only approvers and viewers, to the agents their identity lists', () => {
    expect(agentsFor('approver', ['cs-agent', 7])).toEqual(['cs-agent'])
    expect(agentsFor('viewer', [])).toEqual([])
    expect(agentsFor('approver', undefined)).toBeUndefined()
    expect(agentsFor('editor', ['cs-agent'])).toBeUndefined()
  })
})
