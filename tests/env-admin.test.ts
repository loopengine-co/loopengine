import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { listDeclaredEnvVars, setEnvVar, unsetEnvVar, setAgentEnvVar, unsetAgentEnvVar, agentScopedEnvVarName, EnvVarNameError } from '../web/env-admin.js'
import { createAgentEnv } from '../core/agent-env.js'

// Same fixture-agent-under-the-real-agents-dir approach as
// tests/actauth-admin.test.ts — env-admin.ts has no live-registry
// mutation to worry about (unlike ability-manager.ts's own tests), so a
// single shared constant name is fine here.
const AGENT_NAME = 'env-admin-fixture-agent'
const AGENT_DIR = join(process.cwd(), 'agents', AGENT_NAME)

// setEnvVar's own envFilePath() (web/env-admin.ts) is process.cwd()-
// relative, not injectable — so unlike every other admin module's
// tests, this one really does touch this developer's actual .env, which
// may hold real secrets (LOOPENGINE_ADMIN_AUTH, model API keys, ...).
// Snapshotting its exact byte content once, before any test runs, and
// restoring that same snapshot after *every* test (not chaining
// incremental diffs) is what makes this safe to run at all — never
// logged, never asserted on, just carried through opaquely.
const envPath = join(process.cwd(), '.env')
const pristineEnvContent = existsSync(envPath) ? readFileSync(envPath, 'utf8') : null
const pristineProcessEnvKeys = new Set(Object.keys(process.env))

afterEach(() => {
  rmSync(AGENT_DIR, { recursive: true, force: true })
  if (pristineEnvContent === null) {
    rmSync(envPath, { force: true })
  } else {
    writeFileSync(envPath, pristineEnvContent)
  }
  for (const key of Object.keys(process.env)) {
    if (!pristineProcessEnvKeys.has(key)) delete process.env[key]
  }
})

function writeProvenance(record: unknown): void {
  mkdirSync(AGENT_DIR, { recursive: true })
  writeFileSync(join(AGENT_DIR, '.loopengine-abilities.json'), JSON.stringify(record, null, 2))
}

function abilityWithEnv(env: unknown[]): unknown {
  return { 'ability-a': { version: '1.0.0', tools: [], skills: [], actauthRules: [], contentHashes: {}, env } }
}

