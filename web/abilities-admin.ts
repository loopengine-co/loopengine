// Backs the Admin UI's Abilities tab search box — "public" here means
// any npm package tagged with the loopengine-ability keyword every
// lp-* ability in this ecosystem already carries in its own
// package.json (see ABILITIES.md's "Publishing an ability"), not a
// curated/private registry loopengine itself runs. A fresh call on
// every search, no caching: this is an on-demand lookup the operator
// explicitly asked for, not data the tab needs hot the way
// gateway-tools.ts's own live-reconnect data is — same "only pay the
// live cost when actually asked for" split, just with nothing worth
// remembering afterward here.
export interface PublicAbilitySearchResult {
  name: string
  description: string
  version: string
}

const NPM_SEARCH_TIMEOUT_MS = 10000
const NPM_SEARCH_SIZE = 20

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
  const results = (data.objects ?? []).map((o) => ({
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
  // doesn't provide on its own.
  if (!query) return results
  const needle = query.toLowerCase()
  return results.filter((r) => r.name.toLowerCase().includes(needle) || r.description.toLowerCase().includes(needle))
}
