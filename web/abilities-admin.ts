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
  return (data.objects ?? []).map((o) => ({
    name: o.package.name,
    description: o.package.description ?? '',
    version: o.package.version,
  }))
}