describe('listDeclaredEnvVars', () => {
  it('returns [] when no ability has been installed for this agent', async () => {
    expect(listDeclaredEnvVars(AGENT_NAME)).toEqual([])
  })

  it('lists every declared var across every installed ability, with live set/not-set status and, for a non-secret var, its live value', async () => {
    delete process.env.LOOPENGINE_TEST_FIXTURE_VAR_A
    process.env.LOOPENGINE_TEST_FIXTURE_VAR_B = 'already-set'
    writeProvenance({
      'ability-a': { version: '1.0.0', tools: [], skills: [], actauthRules: [], contentHashes: {}, env: [{ name: 'LOOPENGINE_TEST_FIXTURE_VAR_A', description: 'from a', secret: true }] },
      'ability-b': { version: '1.0.0', tools: [], skills: [], actauthRules: [], contentHashes: {}, env: [{ name: 'LOOPENGINE_TEST_FIXTURE_VAR_B', description: 'from b', secret: false }] },
    })

    const vars = listDeclaredEnvVars(AGENT_NAME)

    expect(vars).toEqual(
      expect.arrayContaining([
        { name: 'LOOPENGINE_TEST_FIXTURE_VAR_A', description: 'from a', slot: 'shared', scope: 'shared', secret: true, abilityNames: ['ability-a'], set: false },
        { name: 'LOOPENGINE_TEST_FIXTURE_VAR_B', description: 'from b', slot: 'shared', scope: 'shared', secret: false, abilityNames: ['ability-b'], set: true, value: 'already-set' },
      ]),
    )
  })

  it('never includes a value for a secret var, even when it is set', async () => {
    process.env.LOOPENGINE_TEST_FIXTURE_VAR_SECRET = 'sk-should-not-be-echoed'
    writeProvenance({
      'ability-a': { version: '1.0.0', tools: [], skills: [], actauthRules: [], contentHashes: {}, env: [{ name: 'LOOPENGINE_TEST_FIXTURE_VAR_SECRET', secret: true }] },
    })

    const vars = listDeclaredEnvVars(AGENT_NAME)
    expect(vars[0].set).toBe(true)
    expect(vars[0].value).toBeUndefined()
  })

  it('merges a name declared by more than one ability into one row, listing every ability instead of hiding all but the first', async () => {
    writeProvenance({
      'ability-a': { version: '1.0.0', tools: [], skills: [], actauthRules: [], contentHashes: {}, env: [{ name: 'LOOPENGINE_TEST_FIXTURE_SHARED', description: 'from a' }] },
      'ability-b': { version: '1.0.0', tools: [], skills: [], actauthRules: [], contentHashes: {}, env: [{ name: 'LOOPENGINE_TEST_FIXTURE_SHARED', description: 'from b' }] },
    })

    const vars = listDeclaredEnvVars(AGENT_NAME)
    expect(vars).toHaveLength(1)
    expect(vars[0].abilityNames).toEqual(['ability-a', 'ability-b'])
    expect(vars[0].description).toBe('from a')
  })

  it('treats a name as secret if any declaring ability marks it secret, even if another one checked first does not, and drops any value already picked up under the non-secret declaration', async () => {
    process.env.LOOPENGINE_TEST_FIXTURE_SHARED = 'sk-should-not-be-echoed'
    writeProvenance({
      'ability-a': { version: '1.0.0', tools: [], skills: [], actauthRules: [], contentHashes: {}, env: [{ name: 'LOOPENGINE_TEST_FIXTURE_SHARED', secret: false }] },
      'ability-b': { version: '1.0.0', tools: [], skills: [], actauthRules: [], contentHashes: {}, env: [{ name: 'LOOPENGINE_TEST_FIXTURE_SHARED', secret: true }] },
    })

    const vars = listDeclaredEnvVars(AGENT_NAME)
    expect(vars).toHaveLength(1)
    expect(vars[0].secret).toBe(true)
    expect(vars[0].value).toBeUndefined()
  })

  it('gives an overridable var a shared row plus an agent row read from the agent\'s own .env', async () => {
    process.env.LOOPENGINE_TEST_FIXTURE_CHAT = 'shared-chat'
    writeProvenance(abilityWithEnv([{ name: 'LOOPENGINE_TEST_FIXTURE_CHAT', description: 'chat id', scope: 'overridable' }]))
    writeFileSync(join(AGENT_DIR, '.env'), 'LOOPENGINE_TEST_FIXTURE_CHAT=agent-chat\n')

    const vars = listDeclaredEnvVars(AGENT_NAME)
    expect(vars).toHaveLength(2)
    expect(vars.find((v) => v.slot === 'shared')).toMatchObject({ name: 'LOOPENGINE_TEST_FIXTURE_CHAT', scope: 'overridable', set: true, value: 'shared-chat', description: 'chat id' })
    const agentRow = vars.find((v) => v.slot === 'agent')
    expect(agentRow).toMatchObject({ name: 'LOOPENGINE_TEST_FIXTURE_CHAT', scope: 'overridable', set: true, value: 'agent-chat', source: 'agent', abilityNames: ['ability-a'] })
    expect(agentRow?.description).toContain('falls back to the shared value')
  })

  it('treats the legacy perAgent: true as overridable, and reports a value still held in the old prefixed var', async () => {
    process.env[agentScopedEnvVarName(AGENT_NAME, 'LOOPENGINE_TEST_FIXTURE_PERAGENT')] = 'override-value'
    writeProvenance(abilityWithEnv([{ name: 'LOOPENGINE_TEST_FIXTURE_PERAGENT', perAgent: true }]))

    const agentRow = listDeclaredEnvVars(AGENT_NAME).find((v) => v.slot === 'agent')
    expect(agentRow).toMatchObject({
      scope: 'overridable',
      set: true,
      value: 'override-value',
      source: 'legacy',
      legacyName: agentScopedEnvVarName(AGENT_NAME, 'LOOPENGINE_TEST_FIXTURE_PERAGENT'),
    })
  })

  it('gives an agent-scoped var only an agent row, never a shared one', async () => {
    process.env.LOOPENGINE_TEST_FIXTURE_TOKEN = 'project-token'
    writeProvenance(abilityWithEnv([{ name: 'LOOPENGINE_TEST_FIXTURE_TOKEN', secret: true, scope: 'agent' }]))

    const vars = listDeclaredEnvVars(AGENT_NAME)
    expect(vars).toHaveLength(1)
    expect(vars[0]).toMatchObject({ slot: 'agent', scope: 'agent', set: false, secret: true })
  })

  it('drops the shared row when another ability declares the same name agent-scoped', async () => {
    writeProvenance({
      'ability-a': { version: '1.0.0', tools: [], skills: [], actauthRules: [], contentHashes: {}, env: [{ name: 'LOOPENGINE_TEST_FIXTURE_MIXED', scope: 'overridable' }] },
      'ability-b': { version: '1.0.0', tools: [], skills: [], actauthRules: [], contentHashes: {}, env: [{ name: 'LOOPENGINE_TEST_FIXTURE_MIXED', scope: 'agent' }] },
    })

    const vars = listDeclaredEnvVars(AGENT_NAME)
    expect(vars).toHaveLength(1)
    expect(vars[0]).toMatchObject({ slot: 'agent', scope: 'agent', abilityNames: ['ability-a', 'ability-b'] })
  })

  it('does not add an agent row for a shared var', async () => {
    writeProvenance(abilityWithEnv([{ name: 'LOOPENGINE_TEST_FIXTURE_NOT_PERAGENT' }]))

    const vars = listDeclaredEnvVars(AGENT_NAME)
    expect(vars).toHaveLength(1)
    expect(vars[0].slot).toBe('shared')
  })
})

