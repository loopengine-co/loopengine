import { describe, expect, it } from 'vitest'
import { PROVIDER_ICONS } from '#web/provider-icons.js'
import { describeModelProviders } from '#web/global-config.js'

describe('provider icons', () => {
  it('has a decorative inline SVG for every model provider', () => {
    const providers = describeModelProviders([], () => undefined).providers.map((p) => p.provider)
    expect(Object.keys(PROVIDER_ICONS).sort()).toEqual([...providers].sort())
    for (const provider of providers) {
      const svg = PROVIDER_ICONS[provider]
      expect(svg).toMatch(/^<svg class="le-provider-icon" aria-hidden="true"/)
      // Sized by the page's CSS, and nothing that could run or load anything.
      expect(svg).not.toMatch(/<script|<image|href=|\son\w+=|width=|height=/i)
    }
  })
})
