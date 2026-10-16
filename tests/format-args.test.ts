import { describe, expect, it } from 'vitest'
import { formatArgs, formatChange, labelFor } from '#core/messaging/format-args.js'
import { slackArgs, slackEscape, toSlackMrkdwn } from '#core/messaging/connectors/slack/index.js'

const plainEscape = (t: string) => t

describe('formatArgs', () => {
  it('puts short values on labelled lines, in the schema order, with titles when the schema has them', () => {
    const schema = { properties: { to: { type: 'string' }, subject: { type: 'string', title: 'Subject line' }, cc: { type: 'array' } } }
    expect(formatArgs({ subject: 'Your refund', to: 'ana@acme.com', cc: ['raj@acme.com'], dry_run: false }, plainEscape, schema)).toBe(
      '**To:** ana@acme.com\n**Subject line:** Your refund\n**Cc:** raj@acme.com\n**Dry run:** false',
    )
  })

  it('quotes long or multi-line text below its label, keeping line breaks, and cuts very long text', () => {
    expect(formatArgs({ body: 'Hi Ana,\n\nYour refund is on its way.' }, plainEscape)).toBe('**Body:**\n> Hi Ana,\n> \n> Your refund is on its way.')
    const long = formatArgs({ body: 'x'.repeat(2000) }, plainEscape)
    expect(long.length).toBeLessThan(1600)
    expect(long).toContain('the decision link has it all')
  })

  it('shows lists as bullets when long, nested objects as indented fields, and skips empty values', () => {
    expect(formatArgs({ items: ['a'.repeat(50), 'b'.repeat(50)] }, plainEscape)).toBe(`**Items:**\n- ${'a'.repeat(50)}\n- ${'b'.repeat(50)}`)
    expect(formatArgs({ address: { city: 'Kyoto', zipCode: '600' }, note: null }, plainEscape)).toBe('**Address:**\n  **City:** Kyoto\n  **Zip code:** 600')
    expect(formatArgs({}, plainEscape)).toBe('(no arguments)')
  })

  it('makes labels from argument names', () => {
    expect(labelFor('customer_id')).toBe('Customer id')
    expect(labelFor('sendAt')).toBe('Send at')
  })
})

describe('formatChange', () => {
  it('shows only what differs: old struck through, added and removed marked, long text in full', () => {
    expect(formatChange({ to: 'Ana', text: 'at 3pm', cc: 'Raj' }, { to: 'Ana', text: 'at 2pm', priority: 'high' }, plainEscape)).toBe(
      '**Text:** ~~at 3pm~~ → at 2pm\n**Priority:** high (added)\n**Cc:** ~~Raj~~ (removed)',
    )
    expect(formatChange({ body: 'Hi' }, { body: 'Hi Ana,\nthanks' }, plainEscape)).toBe('**Body:** (changed, now:)\n> Hi Ana,\n> thanks')
  })
})

describe('Slack rendering', () => {
  it('turns the format into Slack mrkdwn', () => {
    expect(slackArgs({ to: 'ana@acme.com', body: 'Hi Ana,\nThanks' })).toBe('*To:* ana@acme.com\n*Body:*\n> Hi Ana,\n> Thanks')
    expect(toSlackMrkdwn(formatChange({ text: 'at 3pm' }, { text: 'at 2pm' }, slackEscape))).toBe('*Text:* ~at 3pm~ → at 2pm')
  })

  it("never lets an argument become a mention, a channel ping, a link or formatting", () => {
    const out = slackArgs({ text: 'Hey <!channel>, see [your bank](https://evil.example) and <https://evil.example|login> **now** & <@U123>' })
    expect(out).toBe('*Text:*\n> Hey &lt;!channel&gt;, see [your bank](https://evil.example) and &lt;https://evil.example|login&gt; **now** &amp; &lt;@U123&gt;')
    expect(out).not.toMatch(/[\u0001\u0002]/)
  })

  it('keeps labels plain even when a schema title has markup', () => {
    expect(slackArgs({ a: 1 }, { properties: { a: { title: '*Amount* <x>' } } })).toBe('*Amount x:* 1')
  })
})
