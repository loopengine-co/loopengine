import { describe, expect, it } from 'vitest'
import { MESSAGING_ICONS } from '#web/messaging-icons.js'
import { NOTIFIER_CHANNELS } from '#core/notifier-file.js'

describe('messaging icons', () => {
  it('has a decorative inline SVG for every Messaging-tab app', () => {
    expect(Object.keys(MESSAGING_ICONS).sort()).toEqual([...NOTIFIER_CHANNELS].sort())
    for (const channel of NOTIFIER_CHANNELS) {
      const svg = MESSAGING_ICONS[channel]
      expect(svg).toMatch(/^<svg class="le-channel-icon" aria-hidden="true"/)
      // Sized by the page's CSS, and nothing that could run or load anything.
      expect(svg).not.toMatch(/^<svg[^>]*\s(width|height)=/)
      expect(svg).not.toMatch(/<script|<image|href=|\son\w+=/i)
    }
  })
})