describe('setAgentEnvVar / unsetAgentEnvVar', () => {
  beforeEach(() => mkdirSync(AGENT_DIR, { recursive: true }))

  it('writes to the agent\'s own .env, never to process.env or the project .env', async () => {
    await setAgentEnvVar(AGENT_NAME, 'LOOPENGINE_TEST_FIXTURE_AGENT_ONLY', 'has a space')

    expect(readFileSync(join(AGENT_DIR, '.env'), 'utf8')).toBe("LOOPENGINE_TEST_FIXTURE_AGENT_ONLY='has a space'\n")
    expect(process.env.LOOPENGINE_TEST_FIXTURE_AGENT_ONLY).toBeUndefined()
    expect(existsSync(envPath) ? readFileSync(envPath, 'utf8') : '').not.toContain('LOOPENGINE_TEST_FIXTURE_AGENT_ONLY')
  })

  it('removes the agent\'s own value and the legacy prefixed var for it', async () => {
    const legacy = agentScopedEnvVarName(AGENT_NAME, 'LOOPENGINE_TEST_FIXTURE_AGENT_RM')
    await setEnvVar(legacy, 'old')
    await setAgentEnvVar(AGENT_NAME, 'LOOPENGINE_TEST_FIXTURE_AGENT_RM', 'new')

    await unsetAgentEnvVar(AGENT_NAME, 'LOOPENGINE_TEST_FIXTURE_AGENT_RM')

    expect(readFileSync(join(AGENT_DIR, '.env'), 'utf8')).not.toContain('LOOPENGINE_TEST_FIXTURE_AGENT_RM')
    expect(process.env[legacy]).toBeUndefined()
    expect(readFileSync(envPath, 'utf8')).not.toContain(legacy)
  })
})

