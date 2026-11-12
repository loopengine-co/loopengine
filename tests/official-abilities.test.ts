import { afterEach, describe, expect, it, vi } from 'vitest'
import { UnofficialAbilityError, assertOfficialAbility, publicNpmPackage } from '#core/official-abilities.js'
import { searchPublicAbilities } from '#web/abilities-admin.js'

afterEach(() => {
  delete process.env.LOOPENGINE_ALLOW_UNOFFICIAL_ABILITIES
  vi.unstubAllGlobals()
})

describe('official abilities', () => {
  it('tells a public npm package from the workspace\'s own abilities', () => {
    expect(publicNpmPackage('lp-gmail')).toBe('lp-gmail')
    expect(publicNpmPackage('lp-gmail@1.2.0')).toBe('lp-gmail')
    expect(publicNpmPackage('@someone/evil-ability')).toBe('@someone/evil-ability')
    expect(publicNpmPackage('file:/data/project/.abilities/mcp-linear')).toBeUndefined()
    expect(publicNpmPackage('github:everymarket/order-tools')).toBeUndefined()
    expect(publicNpmPackage('git+https://github.com/a/b.git#v1')).toBeUndefined()
  })

  it("installs what's under LoopEngine's npm organisation", () => {
    expect(() => assertOfficialAbility('@loopengine-co/gmail')).not.toThrow()
    expect(() => assertOfficialAbility('@loopengine-co/gmail@1.2.0')).not.toThrow()
  })

  it('refuses every other public package, the older lp-* ones and look-alike scopes too', () => {
    expect(() => assertOfficialAbility('lp-gmail')).toThrow(UnofficialAbilityError)
    expect(() => assertOfficialAbility('lp-gmail@1.1.0')).toThrow(/isn't an official LoopEngine ability/)
    expect(() => assertOfficialAbility('@loopengine-c0/gmail')).toThrow(/@loopengine-co/)
    expect(() => assertOfficialAbility('someones-ability')).toThrow(UnofficialAbilityError)
  })

  it('leaves the workspace\'s own abilities alone, and can be turned off for development', () => {
    expect(() => assertOfficialAbility('file:/data/project/.abilities/mcp-linear')).not.toThrow()
    expect(() => assertOfficialAbility('github:everymarket/order-tools')).not.toThrow()
    process.env.LOOPENGINE_ALLOW_UNOFFICIAL_ABILITIES = '1'
    expect(() => assertOfficialAbility('lp-gmail')).not.toThrow()
  })

  it('lists only abilities under the official scope', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      objects: [
        { package: { name: 'lp-gmail', description: 'Gmail', version: '1.1.0' } },
        { package: { name: 'lp-gmail-free', description: 'Totally Gmail', version: '9.9.9' } },
        { package: { name: '@loopengine-co/gmail', description: 'Gmail', version: '1.0.0' } },
      ],
    }))))
    expect((await searchPublicAbilities()).map((a) => a.name)).toEqual(['@loopengine-co/gmail'])
  })
  it('matches a search word by word, the best match first', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      objects: [
        { package: { name: '@loopengine-co/gmail', description: 'Search and read email', version: '1.0.0' } },
        { package: { name: '@loopengine-co/reddit', description: 'Search Reddit posts and read their comments', version: '1.0.0' } },
        { package: { name: '@loopengine-co/shopify', description: 'Orders and refunds', version: '1.0.0' } },
      ],
    }))))
    expect((await searchPublicAbilities('reddit posts')).map((a) => a.name)).toEqual(['@loopengine-co/reddit'])
    expect((await searchPublicAbilities('search Reddit')).map((a) => a.name)).toEqual(['@loopengine-co/reddit', '@loopengine-co/gmail'])
    expect(await searchPublicAbilities('stripe')).toEqual([])
  })
})
