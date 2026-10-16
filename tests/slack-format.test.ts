import { describe, expect, it } from 'vitest'
import { toSlackMrkdwn } from '#core/messaging/connectors/slack/index.js'

describe('toSlackMrkdwn', () => {
  it('turns Markdown bold, italic, strike, links, headings and bullets into Slack mrkdwn', () => {
    expect(toSlackMrkdwn('You can choose **Tokyo, Osaka, or Kyoto** here.')).toBe('You can choose *Tokyo, Osaka, or Kyoto* here.')
    expect(toSlackMrkdwn('__also bold__ and *italic* and ~~gone~~')).toBe('*also bold* and _italic_ and ~gone~')
    expect(toSlackMrkdwn('See [the docs](https://loopengine.co/docs).')).toBe('See <https://loopengine.co/docs|the docs>.')
    expect(toSlackMrkdwn('## Summary\n- one\n* two')).toBe('*Summary*\n• one\n• two')
  })

  it('leaves code, plain text and Slack mrkdwn that is already right alone', () => {
    expect(toSlackMrkdwn('Run `a **b** c` then\n```\n**x** [y](https://z)\n```')).toBe('Run `a **b** c` then\n```\n**x** [y](https://z)\n```')
    expect(toSlackMrkdwn('2 * 3 = 6, and a_b_c stays')).toBe('2 * 3 = 6, and a_b_c stays')
    expect(toSlackMrkdwn('<https://x.example|x> and <@U123>')).toBe('<https://x.example|x> and <@U123>')
  })
})
