import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  ABILITY_SOURCES_FILE_ENV,
  AbilitySourceError,
  abilityFetchAuth,
  abilityOrigin,
  listSourceAbilities,
  readAbilitySources,
  removeAbilitySource,
  saveAbilitySource,
  sourceTokenVar,
  validateAbilitySource,
  type AbilitySource,
} from '#core/ability-sources.js'

let dir: string
const tokenVars: string[] = []

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'le-sources-'))
  process.env[ABILITY_SOURCES_FILE_ENV] = join(dir, 'ability-sources.yml')
})
afterEach(() => {
  delete process.env[ABILITY_SOURCES_FILE_ENV]
  for (const v of tokenVars.splice(0)) delete process.env[v]
  rmSync(dir, { recursive: true, force: true })
})

function setToken(id: string, token: string) {
  const v = sourceTokenVar(id)
  tokenVars.push(v)
  process.env[v] = token
}

function abilityDir(root: string, name: string, pkg: Record<string, unknown> = {}) {
  const d = join(root, name)
  mkdirSync(d, { recursive: true })
  writeFileSync(join(d, 'loopengine.ability.json'), JSON.stringify({ tools: [] }))
  writeFileSync(join(d, 'package.json'), JSON.stringify({ name, version: '1.0.0', description: `${name} ability`, ...pkg }))
  return d
}

type Reply = { status?: number; body: unknown }
function fakeFetch(routes: Record<string, Reply>, seen: Array<{ url: string; auth: string | null }> = []): typeof fetch {
  return (async (url: string, init?: RequestInit) => {
    const headers = new Headers(init?.headers)
    seen.push({ url, auth: headers.get('authorization') })
    const reply = routes[url] ?? { status: 404, body: { message: 'Not Found' } }
    return new Response(JSON.stringify(reply.body), { status: reply.status ?? 200, headers: { 'content-type': 'application/json' } })
  }) as typeof fetch
}

describe('validating a source', () => {
  it('accepts a GitHub owner, an npm scope with its registry, and a folder, making up an id', () => {
    expect(validateAbilitySource({ type: 'github', owner: 'https://github.com/loopengine-co/' })).toEqual({ id: 'github-loopengine-co', type: 'github', owner: 'loopengine-co' })
    expect(validateAbilitySource({ type: 'npm', registry: 'https://npm.pkg.github.com/', scope: '@everymarket' })).toEqual({ id: 'npm-everymarket', type: 'npm', registry: 'https://npm.pkg.github.com', scope: '@everymarket' })
    expect(validateAbilitySource({ type: 'folder', path: '../loopengine-abilities' })).toEqual({ id: 'folder-loopengine-abilities', type: 'folder', path: '../loopengine-abilities' })
  })

  it('refuses an unknown type, a bad owner, a registry without a scope, and a bad id', () => {
    expect(() => validateAbilitySource({ type: 'svn' })).toThrow(AbilitySourceError)
    expect(() => validateAbilitySource({ type: 'github', owner: 'not an owner' })).toThrow(/GitHub org or user/)
    expect(() => validateAbilitySource({ type: 'npm', registry: 'https://npm.example.com' })).toThrow(/scope/)
    expect(() => validateAbilitySource({ type: 'folder', path: 'x', id: 'Bad Id' })).toThrow(/id must be/)
  })
})

describe('ability-sources.yml', () => {
  it('saves, replaces by id, and removes sources, never writing a token', () => {
    setToken('github-loopengine-co', 'ghp_secret_token_123')
    saveAbilitySource({ type: 'github', owner: 'loopengine-co' })
    saveAbilitySource({ type: 'folder', path: '../abilities' })
    saveAbilitySource({ type: 'folder', id: 'folder-abilities', path: '../other' })

    expect(readAbilitySources()).toEqual([
      { id: 'github-loopengine-co', type: 'github', owner: 'loopengine-co' },
      { id: 'folder-abilities', type: 'folder', path: '../other' },
    ])
    expect(readFileSync(join(dir, 'ability-sources.yml'), 'utf8')).not.toContain('ghp_secret')

    removeAbilitySource('github-loopengine-co')
    removeAbilitySource('folder-abilities')
    expect(existsSync(join(dir, 'ability-sources.yml'))).toBe(false)
  })
})

