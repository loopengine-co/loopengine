import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { listDeclaredEnvVars, setEnvVar, unsetEnvVar, agentScopedEnvVarName, EnvVarNameError } from '../web/env-admin.js'

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

describe('listDeclaredEnvVars', () => {
  it('returns [] when no ability has been installed for this agent', () => {
    expect(listDeclaredEnvVars(AGENT_NAME)).toEqual([])
  })

  it('lists every declared var across every installed ability, with live set/not-set status and, for a non-secret var, its live value', () => {
    delete process.env.LOOPENGINE_TEST_FIXTURE_VAR_A
    process.env.LOOPENGINE_TEST_FIXTURE_VAR_B = 'already-set'
    writeProvenance({
      'ability-a': { version: '1.0.0', tools: [], skills: [], actauthRules: [], contentHashes: {}, env: [{ name: 'LOOPENGINE_TEST_FIXTURE_VAR_A', description: 'from a', secret: true }] },
      'ability-b': { version: '1.0.0', tools: [], skills: [], actauthRules: [], contentHashes: {}, env: [{ name: 'LOOPENGINE_TEST_FIXTURE_VAR_B', description: 'from b', secret: false }] },
    })

    const vars = listDeclaredEnvVars(AGENT_NAME)

    expect(vars).toEqual(
      expect.arrayContaining([
        { name: 'LOOPENGINE_TEST_FIXTURE_VAR_A', description: 'from a', secret: true, abilityNames: ['ability-a'], set: false },
        { name: 'LOOPENGINE_TEST_FIXTURE_VAR_B', description: 'from b', secret: false, abilityNames: ['ability-b'], set: true, value: 'already-set' },
      ]),
    )
  })

  it('never includes a value for a secret var, even when it is set', () => {
    process.env.LOOPENGINE_TEST_FIXTURE_VAR_SECRET = 'sk-should-not-be-echoed'
    writeProvenance({
      'ability-a': { version: '1.0.0', tools: [], skills: [], actauthRules: [], contentHashes: {}, env: [{ name: 'LOOPENGINE_TEST_FIXTURE_VAR_SECRET', secret: true }] },
    })

    const vars = listDeclaredEnvVars(AGENT_NAME)
    expect(vars[0].set).toBe(true)
    expect(vars[0].value).toBeUndefined()
  })

  it('merges a name declared by more than one ability into one row, listing every ability instead of hiding all but the first', () => {
    writeProvenance({
      'ability-a': { version: '1.0.0', tools: [], skills: [], actauthRules: [], contentHashes: {}, env: [{ name: 'LOOPENGINE_TEST_FIXTURE_SHARED', description: 'from a' }] },
      'ability-b': { version: '1.0.0', tools: [], skills: [], actauthRules: [], contentHashes: {}, env: [{ name: 'LOOPENGINE_TEST_FIXTURE_SHARED', description: 'from b' }] },
    })

    const vars = listDeclaredEnvVars(AGENT_NAME)
    expect(vars).toHaveLength(1)
    expect(vars[0].abilityNames).toEqual(['ability-a', 'ability-b'])
    expect(vars[0].description).toBe('from a')
  })

  it('treats a name as secret if any declaring ability marks it secret, even if another one checked first does not, and drops any value already picked up under the non-secret declaration', () => {
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

  it('adds a separate, independently set/unset override row for a perAgent var, alongside the shared one', () => {
    delete process.env.LOOPENGINE_TEST_FIXTURE_PERAGENT
    process.env[agentScopedEnvVarName(AGENT_NAME, 'LOOPENGINE_TEST_FIXTURE_PERAGENT')] = 'override-value'
    writeProvenance({
      'ability-a': {
        version: '1.0.0',
        tools: [],
        skills: [],
        actauthRules: [],
        contentHashes: {},
        env: [{ name: 'LOOPENGINE_TEST_FIXTURE_PERAGENT', description: 'shared default', secret: false, perAgent: true }],
      },
    })

    const vars = listDeclaredEnvVars(AGENT_NAME)
    expect(vars).toHaveLength(2)

    const shared = vars.find((v) => v.name === 'LOOPENGINE_TEST_FIXTURE_PERAGENT')
    expect(shared?.set).toBe(false)
    expect(shared?.description).toBe('shared default')

    const overrideName = agentScopedEnvVarName(AGENT_NAME, 'LOOPENGINE_TEST_FIXTURE_PERAGENT')
    const override = vars.find((v) => v.name === overrideName)
    expect(override?.set).toBe(true)
    expect(override?.value).toBe('override-value')
    expect(override?.abilityNames).toEqual(['ability-a'])
    expect(override?.description).toContain('Overrides LOOPENGINE_TEST_FIXTURE_PERAGENT for this agent only')
  })

  it('does not add an override row for a var that is not declared perAgent', () => {
    writeProvenance({
      'ability-a': { version: '1.0.0', tools: [], skills: [], actauthRules: [], contentHashes: {}, env: [{ name: 'LOOPENGINE_TEST_FIXTURE_NOT_PERAGENT' }] },
    })

    const vars = listDeclaredEnvVars(AGENT_NAME)
    expect(vars).toHaveLength(1)
  })
})

describe('agentScopedEnvVarName', () => {
  it('upper-cases the agent name and joins it to the var name with an underscore', () => {
    expect(agentScopedEnvVarName('support', 'SLACK_DEFAULT_CHANNEL')).toBe('SUPPORT_SLACK_DEFAULT_CHANNEL')
  })

  it('turns a hyphenated agent name into underscores', () => {
    expect(agentScopedEnvVarName('customer-service', 'SLACK_DEFAULT_CHANNEL')).toBe('CUSTOMER_SERVICE_SLACK_DEFAULT_CHANNEL')
  })

  it('prefixes an extra underscore when the agent name would otherwise start with a digit', () => {
    expect(agentScopedEnvVarName('2nd-agent', 'SLACK_DEFAULT_CHANNEL')).toBe('_2ND_AGENT_SLACK_DEFAULT_CHANNEL')
  })
})

describe('setEnvVar', () => {
  it('appends a new KEY=VALUE line to .env and applies it to process.env immediately', () => {
    setEnvVar('LOOPENGINE_TEST_FIXTURE_NEW', 'hello')

    expect(process.env.LOOPENGINE_TEST_FIXTURE_NEW).toBe('hello')
    expect(readFileSync(envPath, 'utf8')).toContain('LOOPENGINE_TEST_FIXTURE_NEW=hello')
  })

  it('preserves every other line, including comments, when upserting', () => {
    const before = existsSync(envPath) ? readFileSync(envPath, 'utf8') : ''
    setEnvVar('LOOPENGINE_TEST_FIXTURE_ANOTHER', 'value1')

    const after = readFileSync(envPath, 'utf8')
    for (const line of before.split('\n')) {
      if (line.trim() === '') continue
      expect(after).toContain(line)
    }
  })

  it('replaces an existing key in place rather than duplicating it', () => {
    setEnvVar('LOOPENGINE_TEST_FIXTURE_REPLACE', 'first')
    setEnvVar('LOOPENGINE_TEST_FIXTURE_REPLACE', 'second')

    const content = readFileSync(envPath, 'utf8')
    expect(content.match(/LOOPENGINE_TEST_FIXTURE_REPLACE=/g)).toHaveLength(1)
    expect(content).toContain('LOOPENGINE_TEST_FIXTURE_REPLACE=second')
    expect(process.env.LOOPENGINE_TEST_FIXTURE_REPLACE).toBe('second')
  })

  it('single-quotes a value containing whitespace, matching how it would need to read back', () => {
    setEnvVar('LOOPENGINE_TEST_FIXTURE_SPACED', 'has a space')

    expect(readFileSync(envPath, 'utf8')).toContain("LOOPENGINE_TEST_FIXTURE_SPACED='has a space'")
  })

  it('single-quotes a value round-trips a real embedded newline, a literal double-quote, and a literal backslash all at once — Node\'s --env-file has no escape support inside a double-quoted value for any of these', () => {
    const jsonLike = '{\n  "private_key": "line1\\nline2"\n}'
    setEnvVar('LOOPENGINE_TEST_FIXTURE_JSONLIKE', jsonLike)

    const written = readFileSync(envPath, 'utf8')
    expect(written).toContain(`LOOPENGINE_TEST_FIXTURE_JSONLIKE='${jsonLike}'`)
    expect(process.env.LOOPENGINE_TEST_FIXTURE_JSONLIKE).toBe(jsonLike)
  })

  it('falls back to double-quoting (escaped) when the value itself contains a literal single quote', () => {
    setEnvVar('LOOPENGINE_TEST_FIXTURE_APOSTROPHE', "it's here")

    expect(readFileSync(envPath, 'utf8')).toContain('LOOPENGINE_TEST_FIXTURE_APOSTROPHE="it\'s here"')
    expect(process.env.LOOPENGINE_TEST_FIXTURE_APOSTROPHE).toBe("it's here")
  })

  it('throws EnvVarNameError for a name that is not valid uppercase_snake_case', () => {
    expect(() => setEnvVar('not-valid', 'x')).toThrow(EnvVarNameError)
    expect(() => setEnvVar('lowercase', 'x')).toThrow(EnvVarNameError)
    expect(() => setEnvVar('1STARTS_WITH_DIGIT', 'x')).toThrow(EnvVarNameError)
  })
})

describe('unsetEnvVar', () => {
  it('removes the KEY=VALUE line from .env and clears it from process.env immediately', () => {
    setEnvVar('LOOPENGINE_TEST_FIXTURE_REMOVE', 'hello')
    expect(readFileSync(envPath, 'utf8')).toContain('LOOPENGINE_TEST_FIXTURE_REMOVE=')

    unsetEnvVar('LOOPENGINE_TEST_FIXTURE_REMOVE')

    expect(process.env.LOOPENGINE_TEST_FIXTURE_REMOVE).toBeUndefined()
    expect(readFileSync(envPath, 'utf8')).not.toContain('LOOPENGINE_TEST_FIXTURE_REMOVE')
  })

  it('preserves every other line, including comments, when removing one key', () => {
    setEnvVar('LOOPENGINE_TEST_FIXTURE_KEEP', 'kept')
    setEnvVar('LOOPENGINE_TEST_FIXTURE_DROP', 'dropped')

    unsetEnvVar('LOOPENGINE_TEST_FIXTURE_DROP')

    const after = readFileSync(envPath, 'utf8')
    expect(after).toContain('LOOPENGINE_TEST_FIXTURE_KEEP=kept')
    expect(after).not.toContain('LOOPENGINE_TEST_FIXTURE_DROP')
  })

  it('is a no-op, not an error, when the var was never set in .env to begin with', () => {
    expect(() => unsetEnvVar('LOOPENGINE_TEST_FIXTURE_NEVER_SET')).not.toThrow()
    expect(process.env.LOOPENGINE_TEST_FIXTURE_NEVER_SET).toBeUndefined()
  })

  it('is a no-op when .env does not exist at all', () => {
    rmSync(envPath, { force: true })
    expect(() => unsetEnvVar('LOOPENGINE_TEST_FIXTURE_NO_FILE')).not.toThrow()
  })

  it('throws EnvVarNameError for a name that is not valid uppercase_snake_case', () => {
    expect(() => unsetEnvVar('not-valid')).toThrow(EnvVarNameError)
  })
})
