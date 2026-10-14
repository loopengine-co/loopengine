import { mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FileSecretStore, getSecretStore, setSecretStore, type SecretStore } from '#core/secret-store.js'
import { ModelKeyError, clearModelProviderKey, describeModelProviders, setModelProviderKey } from '#web/global-config.js'

class MemoryStore implements SecretStore {
  shared = new Map<string, string>()
  readAgentValues() { return {} }
  setShared(name: string, value: string) { this.shared.set(name, value) }
  unsetShared(name: string) { this.shared.delete(name) }
  setAgent() {}
  unsetAgent() {}
}

const KEY = 'sk-ant-test-0123456789abcdef'
let original: SecretStore
let store: MemoryStore

beforeEach(() => {
  original = getSecretStore()
  store = new MemoryStore()
  setSecretStore(store)
  delete process.env.ANTHROPIC_API_KEY
})
afterEach(() => {
  setSecretStore(original)
  delete process.env.ANTHROPIC_API_KEY
})

describe('model provider keys', () => {
  it('saves through the secret store, applies it at once, and never reports it back', async () => {
    await setModelProviderKey('anthropic', `  ${KEY}\n`)
    expect(store.shared.get('ANTHROPIC_API_KEY')).toBe(KEY)
    expect(process.env.ANTHROPIC_API_KEY).toBe(KEY)
    const view = describeModelProviders([], () => undefined)
    expect(view.providers.find((p) => p.provider === 'anthropic')?.configured).toBe(true)
    expect(JSON.stringify(view)).not.toContain(KEY)
  })

  it('removes a key', async () => {
    await setModelProviderKey('anthropic', KEY)
    await clearModelProviderKey('anthropic')
    expect(store.shared.has('ANTHROPIC_API_KEY')).toBe(false)
    expect(process.env.ANTHROPIC_API_KEY).toBeUndefined()
  })

  it('refuses unknown providers and values that are not a single key', async () => {
    await expect(setModelProviderKey('acme', KEY)).rejects.toThrow(ModelKeyError)
    await expect(clearModelProviderKey('acme')).rejects.toThrow(ModelKeyError)
    for (const bad of ['', 'short', 'two words here', 'line\nbreak-0123456789', 'x'.repeat(501), 42]) {
      await expect(setModelProviderKey('anthropic', bad)).rejects.toThrow(ModelKeyError)
    }
    expect(store.shared.size).toBe(0)
  })
})

describe('env files', () => {
  let dir: string
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'le-env-')) })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('are written owner-only, including one that existed with wider permissions', () => {
    writeFileSync(join(dir, '.env'), 'OTHER=1\n', { mode: 0o644 })
    new FileSecretStore().setAgent('a', dir, 'TOKEN', 'secret')
    expect(statSync(join(dir, '.env')).mode & 0o777).toBe(0o600)
    new FileSecretStore().unsetAgent('a', dir, 'OTHER')
    expect(statSync(join(dir, '.env')).mode & 0o777).toBe(0o600)
  })
})