describe('createAgentEnv', () => {
  beforeEach(() => mkdirSync(AGENT_DIR, { recursive: true }))

  it('prefers the agent\'s own value, then the legacy prefixed var, then the shared one', async () => {
    process.env.LOOPENGINE_TEST_FIXTURE_ORDER = 'shared'
    const env = createAgentEnv(AGENT_NAME, AGENT_DIR)
    expect(env.get('LOOPENGINE_TEST_FIXTURE_ORDER')).toBe('shared')

    process.env[agentScopedEnvVarName(AGENT_NAME, 'LOOPENGINE_TEST_FIXTURE_ORDER')] = 'legacy'
    expect(env.get('LOOPENGINE_TEST_FIXTURE_ORDER')).toBe('legacy')

    await setAgentEnvVar(AGENT_NAME, 'LOOPENGINE_TEST_FIXTURE_ORDER', 'own')
    expect(env.get('LOOPENGINE_TEST_FIXTURE_ORDER')).toBe('own')
  })

  it('keeps two agents\' values apart', async () => {
    const otherDir = join(process.cwd(), 'agents', 'env-admin-fixture-other')
    try {
      mkdirSync(otherDir, { recursive: true })
      await setAgentEnvVar(AGENT_NAME, 'LOOPENGINE_TEST_FIXTURE_TWO', 'one')
      await setAgentEnvVar('env-admin-fixture-other', 'LOOPENGINE_TEST_FIXTURE_TWO', 'two')
      expect(createAgentEnv(AGENT_NAME, AGENT_DIR).get('LOOPENGINE_TEST_FIXTURE_TWO')).toBe('one')
      expect(createAgentEnv('env-admin-fixture-other', otherDir).get('LOOPENGINE_TEST_FIXTURE_TWO')).toBe('two')
    } finally {
      rmSync(otherDir, { recursive: true, force: true })
    }
  })

  it('never falls back to the shared value for an agent-scoped var, and require() names the agent', async () => {
    process.env.LOOPENGINE_TEST_FIXTURE_BOT = 'someone-elses-token'
    writeProvenance(abilityWithEnv([{ name: 'LOOPENGINE_TEST_FIXTURE_BOT', scope: 'agent' }]))
    const env = createAgentEnv(AGENT_NAME, AGENT_DIR)

    expect(env.get('LOOPENGINE_TEST_FIXTURE_BOT')).toBeUndefined()
    expect(() => env.require('LOOPENGINE_TEST_FIXTURE_BOT')).toThrow(`LOOPENGINE_TEST_FIXTURE_BOT is not set for agent '${AGENT_NAME}'`)

    await setAgentEnvVar(AGENT_NAME, 'LOOPENGINE_TEST_FIXTURE_BOT', 'my-token')
    expect(env.require('LOOPENGINE_TEST_FIXTURE_BOT')).toBe('my-token')
  })
})

describe('agentScopedEnvVarName', () => {
  it('upper-cases the agent name and joins it to the var name with an underscore', async () => {
    expect(agentScopedEnvVarName('support', 'SLACK_DEFAULT_CHANNEL')).toBe('SUPPORT_SLACK_DEFAULT_CHANNEL')
  })

  it('turns a hyphenated agent name into underscores', async () => {
    expect(agentScopedEnvVarName('customer-service', 'SLACK_DEFAULT_CHANNEL')).toBe('CUSTOMER_SERVICE_SLACK_DEFAULT_CHANNEL')
  })

  it('prefixes an extra underscore when the agent name would otherwise start with a digit', async () => {
    expect(agentScopedEnvVarName('2nd-agent', 'SLACK_DEFAULT_CHANNEL')).toBe('_2ND_AGENT_SLACK_DEFAULT_CHANNEL')
  })
})

