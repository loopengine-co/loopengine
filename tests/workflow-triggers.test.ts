import { createHmac } from 'node:crypto'
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  FileTriggerStore, createTrigger, deliveryId, findTriggerByToken, getTriggerStore, paramsFromPayload, parsePayload, passesFilter,
  publicTrigger, recordDelivery, rotateTrigger, setTriggerStore, updateTrigger, valueAt, verifySenderSignature,
} from '#core/workflow-triggers.js'
import type { Workflow } from '#core/workflows.js'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'loopengine-triggers-'))
  setTriggerStore(new FileTriggerStore(dir))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const workflow: Workflow = {
  id: 'handle-dispute', title: 'Handle dispute', description: 'Answers a payment dispute', startMessage: 'Handle dispute $dispute_id.', trigger: 'When a dispute comes in',
  parameters: { dispute_id: { description: 'The dispute', required: true }, amount: { description: 'Amount in cents', required: false }, event: { description: 'The whole event', required: false } },
  steps: 'Steps.',
}

describe('making a trigger', () => {
  it('gives a token once, keeps only its hash, and finds the trigger by it', async () => {
    const { trigger, token } = await createTrigger('payments', workflow, { name: 'Stripe disputes', verify: { sender: 'stripe', secret: 'whsec_test' }, mapping: { dispute_id: 'data.object.id' } })
    expect(token).toMatch(/^whk_[A-Za-z0-9_-]{32}$/)
    expect(trigger.token_hint).toBe(`${token.slice(0, 8)}…`)
    const file = readFileSync(join(dir, 'triggers', readdirSync(join(dir, 'triggers'))[0]!), 'utf8')
    expect(file).not.toContain(token)

    expect((await findTriggerByToken(token))?.trigger_id).toBe(trigger.trigger_id)
    expect(await findTriggerByToken('whk_' + 'x'.repeat(32))).toBeUndefined()
    expect(await findTriggerByToken('not-a-token')).toBeUndefined()

    const shown = publicTrigger(trigger)
    expect(shown.verify).toEqual({ sender: 'stripe', secret_set: true })
    expect(JSON.stringify(shown)).not.toContain('whsec_test')
    expect(shown).not.toHaveProperty('token_hash')
  })

  it('gets a new URL on rotation, and the old one stops working', async () => {
    const { trigger, token } = await createTrigger('payments', workflow, {})
    const rotated = await rotateTrigger(trigger.trigger_id)
    expect(await findTriggerByToken(token)).toBeUndefined()
    expect((await findTriggerByToken(rotated.token))?.trigger_id).toBe(trigger.trigger_id)
  })

  it('checks its settings against the workflow', async () => {
    await expect(createTrigger('payments', workflow, { mapping: { order_id: 'data.id' } })).rejects.toThrow(/has no parameter "order_id"/)
    await expect(createTrigger('payments', workflow, { filter: { path: 'type', values: [] } })).rejects.toThrow(/at least one value/)
    await expect(createTrigger('payments', workflow, { verify: { sender: 'stripe' } })).rejects.toThrow(/signing secret/)
    await expect(createTrigger('payments', workflow, { verify: { sender: 'paypal', secret: 'x' } })).rejects.toThrow(/stripe, github, shopify, standard, custom/)
    await expect(createTrigger('payments', workflow, { payload_param: 'nope' })).rejects.toThrow(/no parameter "nope"/)
    await expect(createTrigger('payments', workflow, { callback_url: 'http://example.com' })).rejects.toThrow(/https/)
  })

  it('keeps the signing secret when a change gives the sender without it, and can be turned off', async () => {
    const { trigger } = await createTrigger('payments', workflow, { verify: { sender: 'github', secret: 'gh-secret' } })
    const updated = await updateTrigger(trigger.trigger_id, workflow, { verify: { sender: 'github' }, enabled: false, filter: { path: 'action', values: ['opened'] } })
    expect(updated).toMatchObject({ enabled: false, verify: { sender: 'github', secret: 'gh-secret' }, filter: { path: 'action', values: ['opened'] } })
    expect(updated.token_hash).toBe(trigger.token_hash)
  })
})