describe('listing what a source offers', () => {
  it('lists the ability folders in a folder, or the folder itself when it is one', async () => {
    const root = join(dir, 'abilities')
    abilityDir(root, 'lp-github')
    abilityDir(root, 'lp-em-freescout', { version: '1.2.0' })
    mkdirSync(join(root, 'not-an-ability'))

    const listed = await listSourceAbilities({ id: 'f', type: 'folder', path: root })
    expect(listed.map((a) => [a.name, a.version, a.spec])).toEqual([
      ['lp-em-freescout', '1.2.0', `file:${join(root, 'lp-em-freescout')}`],
      ['lp-github', '1.0.0', `file:${join(root, 'lp-github')}`],
    ])
    expect(await listSourceAbilities({ id: 'g', type: 'folder', path: join(root, 'lp-github') })).toHaveLength(1)
    await expect(listSourceAbilities({ id: 'h', type: 'folder', path: join(dir, 'missing') })).rejects.toThrow(/isn't a folder/)
  })

  it("lists a GitHub org's repos that hold an ability, with the saved token", async () => {
    setToken('github-acme', 'ghp_token_abcdef')
    const pkg = (o: object) => ({ content: Buffer.from(JSON.stringify(o)).toString('base64') })
    const seen: Array<{ url: string; auth: string | null }> = []
    const doFetch = fakeFetch({
      'https://api.github.com/orgs/acme/repos?per_page=100&type=all': { body: [{ name: 'lp-orders', owner: { login: 'acme' } }, { name: 'website', owner: { login: 'acme' } }, { name: 'old', owner: { login: 'acme' }, archived: true }] },
      'https://api.github.com/repos/acme/lp-orders/contents/loopengine.ability.json': { body: {} },
      'https://api.github.com/repos/acme/lp-orders/contents/package.json': { body: pkg({ name: 'lp-orders', version: '2.1.0', description: 'Order lookups' }) },
    }, seen)

    const listed = await listSourceAbilities({ id: 'github-acme', type: 'github', owner: 'acme' }, { fetch: doFetch })
    expect(listed).toEqual([{ name: 'lp-orders', version: '2.1.0', description: 'Order lookups', spec: 'github:acme/lp-orders' }])
    expect(seen.every((s) => s.auth === 'Bearer ghp_token_abcdef')).toBe(true)
    expect(seen.some((s) => s.url.includes('/old/'))).toBe(false)
  })

  it('explains a GitHub token GitHub refuses', async () => {
    const doFetch = fakeFetch({ 'https://api.github.com/orgs/acme2/repos?per_page=100&type=all': { status: 401, body: {} } })
    await expect(listSourceAbilities({ id: 'github-acme2', type: 'github', owner: 'acme2' }, { fetch: doFetch })).rejects.toThrow(/refused the token/)
  })

  it("lists a private registry's abilities in its scope, and says when it can't be searched", async () => {
    const source: AbilitySource = { id: 'npm-acme', type: 'npm', registry: 'https://npm.acme.dev', scope: '@acme' }
    const url = `https://npm.acme.dev/-/v1/search?text=${encodeURIComponent('keywords:loopengine-ability @acme')}&size=100`
    const listed = await listSourceAbilities(source, {
      fetch: fakeFetch({ [url]: { body: { objects: [{ package: { name: '@acme/lp-billing', version: '0.3.0' } }, { package: { name: 'lp-public', version: '1.0.0' } }] } } }),
    })
    expect(listed).toEqual([{ name: '@acme/lp-billing', version: '0.3.0', description: '', spec: '@acme/lp-billing' }])

    await expect(listSourceAbilities({ ...source, id: 'npm-acme-2' }, { fetch: fakeFetch({}) })).rejects.toThrow(/can't be searched/)
  })
})

describe('where an installed ability came from', () => {
  const sources: AbilitySource[] = [
    { id: 'npm-acme', type: 'npm', registry: 'https://npm.acme.dev', scope: '@acme' },
    { id: 'folder-abilities', type: 'folder', path: '/srv/abilities' },
  ]
  it('labels npm names public, and git, folder and private-scope specs private', () => {
    expect(abilityOrigin('lp-gmail', 'lp-gmail', sources)).toEqual({ kind: 'public', label: 'npm' })
    expect(abilityOrigin(undefined, '@someone/lp-x', sources)).toEqual({ kind: 'public', label: 'npm' })
    expect(abilityOrigin('@acme/lp-billing', '@acme/lp-billing', sources)).toEqual({ kind: 'private', label: 'npm @acme (npm.acme.dev)' })
    expect(abilityOrigin('github:loopengine-co/lp-em-freescout', 'lp-em-freescout', sources)).toEqual({ kind: 'private', label: 'GitHub loopengine-co/lp-em-freescout' })
    expect(abilityOrigin('git+ssh://git@github.com/acme/lp-orders.git#v1', 'lp-orders', sources)).toEqual({ kind: 'private', label: 'GitHub acme/lp-orders' })
    expect(abilityOrigin('file:/srv/abilities/lp-github', 'lp-github', sources)).toEqual({ kind: 'private', label: 'Folder /srv/abilities' })
    expect(abilityOrigin('file:../elsewhere/lp-x', 'lp-x', sources)).toEqual({ kind: 'private', label: 'Folder ../elsewhere/lp-x' })
  })
})

describe('fetching with a source token', () => {
  it("gives git each GitHub owner's token as a URL rewrite, only in the child's env", () => {
    setToken('github-acme', 'ghp_token_abcdef')
    const auth = abilityFetchAuth([{ id: 'github-acme', type: 'github', owner: 'acme' }])
    const pairs = Array.from({ length: Number(auth.env.GIT_CONFIG_COUNT) }, (_, i) => [auth.env[`GIT_CONFIG_KEY_${i}`], auth.env[`GIT_CONFIG_VALUE_${i}`]])
    expect(pairs).toContainEqual(['url.https://x-access-token:ghp_token_abcdef@github.com/acme/.insteadOf', 'git@github.com:acme/'])
    expect(pairs).toContainEqual(['url.https://x-access-token:ghp_token_abcdef@github.com/acme/.insteadOf', 'https://github.com/acme/'])
    expect(auth.env.GIT_TERMINAL_PROMPT).toBe('0')
    expect(process.env.GIT_CONFIG_COUNT).toBeUndefined()
    expect(auth.args).toEqual([])
  })

  it("adds a private scope's registry and token to a temporary npm config, removed afterwards", () => {
    setToken('npm-acme', 'npm_token_123456')
    const auth = abilityFetchAuth([{ id: 'npm-acme', type: 'npm', registry: 'https://npm.acme.dev/registry', scope: '@acme' }])
    expect(auth.args[0]).toBe('--userconfig')
    const npmrc = readFileSync(auth.args[1], 'utf8')
    expect(npmrc).toContain('@acme:registry=https://npm.acme.dev/registry/')
    expect(npmrc).toContain('//npm.acme.dev/registry/:_authToken=npm_token_123456')
    auth.cleanup()
    expect(existsSync(auth.args[1])).toBe(false)
  })
})
