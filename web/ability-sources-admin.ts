// Backs Settings → Private ability sources and the Abilities page's
// Private section: see core/ability-sources.ts for what a source is.
// A token is saved through the same secret store as a model key (the
// project's .env by default) and never sent back, only whether it's set.
import {
  AbilitySourceError,
  describeSource,
  listSourceAbilities,
  readAbilitySources,
  removeAbilitySource,
  saveAbilitySource,
  sourceTokenVar,
  type AbilitySource,
  type SourceAbility,
} from '../core/ability-sources.js'
import { setEnvVar, unsetEnvVar } from './env-admin.js'

export interface AbilitySourceView {
  source: AbilitySource
  label: string
  /** The env var its token lives in; null for a folder, which has none. */
  tokenVar: string | null
  tokenSet: boolean
}

export function describeAbilitySources(): { sources: AbilitySourceView[]; error?: string } {
  let sources: AbilitySource[]
  try {
    sources = readAbilitySources()
  } catch (err) {
    return { sources: [], error: `ability-sources.yml is invalid: ${err instanceof Error ? err.message : String(err)}` }
  }
  return {
    sources: sources.map((source) => {
      const tokenVar = source.type === 'folder' ? null : sourceTokenVar(source.id)
      return { source, label: describeSource(source), tokenVar, tokenSet: Boolean(tokenVar && process.env[tokenVar]) }
    }),
  }
}

/** Saves a source from the console, and its token when one is given
 * (applied to this process at once). Throws AbilitySourceError for an
 * invalid source or token. */
export async function saveAbilitySourceFromConsole(body: Record<string, unknown>): Promise<AbilitySource> {
  const token = typeof body.token === 'string' ? body.token.trim() : ''
  if (token && (token.length < 8 || token.length > 500 || /\s/.test(token))) {
    throw new AbilitySourceError("That doesn't look like a token: paste the whole token, with no spaces or line breaks.")
  }
  const source = saveAbilitySource(body)
  if (token && source.type !== 'folder') await setEnvVar(sourceTokenVar(source.id), token)
  return source
}

/** Removes a source and its saved token. Installed abilities stay. */
export async function removeAbilitySourceFromConsole(id: string): Promise<void> {
  const source = readAbilitySources().find((s) => s.id === id)
  if (!source) throw new AbilitySourceError(`No source named ${id}`)
  removeAbilitySource(id)
  if (source.type !== 'folder') await unsetEnvVar(sourceTokenVar(id))
}

export interface PrivateAbilitiesView {
  sources: Array<{ id: string; type: AbilitySource['type']; label: string; abilities: SourceAbility[]; error?: string }>
  error?: string
}

/** Every private source's abilities, listed side by side; a source that
 * can't be read reports why instead of failing the rest. */
export async function listPrivateAbilities(options: { fetch?: typeof fetch } = {}): Promise<PrivateAbilitiesView> {
  let sources: AbilitySource[]
  try {
    sources = readAbilitySources()
  } catch (err) {
    return { sources: [], error: `ability-sources.yml is invalid: ${err instanceof Error ? err.message : String(err)}` }
  }
  return {
    sources: await Promise.all(
      sources.map(async (source) => {
        const base = { id: source.id, type: source.type, label: describeSource(source) }
        try {
          return { ...base, abilities: await listSourceAbilities(source, options) }
        } catch (err) {
          return { ...base, abilities: [], error: err instanceof Error ? err.message : String(err) }
        }
      }),
    ),
  }
}