describe("a sender's signature", () => {
  const raw = Buffer.from('{"id":"evt_1","type":"charge.dispute.created"}')

  it('checks Stripe: the signed timestamp and body, within five minutes', () => {
    const t = 1_800_000_000
    const sig = createHmac('sha256', 'whsec_test').update(`${t}.${raw}`).digest('hex')
    const verify = { sender: 'stripe' as const, secret: 'whsec_test' }
    expect(verifySenderSignature(verify, { 'stripe-signature': `t=${t},v1=${sig}` }, raw, t + 10)).toBe(true)
    expect(verifySenderSignature(verify, { 'stripe-signature': `t=${t},v1=${sig}` }, raw, t + 600)).toBe(false)
    expect(verifySenderSignature(verify, { 'stripe-signature': `t=${t},v1=${'0'.repeat(64)}` }, raw, t)).toBe(false)
    expect(verifySenderSignature(verify, {}, raw, t)).toBe(false)
  })

  it('checks GitHub and Shopify', () => {
    const gh = createHmac('sha256', 'gh-secret').update(raw).digest('hex')
    expect(verifySenderSignature({ sender: 'github', secret: 'gh-secret' }, { 'x-hub-signature-256': `sha256=${gh}` }, raw)).toBe(true)
    expect(verifySenderSignature({ sender: 'github', secret: 'other' }, { 'x-hub-signature-256': `sha256=${gh}` }, raw)).toBe(false)
    const shop = createHmac('sha256', 'shop-secret').update(raw).digest('base64')
    expect(verifySenderSignature({ sender: 'shopify', secret: 'shop-secret' }, { 'x-shopify-hmac-sha256': shop }, raw)).toBe(true)
    expect(verifySenderSignature({ sender: 'shopify', secret: 'shop-secret' }, { 'x-shopify-hmac-sha256': 'nope' }, raw)).toBe(false)
  })
})

