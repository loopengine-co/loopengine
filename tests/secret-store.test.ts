import { afterEach, describe, expect, it } from 'vitest'
import { FileSecretStore, getSecretStore, setSecretStore, type SecretStore } from '../core/secret-store.js'
import { createAgentEnv } from '../core/agent-env.js'
import { setAgentEnvVar, setEnvVar, unsetAgentEnvVar, unsetEnvVar } from '../web/env-admin.js'

class MemoryStore implements SecretStore {
  shared = new Map<string, string>()
  agents = new Map<string, Map<string, string>>()
  readAgentValues(agentName: string): Record<string, string> {
    return Object.fromEntries(this.agents.get(agentName) ?? [])
  }
  async setShared(name: string, value: string) {
    this.shared.set(name, value)
  }
  async unsetShared(name: string) {
    this.shared.delete(name)
  }
  async setAgent(agentName: string, _dir: string, name: string, value: string) {
    if (!this.agents.has(agentName)) this.agents.set(agentName, new Map())
    this.agents.get(agentName)!.set(name, value)
  }
  async unsetAgent(agentName: string, _dir: string, name: string) {
    this.agents.get(agentName)?.delete(name)
  }
}

afterEach(() => {
  setSecretStore(new FileSecretStore())
  delete process.env.LOOPENGINE_TEST_STORE_SHARED
})

describe('secret store', () => {
  it('defaults to the file-based store', () => {
    expect(getSecretStore()).toBeInstanceOf(FileSecretStore)
  })

  it('routes Admin UI writes and per-agent reads through a custom store, never touching .env files', async () => {
    const store = new MemoryStore()
    setSecretStore(store)

    await setEnvVar('LOOPENGINE_TEST_STORE_SHARED', 'shared')
    await setAgentEnvVar('store-fixture-agent', 'LOOPENGINE_TEST_STORE_OWN', 'own')

    expect(store.shared.get('LOOPENGINE_TEST_STORE_SHARED')).toBe('shared')
    expect(process.env.LOOPENGINE_TEST_STORE_SHARED).toBe('shared')
    const env = createAgentEnv('store-fixture-agent', '/nonexistent/agents/store-fixture-agent')
    expect(env.get('LOOPENGINE_TEST_STORE_OWN')).toBe('own')
    expect(env.get('LOOPENGINE_TEST_STORE_SHARED')).toBe('shared')

    await unsetAgentEnvVar('store-fixture-agent', 'LOOPENGINE_TEST_STORE_OWN')
    await unsetEnvVar('LOOPENGINE_TEST_STORE_SHARED')
    expect(env.get('LOOPENGINE_TEST_STORE_OWN')).toBeUndefined()
    expect(process.env.LOOPENGINE_TEST_STORE_SHARED).toBeUndefined()
  })
})
