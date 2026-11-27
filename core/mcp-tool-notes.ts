// Advice for a known app's tools, by the server's host and the tool's own
// name, added to the description the model reads: how to call the tool
// so its result costs the fewest tokens for what the run needs. Every
// later model call in a run carries a result again, so a lean one pays
// off more than once.

const NOTES: Record<string, Record<string, string>> = {
  'mcp.firecrawl.dev': {
    firecrawl_scrape: 'Ask for formats ["markdown"] alone unless you need something else: the markdown already has every link on the page, so "links" only repeats them and roughly doubles the result.',
  },
}

/** The note for a tool on a server, if there is one. */
export function toolNote(serverUrl: string | undefined, tool: string): string | undefined {
  if (!serverUrl) return undefined
  try {
    return NOTES[new URL(serverUrl).host]?.[tool]
  } catch {
    return undefined
  }
}