describe('other senders\' signatures', () => {
  const raw = Buffer.from('{"action":"create","data":{"id":"ISS-1"}}')
  const hmac = (alg: string, secret: string | Buffer, data: Buffer | string, enc: 'hex' | 'base64') => createHmac(alg, secret).update(data).digest(enc)

  it('checks a custom HMAC of the body, in the header, hash, encoding and prefix the sender uses', () => {
    // Linear: hex SHA-256, no prefix.
    const linear = { sender: 'custom' as const, secret: 'lin-secret', header: 'linear-signature', algorithm: 'sha256' as const, encoding: 'hex' as const }
    expect(verifySenderSignature(linear, { 'linear-signature': hmac('sha256', 'lin-secret', raw, 'hex') }, raw)).toBe(true)
    expect(verifySenderSignature(linear, { 'linear-signature': hmac('sha256', 'lin-secret', raw, 'hex').toUpperCase() }, raw)).toBe(true)
    expect(verifySenderSignature(linear, { 'linear-signature': hmac('sha256', 'other', raw, 'hex') }, raw)).toBe(false)
    expect(verifySenderSignature(linear, {}, raw)).toBe(false)
    // Typeform: base64 SHA-256 after "sha256=".
    const typeform = { sender: 'custom' as const, secret: 'tf-secret', header: 'typeform-signature', algorithm: 'sha256' as const, encoding: 'base64' as const, prefix: 'sha256=' }
    expect(verifySenderSignature(typeform, { 'typeform-signature': `sha256=${hmac('sha256', 'tf-secret', raw, 'base64')}` }, raw)).toBe(true)
    expect(verifySenderSignature(typeform, { 'typeform-signature': hmac('sha256', 'tf-secret', raw, 'base64') }, raw)).toBe(false)
    // Intercom: hex SHA-1 after "sha1=".
    const intercom = { sender: 'custom' as const, secret: 'ic-secret', header: 'x-hub-signature', algorithm: 'sha1' as const, encoding: 'hex' as const, prefix: 'sha1=' }
    expect(verifySenderSignature(intercom, { 'x-hub-signature': `sha1=${hmac('sha1', 'ic-secret', raw, 'hex')}` }, raw)).toBe(true)
  })

  it('checks Standard Webhooks: id, timestamp and body, under either header name, within five minutes', () => {
    const key = Buffer.from('a-standard-webhooks-key')
    const secret = `whsec_${key.toString('base64')}`
    const t = 1_800_000_000
    const sig = hmac('sha256', key, Buffer.concat([Buffer.from(`msg_1.${t}.`), raw]), 'base64')
    const verify = { sender: 'standard' as const, secret }
    expect(verifySenderSignature(verify, { 'webhook-id': 'msg_1', 'webhook-timestamp': String(t), 'webhook-signature': `v1,${sig}` }, raw, t + 5)).toBe(true)
    expect(verifySenderSignature(verify, { 'svix-id': 'msg_1', 'svix-timestamp': String(t), 'svix-signature': `v1,old v1,${sig}` }, raw, t + 5)).toBe(true)
    expect(verifySenderSignature(verify, { 'webhook-id': 'msg_1', 'webhook-timestamp': String(t), 'webhook-signature': `v1,${sig}` }, raw, t + 900)).toBe(false)
    expect(verifySenderSignature(verify, { 'webhook-id': 'msg_2', 'webhook-timestamp': String(t), 'webhook-signature': `v1,${sig}` }, raw, t)).toBe(false)
  })

  it('needs a custom sender\'s header, and keeps its secret out of what is shown', async () => {
    await expect(createTrigger('payments', workflow, { verify: { sender: 'custom', secret: 's' } })).rejects.toThrow(/header the signature arrives in/)
    await expect(createTrigger('payments', workflow, { verify: { sender: 'custom', secret: 's', header: 'X-Sig', algorithm: 'md5' } })).rejects.toThrow(/algorithm must be one of/)
    await expect(createTrigger('payments', workflow, { verify: { sender: 'standard', secret: 'not base64!' } })).rejects.toThrow(/whsec_/)

    const { trigger } = await createTrigger('payments', workflow, { verify: { sender: 'custom', secret: 'lin-secret', header: 'Linear-Signature' } })
    expect(trigger.verify).toEqual({ sender: 'custom', secret: 'lin-secret', header: 'linear-signature', algorithm: 'sha256', encoding: 'hex' })
    expect(publicTrigger(trigger).verify).toEqual({ sender: 'custom', header: 'linear-signature', algorithm: 'sha256', encoding: 'hex', secret_set: true })

    const updated = await updateTrigger(trigger.trigger_id, workflow, { verify: { sender: 'custom', header: 'Linear-Signature', encoding: 'base64' } })
    expect(updated.verify).toMatchObject({ secret: 'lin-secret', encoding: 'base64' })
  })
})