describe('setEnvVar', () => {
  it('appends a new KEY=VALUE line to .env and applies it to process.env immediately', async () => {
    await setEnvVar('LOOPENGINE_TEST_FIXTURE_NEW', 'hello')

    expect(process.env.LOOPENGINE_TEST_FIXTURE_NEW).toBe('hello')
    expect(readFileSync(envPath, 'utf8')).toContain('LOOPENGINE_TEST_FIXTURE_NEW=hello')
  })

  it('preserves every other line, including comments, when upserting', async () => {
    const before = existsSync(envPath) ? readFileSync(envPath, 'utf8') : ''
    await setEnvVar('LOOPENGINE_TEST_FIXTURE_ANOTHER', 'value1')

    const after = readFileSync(envPath, 'utf8')
    for (const line of before.split('\n')) {
      if (line.trim() === '') continue
      expect(after).toContain(line)
    }
  })

  it('replaces an existing key in place rather than duplicating it', async () => {
    await setEnvVar('LOOPENGINE_TEST_FIXTURE_REPLACE', 'first')
    await setEnvVar('LOOPENGINE_TEST_FIXTURE_REPLACE', 'second')

    const content = readFileSync(envPath, 'utf8')
    expect(content.match(/LOOPENGINE_TEST_FIXTURE_REPLACE=/g)).toHaveLength(1)
    expect(content).toContain('LOOPENGINE_TEST_FIXTURE_REPLACE=second')
    expect(process.env.LOOPENGINE_TEST_FIXTURE_REPLACE).toBe('second')
  })

  it('single-quotes a value containing whitespace, matching how it would need to read back', async () => {
    await setEnvVar('LOOPENGINE_TEST_FIXTURE_SPACED', 'has a space')

    expect(readFileSync(envPath, 'utf8')).toContain("LOOPENGINE_TEST_FIXTURE_SPACED='has a space'")
  })

  it('single-quotes a value round-trips a real embedded newline, a literal double-quote, and a literal backslash all at once — Node\'s --env-file has no escape support inside a double-quoted value for any of these', async () => {
    const jsonLike = '{\n  "private_key": "line1\\nline2"\n}'
    await setEnvVar('LOOPENGINE_TEST_FIXTURE_JSONLIKE', jsonLike)

    const written = readFileSync(envPath, 'utf8')
    expect(written).toContain(`LOOPENGINE_TEST_FIXTURE_JSONLIKE='${jsonLike}'`)
    expect(process.env.LOOPENGINE_TEST_FIXTURE_JSONLIKE).toBe(jsonLike)
  })

  it('falls back to double-quoting (escaped) when the value itself contains a literal single quote', async () => {
    await setEnvVar('LOOPENGINE_TEST_FIXTURE_APOSTROPHE', "it's here")

    expect(readFileSync(envPath, 'utf8')).toContain('LOOPENGINE_TEST_FIXTURE_APOSTROPHE="it\'s here"')
    expect(process.env.LOOPENGINE_TEST_FIXTURE_APOSTROPHE).toBe("it's here")
  })

  it('throws EnvVarNameError for a name that is not valid uppercase_snake_case', async () => {
    await expect(setEnvVar('not-valid', 'x')).rejects.toThrow(EnvVarNameError)
    await expect(setEnvVar('lowercase', 'x')).rejects.toThrow(EnvVarNameError)
    await expect(setEnvVar('1STARTS_WITH_DIGIT', 'x')).rejects.toThrow(EnvVarNameError)
  })
})

describe('unsetEnvVar', () => {
  it('removes the KEY=VALUE line from .env and clears it from process.env immediately', async () => {
    await setEnvVar('LOOPENGINE_TEST_FIXTURE_REMOVE', 'hello')
    expect(readFileSync(envPath, 'utf8')).toContain('LOOPENGINE_TEST_FIXTURE_REMOVE=')

    await unsetEnvVar('LOOPENGINE_TEST_FIXTURE_REMOVE')

    expect(process.env.LOOPENGINE_TEST_FIXTURE_REMOVE).toBeUndefined()
    expect(readFileSync(envPath, 'utf8')).not.toContain('LOOPENGINE_TEST_FIXTURE_REMOVE')
  })

  it('preserves every other line, including comments, when removing one key', async () => {
    await setEnvVar('LOOPENGINE_TEST_FIXTURE_KEEP', 'kept')
    await setEnvVar('LOOPENGINE_TEST_FIXTURE_DROP', 'dropped')

    await unsetEnvVar('LOOPENGINE_TEST_FIXTURE_DROP')

    const after = readFileSync(envPath, 'utf8')
    expect(after).toContain('LOOPENGINE_TEST_FIXTURE_KEEP=kept')
    expect(after).not.toContain('LOOPENGINE_TEST_FIXTURE_DROP')
  })

  it('is a no-op, not an error, when the var was never set in .env to begin with', async () => {
    await expect(unsetEnvVar('LOOPENGINE_TEST_FIXTURE_NEVER_SET')).resolves.toBeUndefined()
    expect(process.env.LOOPENGINE_TEST_FIXTURE_NEVER_SET).toBeUndefined()
  })

  it('is a no-op when .env does not exist at all', async () => {
    rmSync(envPath, { force: true })
    await expect(unsetEnvVar('LOOPENGINE_TEST_FIXTURE_NO_FILE')).resolves.toBeUndefined()
  })

  it('throws EnvVarNameError for a name that is not valid uppercase_snake_case', async () => {
    await expect(unsetEnvVar('not-valid')).rejects.toThrow(EnvVarNameError)
  })
})
