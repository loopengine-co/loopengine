// Backs the Admin UI's official abilities search box: the npm packages
// under LoopEngine's @loopengine-co scope, tagged with the
// loopengine-ability keyword (core/official-abilities.ts). A fresh call on
// every search, no caching: this is an on-demand lookup the operator
// explicitly asked for, not data the tab needs hot the way
// gateway-tools.ts's own live-reconnect data is — same "only pay the
// live cost when actually asked for" split, just with nothing worth
// remembering afterward here.
import { isOfficialScope, unofficialAbilitiesAllowed } from '../core/official-abilities.js'

export interface PublicAbilitySearchResult {
  name: string
  description: string
  version: string
}

const NPM_SEARCH_TIMEOUT_MS = 10000
// npm's most per page: the official ones are filtered out of everything
// tagged with the keyword, so ask for all of it.
const NPM_SEARCH_SIZE = 250

interface NpmSearchResponse {
  objects?: { package: { name: string; description?: string; version: string } }[]
}

export async function searchPublicAbilities(query?: string): Promise<PublicAbilitySearchResult[]> {
  const text = query ? `keywords:loopengine-ability ${query}` : 'keywords:loopengine-ability'
  const url = `https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(text)}&size=${NPM_SEARCH_SIZE}`

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), NPM_SEARCH_TIMEOUT_MS)
  let res: Response
  try {
    res = await fetch(url, { signal: controller.signal })
  } catch (err) {
    throw new Error(`Could not reach the npm registry: ${err instanceof Error ? err.message : String(err)}`)
  } finally {
    clearTimeout(timeout)
  }
  if (!res.ok) throw new Error(`npm registry search failed (HTTP ${res.status})`)

  const data = (await res.json()) as NpmSearchResponse
  // Only LoopEngine's own scope, unless unofficial abilities are turned
  // on: anyone can publish with the keyword. (npm's scope: qualifier
  // only ranks, it doesn't filter.)
  const all = unofficialAbilitiesAllowed()
  const official = (data.objects ?? []).filter((o) => all || isOfficialScope(o.package.name))
  const results = official.map((o) => ({
    name: o.package.name,
    description: o.package.description ?? '',
    version: o.package.version,
  }))

  // npm's own search is a relevance *ranker*, not a filter — a query
  // like "keywords:loopengine-ability docs" boosts a matching package's
  // score but doesn't drop the non-matching ones from the response at
  // all (confirmed live: every ability in this ecosystem still came
  // back regardless of the extra query text, just reordered). With this
  // few, brand-new, all-zero-download packages, that reordering barely
  // moves, so an operator typing a search term would otherwise see the
  // exact same full list every time. Filtering here on name/description
  // gives the strict, expected "search box" behavior npm's own API
  // doesn't provide on its own. Each word is matched on its own, so
  // "reddit posts" finds the Reddit ability; abilities matching more of
  // the words come first.
  const words = (query ?? '').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 1)
  if (!words.length) return results
  return results
    .map((r) => {
      const text = `${r.name} ${r.description}`.toLowerCase()
      return { r, score: words.filter((w) => text.includes(w)).length }
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.r)
}

const NPM_LATEST_VERSION_TIMEOUT_MS = 5000

/** The latest version currently published on the public npm registry for
 * `packageName`, or null if it can't be determined — not published
 * there at all (a private/file:/git-installed ability, the common case
 * during local development), a network hiccup, or a timeout. Best-effort
 * only: the Apps tab uses this to decide whether an installed
 * ability's own "Upgrade" button is worth showing, not to block
 * anything, so a failure here surfaces as "can't tell, show the button
 * anyway" rather than an error the operator has to deal with. */
export async function fetchLatestAbilityVersion(packageName: string): Promise<string | null> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), NPM_LATEST_VERSION_TIMEOUT_MS)
  try {
    const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(packageName)}/latest`, { signal: controller.signal })
    if (!res.ok) return null
    const data = (await res.json()) as { version?: string }
    return typeof data.version === 'string' ? data.version : null
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}
