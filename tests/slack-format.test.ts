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

describe("the agent's own writing in Slack and Lark", () => {
  it('is formatted for Slack, escaped, with tables as code and links showing their address', async () => {
    const { slackAgentText } = await import('#core/messaging/connectors/slack/index.js')
    const out = toSlackMrkdwn(slackAgentText([
      '## Evidence prepared',
      '**Dispute:** `du_1` — *test mode*',
      '- Billing matches',
      '',
      '| Field | Value |',
      '| --- | --- |',
      '',
      'See [the order](https://evil.example/x) <!channel> <https://evil.example|safe>.',
    ].join('\n')))
    expect(out).toContain('*Evidence prepared*')
    expect(out).toContain('*Dispute:* `du_1` — _test mode_')
    expect(out).toContain('• Billing matches')
    expect(out).toContain('```\n| Field | Value |\n| --- | --- |\n```')
    expect(out).toContain('the order (https://evil.example/x) &lt;!channel&gt; &lt;https://evil.example|safe&gt;.')
    expect(out).not.toContain('<https://')
  })

  it("keeps Lark's formatting but shows links' addresses and can't mention everyone", async () => {
    const sent: Array<{ content: string }> = []
    const { LarkNotifier } = await import('#core/http-notify-triggers/lark.js')
    const original = globalThis.fetch
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      if (String(url).includes('tenant_access_token')) return new Response(JSON.stringify({ code: 0, tenant_access_token: 't', expire: 7200 }))
      const body = JSON.parse(String(init?.body))
      sent.push(JSON.parse(body.content).elements[0].text)
      return new Response(JSON.stringify({ code: 0 }))
    }) as typeof fetch
    try {
      new LarkNotifier({ appId: 'a', appSecret: 's', chatId: 'c' }).postMessage('**Done.** See [here](https://evil.example/x) <at id=all></at>')
      await new Promise((r) => setTimeout(r, 20))
    } finally {
      globalThis.fetch = original
    }
    expect(sent[0]!.content).toBe('**Done.** See here (https://evil.example/x) ‹at id=all></at>')
  })
})