describe('a delivery', () => {
  const event = { id: 'evt_1', type: 'charge.dispute.created', data: { object: { id: 'dp_9', amount: 4200, items: [{ sku: 'A1' }] } } }

  it('reads JSON, forms (with a JSON payload field) and plain text', () => {
    expect(parsePayload(Buffer.from(JSON.stringify(event)), 'application/json')).toEqual(event)
    expect(parsePayload(Buffer.from('a=1&b=two'), 'application/x-www-form-urlencoded')).toEqual({ a: '1', b: 'two' })
    expect(parsePayload(Buffer.from(`payload=${encodeURIComponent('{"x":1}')}`), 'application/x-www-form-urlencoded')).toEqual({ x: 1 })
    expect(parsePayload(Buffer.from('disk full on db-1'), 'text/plain')).toEqual({ body: 'disk full on db-1' })
  })

  it('finds values by dot path, and the id a retry repeats', () => {
    expect(valueAt(event, 'data.object.id')).toBe('dp_9')
    expect(valueAt(event, 'data.object.items.0.sku')).toBe('A1')
    expect(valueAt(event, 'data.missing.id')).toBeUndefined()
    expect(deliveryId({ 'x-github-delivery': 'gh-1' }, event)).toBe('gh-1')
    expect(deliveryId({}, event)).toBe('evt_1')
    expect(deliveryId({}, { type: 'x' })).toBeUndefined()
  })

  it('is kept or skipped by the filter, and fills parameters from the payload', () => {
    expect(passesFilter(undefined, event)).toBe(true)
    expect(passesFilter({ path: 'type', values: ['charge.dispute.created'] }, event)).toBe(true)
    expect(passesFilter({ path: 'type', values: ['charge.refunded'] }, event)).toBe(false)
    expect(paramsFromPayload({ mapping: { dispute_id: 'data.object.id', amount: 'data.object.amount' }, payload_param: 'event' }, event)).toEqual({
      dispute_id: 'dp_9', amount: '4200', event: JSON.stringify(event),
    })
  })

  it('is recorded on its trigger, newest first, with its id remembered', async () => {
    const { trigger } = await createTrigger('payments', workflow, {})
    for (let i = 0; i < 25; i++) await recordDelivery(trigger.trigger_id, { at: `2026-11-05T00:00:${String(i).padStart(2, '0')}Z`, outcome: 'started' }, `evt_${i}`)
    const saved = (await getTriggerStore().get(trigger.trigger_id))!
    expect(saved.deliveries).toHaveLength(20)
    expect(saved.deliveries[0]!.at).toBe('2026-11-05T00:00:24Z')
    expect(saved.seen_ids).toContain('evt_24')
  })
})

describe('a trigger waiting for its signing secret', () => {
  it('can be made turned off without the secret, never checks against an empty one, and turns on once it is added', async () => {
    await expect(createTrigger('payments', workflow, { verify: { sender: 'stripe' } })).rejects.toThrow('signing secret')
    const { trigger } = await createTrigger('payments', workflow, { name: 'Stripe disputes', enabled: false, verify: { sender: 'stripe' }, filter: { path: 'type', values: ['charge.dispute.created'] } })
    expect(publicTrigger(trigger).verify).toEqual({ sender: 'stripe', secret_set: false })
    // Anyone can sign with an empty key, so nothing passes.
    const body = Buffer.from('{}')
    const t = Math.floor(Date.now() / 1000)
    expect(verifySenderSignature(trigger.verify!, { 'stripe-signature': `t=${t},v1=${createHmac('sha256', '').update(`${t}.{}`).digest('hex')}` }, body)).toBe(false)
    await expect(updateTrigger(trigger.trigger_id, workflow, { enabled: true })).rejects.toThrow('signing secret')
    const on = await updateTrigger(trigger.trigger_id, workflow, { verify: { sender: 'stripe', secret: 'whsec_x' }, enabled: true })
    expect(on).toMatchObject({ enabled: true, verify: { sender: 'stripe', secret: 'whsec_x' }, filter: { path: 'type', values: ['charge.dispute.created'] } })
  })

  it('keeps its signature check, filter and mapping when only turned off and on', async () => {
    const { trigger } = await createTrigger('payments', workflow, { verify: { sender: 'stripe', secret: 'whsec_x' }, filter: { path: 'type', values: ['a'] }, mapping: { dispute_id: 'data.object.id' }, notify: true })
    await updateTrigger(trigger.trigger_id, workflow, { enabled: false })
    const back = await updateTrigger(trigger.trigger_id, workflow, { enabled: true })
    expect(back).toMatchObject({ enabled: true, verify: { secret: 'whsec_x' }, filter: { values: ['a'] }, mapping: { dispute_id: 'data.object.id' }, notify: true })
    // null removes a setting.
    expect(await updateTrigger(trigger.trigger_id, workflow, { filter: null })).not.toHaveProperty('filter')
  })
})
