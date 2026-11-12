import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { abilityDependencies, installMissingPackages } from '../core/ability-dependencies.js'

function project(): string {
  const dir = mkdtempSync(join(tmpdir(), 'loopengine-deps-'))
  mkdirSync(join(dir, 'agents', 'growth'), { recursive: true })
  mkdirSync(join(dir, 'agents', 'support'), { recursive: true })
  writeFileSync(join(dir, 'agents', 'growth', '.loopengine-abilities.json'), JSON.stringify({
    '@loopengine-co/x': { version: '1.0.0', dependencies: ['twitter-api-v2'] },
    '@loopengine-co/reddit': { version: '1.0.0', dependencies: [] },
  }))
  writeFileSync(join(dir, 'agents', 'support', '.loopengine-abilities.json'), JSON.stringify({ old: { version: '1.0.0' }, other: { dependencies: ['twitter-api-v2', '--registry=https://evil.example'] } }))
  return dir
}

describe('packages abilities need', () => {
  it('reads them from every agent\'s ability records', () => {
    expect(abilityDependencies(join(project(), 'agents')).sort()).toEqual(['--registry=https://evil.example', 'twitter-api-v2'])
    expect(abilityDependencies('/no/such/dir')).toEqual([])
  })

  it('installs only what the project lacks, and never anything that isn\'t a package name', async () => {
    const dir = project()
    mkdirSync(join(dir, 'node_modules', 'twitter-api-v2'), { recursive: true })
    // Present already, and the rest isn't a package name: npm never runs.
    expect(await installMissingPackages(dir, abilityDependencies(join(dir, 'agents')))).toEqual([])
  })
})
