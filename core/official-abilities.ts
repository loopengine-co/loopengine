// Official abilities: of the public ones on npm, only those LoopEngine
// publishes are listed and installed. Anyone can publish a package with the
// loopengine-ability keyword, or an lp-* name, and an ability runs code in
// the agent's server with the agent's keys; so "official" is decided by who
// can publish it: anything under the @loopengine-co scope, which only
// members of LoopEngine's npm organisation can publish to. The older
// unscoped ones (lp-gmail and the rest) aren't, and can't be installed or
// upgraded; their official versions are under the scope.
//
// Private abilities are the workspace's own and stay allowed: a workspace
// ability (file:), one from a GitHub source (github:owner/repo, git URLs),
// and one from a private npm registry the workspace set up for a scope
// (core/ability-sources.ts).
//
// LOOPENGINE_ALLOW_UNOFFICIAL_ABILITIES=1 turns the check off, for someone
// developing their own public ability on a self-hosted server.
import { readAbilitySources } from './ability-sources.js'

/** LoopEngine's npm organisation: its scope is official by itself. */
export const OFFICIAL_ABILITY_SCOPE = '@loopengine-co'

/** Whether a package name is under LoopEngine's npm organisation. */
export function isOfficialScope(name: string): boolean {
  return name.toLowerCase().startsWith(`${OFFICIAL_ABILITY_SCOPE}/`)
}

export class UnofficialAbilityError extends Error {}

export function unofficialAbilitiesAllowed(): boolean {
  return process.env.LOOPENGINE_ALLOW_UNOFFICIAL_ABILITIES === '1'
}

/** The package name when a spec installs from the public npm registry:
 * a bare name or @scope/name, with an optional @version, whose scope isn't
 * one of the workspace's private registries. Undefined for anything else. */
export function publicNpmPackage(spec: string): string | undefined {
  const match = /^((?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*)(?:@[^/]+)?$/i.exec(spec.trim())
  if (!match) return undefined
  const name = match[1]!
  if (name.startsWith('@')) {
    const scope = name.split('/')[0]!.toLowerCase()
    let privateScopes: string[] = []
    try {
      privateScopes = readAbilitySources().flatMap((s) => (s.type === 'npm' ? [s.scope.toLowerCase()] : []))
    } catch {}
    if (privateScopes.includes(scope)) return undefined
  }
  return name
}

/** Refuses a public npm ability that isn't official, before anything is
 * fetched. */
export function assertOfficialAbility(spec: string): void {
  if (unofficialAbilitiesAllowed()) return
  const name = publicNpmPackage(spec)
  if (!name || isOfficialScope(name)) return
  throw new UnofficialAbilityError(`${name} isn't an official LoopEngine ability, so it can't be installed: official abilities are under ${OFFICIAL_ABILITY_SCOPE} on npm (search them on the Abilities page). To use your own, add it as a private ability (Settings → Private ability sources, or upload it on the Abilities page).`)
}
