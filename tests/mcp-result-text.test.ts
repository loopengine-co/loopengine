import { describe, expect, it } from 'vitest'
import { readableResult } from '../core/mcp-abilities.js'
import { toolNote } from '../core/mcp-tool-notes.js'

describe("an MCP tool's result, as the model reads it", () => {
  it('shows JSON carrying long text as sections, not an escaped string', () => {
    const page = '# Hacker News\n\n1. [A story](https://example.com/a) "quoted"\n2. [Another](https://example.com/b)\n' + 'x'.repeat(300)
    const text = readableResult(JSON.stringify({ markdown: page, links: ['https://example.com/a', 'https://example.com/b'], metadata: { status: 200 } }))
    expect(text).toBe(`markdown:\n${page}\n\nlinks:\nhttps://example.com/a\nhttps://example.com/b\n\nmetadata: {"status":200}`)
    expect(text).not.toContain('\\n')
    expect(text).not.toContain('\\"')
  })

  it('leaves short JSON, arrays and plain text as they are', () => {
    expect(readableResult('{"ok":true,"id":"m_1"}')).toBe('{"ok":true,"id":"m_1"}')
    expect(readableResult('[{"a":1}]')).toBe('[{"a":1}]')
    expect(readableResult('Not JSON at all')).toBe('Not JSON at all')
    expect(readableResult('{broken')).toBe('{broken')
  })
})

describe('notes on a known app\'s tools', () => {
  it("tells Firecrawl's scrape to ask for markdown alone", () => {
    expect(toolNote('https://mcp.firecrawl.dev/v2/mcp', 'firecrawl_scrape')).toMatch(/formats \["markdown"\]/)
  })
  it('has none for other tools or servers', () => {
    expect(toolNote('https://mcp.firecrawl.dev/v2/mcp', 'firecrawl_search')).toBeUndefined()
    expect(toolNote('https://mcp.stripe.com', 'firecrawl_scrape')).toBeUndefined()
    expect(toolNote(undefined, 'firecrawl_scrape')).toBeUndefined()
  })
})
