// Webhook triggers: a secret URL per workflow that an outside service
// (Stripe, GitHub, Shopify, a form or monitoring tool) can post its own
// events to, to start a run, with no API key and no body format of ours:
//
//   POST /hooks/workflows/<token>
//
// The token in the URL is the credential (it's kept here only as a
// SHA-256 hash, so the full URL is shown once, when it's made or
// rotated). A trigger can also check the sender's own signature, keep
// only some events (filter), and fill the workflow's parameters from the
// payload (mapping, or the whole payload as one parameter). A delivery a
// sender retries is recognised by its id and starts no second run.
//
// Stored like runs and schedules: one JSON file per trigger under
// `<LOOPENGINE_SCHEDULER_DIR or .scheduler>/triggers/`.
import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { KeyedMutex } from './session-store.js'
import { checkCallbackUrl } from './run-callbacks.js'
import type { Workflow } from './workflows.js'

/** Whose signature scheme a trigger checks. "standard" is Standard
 * Webhooks (Svix: used by Clerk, Resend, OpenAI and others); "custom" is
 * an HMAC of the raw body in a header the sender names (Typeform, Linear,
 * Sentry, Intercom and most others that sign the body). */
export type TriggerSender = 'stripe' | 'github' | 'shopify' | 'standard' | 'custom'

export type SignatureAlgorithm = 'sha256' | 'sha1' | 'sha512'

export interface TriggerVerify {
  sender: TriggerSender
  /** The signing secret the sender gives (Stripe's whsec_…, GitHub's,
   * Shopify's, a Standard Webhooks whsec_…, or a custom one). */
  secret: string
  /** custom only: the header the signature is in, e.g. "Linear-Signature". */
  header?: string
  /** custom only: the HMAC's hash (default sha256). */
  algorithm?: SignatureAlgorithm
  /** custom only: how the signature is written (default hex). */
  encoding?: 'hex' | 'base64'
  /** custom only: text before the signature, e.g. "sha256=". */
  prefix?: string
}

export interface TriggerFilter {
  /** Where in the payload, as a dot path: "type", "action", "data.object.status". */
  path: string
  /** Run only when the value there is one of these. */
  values: string[]
}

export type TriggerOutcome = 'started' | 'filtered' | 'duplicate' | 'busy' | 'rejected' | 'invalid' | 'error'

export interface TriggerDelivery {
  at: string
  outcome: TriggerOutcome
  delivery_id?: string
  run_id?: string
  detail?: string
}

export interface WorkflowTrigger {
  trigger_id: string
  agent: string
  workflow_id: string
  name: string
  /** SHA-256 of the URL's token. */
  token_hash: string
  /** The token's start, to tell triggers apart: "whk_8f3k…". */
  token_hint: string
  enabled: boolean
  created_at: string
  verify?: TriggerVerify
  filter?: TriggerFilter
  /** Workflow parameter → dot path in the payload. */
  mapping?: Record<string, string>
  /** A parameter that gets the whole payload, as JSON. */
  payload_param?: string
  notify?: boolean
  callback_url?: string
  /** The latest deliveries, newest first (20). */
  deliveries: TriggerDelivery[]
  /** Delivery ids already handled (the latest 200), for retries. */
  seen_ids: string[]
}

/** A trigger as the console and API show it: no token hash, no secret. */
export type PublicTrigger = Omit<WorkflowTrigger, 'token_hash' | 'verify' | 'seen_ids'> & { verify?: Omit<TriggerVerify, 'secret'> }

export class TriggerError extends Error {}

const MAX_DELIVERIES = 20
const MAX_SEEN = 200
const MAX_PAYLOAD_PARAM = 20_000
const SENDERS: TriggerSender[] = ['stripe', 'github', 'shopify', 'standard', 'custom']
const ALGORITHMS: SignatureAlgorithm[] = ['sha256', 'sha1', 'sha512']
/** How old a signed timestamp (Stripe, Standard Webhooks) may be. */
const SIGNATURE_TOLERANCE_S = 300

// ---------- store ----------

export interface TriggerStore {
  list(): Promise<WorkflowTrigger[]>
  get(id: string): Promise<WorkflowTrigger | undefined>
  put(trigger: WorkflowTrigger): Promise<void>
  remove(id: string): Promise<void>
  update(id: string, fn: (t: WorkflowTrigger | undefined) => WorkflowTrigger | undefined): Promise<WorkflowTrigger | undefined>
}

const fileMutex = new KeyedMutex()

/** One JSON file per trigger under `<dir>/triggers/` — one server process. */
export class FileTriggerStore implements TriggerStore {
  private readonly dir: string

  constructor(dir: string) {
    this.dir = path.join(dir, 'triggers')
  }

  private file(id: string): string {
    if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new TriggerError(`invalid trigger id "${id}"`)
    return path.join(this.dir, `${id}.json`)
  }

  async list(): Promise<WorkflowTrigger[]> {
    if (!existsSync(this.dir)) return []
    const triggers: WorkflowTrigger[] = []
    for (const name of readdirSync(this.dir)) {
      if (!name.endsWith('.json')) continue
      try {
        triggers.push(JSON.parse(readFileSync(path.join(this.dir, name), 'utf8')) as WorkflowTrigger)
      } catch {
        // A file being written, or not a trigger: skip it.
      }
    }
    return triggers.sort((a, b) => a.created_at.localeCompare(b.created_at))
  }

  async get(id: string): Promise<WorkflowTrigger | undefined> {
    const file = this.file(id)
    return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as WorkflowTrigger) : undefined
  }

  async put(trigger: WorkflowTrigger): Promise<void> {
    mkdirSync(this.dir, { recursive: true })
    const file = this.file(trigger.trigger_id)
    writeFileSync(file + '.tmp', JSON.stringify(trigger, null, 2), { mode: 0o600 })
    renameSync(file + '.tmp', file)
  }

  async remove(id: string): Promise<void> {
    rmSync(this.file(id), { force: true })
  }

  async update(id: string, fn: (t: WorkflowTrigger | undefined) => WorkflowTrigger | undefined): Promise<WorkflowTrigger | undefined> {
    return fileMutex.run(id, async () => {
      const next = fn(await this.get(id))
      if (next) await this.put(next)
      return next
    })
  }
}

let store: TriggerStore | undefined

export function getTriggerStore(): TriggerStore {
  store ??= new FileTriggerStore(process.env.LOOPENGINE_SCHEDULER_DIR || path.join(process.cwd(), '.scheduler'))
  return store
}

export function setTriggerStore(next: TriggerStore): void {
  store = next
}

// ---------- making and finding ----------

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function newToken(): string {
  return `whk_${randomBytes(24).toString('base64url')}`
}

export function publicTrigger(t: WorkflowTrigger): PublicTrigger {
  const { token_hash: _hash, verify, seen_ids: _seen, ...rest } = t
  if (!verify) return rest
  const { secret: _secret, ...shown } = verify
  return { ...rest, verify: shown }
}

/** The settings a trigger can have, checked against its workflow. */
export interface TriggerSettings {
  name?: unknown
  enabled?: unknown
  verify?: unknown
  filter?: unknown
  mapping?: unknown
  payload_param?: unknown
  notify?: unknown
  callback_url?: unknown
}

/** Checks settings for a trigger of `workflow`; throws TriggerError saying
 * what's wrong. `existing` keeps a sender's secret when only the sender
 * is given again (the console never sees the secret). */
export function checkTriggerSettings(input: TriggerSettings, workflow: Workflow, existing?: WorkflowTrigger): Pick<WorkflowTrigger, 'name' | 'enabled' | 'verify' | 'filter' | 'mapping' | 'payload_param' | 'notify' | 'callback_url'> {
  const name = typeof input.name === 'string' && input.name.trim() ? input.name.trim().slice(0, 80) : existing?.name ?? 'Webhook'
  if (input.enabled !== undefined && typeof input.enabled !== 'boolean') throw new TriggerError('enabled must be true or false')

  let verify: TriggerVerify | undefined
  if (input.verify !== undefined && input.verify !== null) {
    const v = input.verify as Record<string, unknown>
    if (typeof v !== 'object' || !SENDERS.includes(v.sender as TriggerSender)) throw new TriggerError(`verify.sender must be one of ${SENDERS.join(', ')}`)
    const kept = existing?.verify && existing.verify.sender === v.sender ? existing.verify.secret : ''
    const secret = typeof v.secret === 'string' && v.secret.trim() ? v.secret.trim() : kept
    if (!secret) throw new TriggerError(`Give the signing secret ${v.sender === 'custom' ? 'the sender' : v.sender} shows for this webhook, so its signature can be checked.`)
    verify = { sender: v.sender as TriggerSender, secret }
    if (v.sender === 'standard' && !/^(whsec_)?[A-Za-z0-9+/]+=*$/.test(secret)) throw new TriggerError('A Standard Webhooks secret looks like "whsec_" followed by base64 text.')
    if (v.sender === 'custom') {
      const headerName = typeof v.header === 'string' ? v.header.trim() : ''
      if (!/^[A-Za-z0-9-]{1,80}$/.test(headerName)) throw new TriggerError('Give the header the signature arrives in, e.g. "Linear-Signature" (letters, digits and dashes).')
      const algorithm = (v.algorithm ?? 'sha256') as SignatureAlgorithm
      if (!ALGORITHMS.includes(algorithm)) throw new TriggerError(`algorithm must be one of ${ALGORITHMS.join(', ')}`)
      const encoding = v.encoding ?? 'hex'
      if (encoding !== 'hex' && encoding !== 'base64') throw new TriggerError('encoding must be hex or base64')
      const prefix = typeof v.prefix === 'string' ? v.prefix.trim() : ''
      if (prefix.length > 20) throw new TriggerError('prefix is too long: keep it under 20 characters, e.g. "sha256="')
      verify = { ...verify, header: headerName.toLowerCase(), algorithm, encoding, ...(prefix ? { prefix } : {}) }
    }
  }

  let filter: TriggerFilter | undefined
  if (input.filter !== undefined && input.filter !== null) {
    const f = input.filter as Record<string, unknown>
    const values = Array.isArray(f.values) ? f.values.filter((x) => typeof x === 'string' && x.trim()).map((x) => (x as string).trim()) : []
    if (typeof f.path !== 'string' || !f.path.trim() || !values.length) throw new TriggerError('filter needs a path, e.g. "type", and at least one value, e.g. ["charge.dispute.created"]')
    filter = { path: f.path.trim(), values }
  }

  const declared = Object.keys(workflow.parameters)
  let mapping: Record<string, string> | undefined
  if (input.mapping !== undefined && input.mapping !== null) {
    if (typeof input.mapping !== 'object' || Array.isArray(input.mapping)) throw new TriggerError('mapping must be an object of parameter names to payload paths')
    mapping = {}
    for (const [param, p] of Object.entries(input.mapping as Record<string, unknown>)) {
      if (typeof p !== 'string' || !p.trim()) continue
      if (!declared.includes(param)) throw new TriggerError(`mapping: ${workflow.title} has no parameter "${param}"${declared.length ? ` (its parameters: ${declared.join(', ')})` : ''}`)
      mapping[param] = p.trim()
    }
    if (!Object.keys(mapping).length) mapping = undefined
  }

  let payloadParam: string | undefined
  if (typeof input.payload_param === 'string' && input.payload_param) {
    if (!declared.includes(input.payload_param)) throw new TriggerError(`payload_param: ${workflow.title} has no parameter "${input.payload_param}"`)
    payloadParam = input.payload_param
  }

  if (input.notify !== undefined && typeof input.notify !== 'boolean') throw new TriggerError('notify must be true or false')
  const callbackUrl = input.callback_url ? checkCallbackUrl(input.callback_url) : undefined

  return {
    name,
    enabled: input.enabled === undefined ? existing?.enabled ?? true : (input.enabled as boolean),
    ...(verify ? { verify } : {}),
    ...(filter ? { filter } : {}),
    ...(mapping ? { mapping } : {}),
    ...(payloadParam ? { payload_param: payloadParam } : {}),
    ...(input.notify === true ? { notify: true } : {}),
    ...(callbackUrl ? { callback_url: callbackUrl } : {}),
  }
}

/** Makes a trigger for a workflow; returns it with its token (shown once). */
export async function createTrigger(agent: string, workflow: Workflow, input: TriggerSettings): Promise<{ trigger: WorkflowTrigger; token: string }> {
  const settings = checkTriggerSettings(input, workflow)
  const token = newToken()
  const trigger: WorkflowTrigger = {
    trigger_id: randomUUID(),
    agent,
    workflow_id: workflow.id,
    ...settings,
    token_hash: hashToken(token),
    token_hint: `${token.slice(0, 8)}…`,
    created_at: new Date().toISOString(),
    deliveries: [],
    seen_ids: [],
  }
  await getTriggerStore().put(trigger)
  return { trigger, token }
}

export async function updateTrigger(id: string, workflow: Workflow, input: TriggerSettings): Promise<WorkflowTrigger> {
  const existing = await getTriggerStore().get(id)
  if (!existing) throw new TriggerError(`no trigger ${id}`)
  const settings = checkTriggerSettings(input, workflow, existing)
  const { verify: _v, filter: _f, mapping: _m, payload_param: _p, notify: _n, callback_url: _c, ...kept } = existing
  const next: WorkflowTrigger = { ...kept, ...settings }
  await getTriggerStore().put(next)
  return next
}

/** A new URL for a trigger; the old one stops working. */
export async function rotateTrigger(id: string): Promise<{ trigger: WorkflowTrigger; token: string }> {
  const token = newToken()
  const trigger = await getTriggerStore().update(id, (t) => t && { ...t, token_hash: hashToken(token), token_hint: `${token.slice(0, 8)}…` })
  if (!trigger) throw new TriggerError(`no trigger ${id}`)
  return { trigger, token }
}

export async function listTriggers(agent: string, workflowId?: string): Promise<WorkflowTrigger[]> {
  return (await getTriggerStore().list()).filter((t) => t.agent === agent && (!workflowId || t.workflow_id === workflowId))
}

/** The trigger a URL's token belongs to. */
export async function findTriggerByToken(token: string): Promise<WorkflowTrigger | undefined> {
  if (!/^whk_[A-Za-z0-9_-]{16,}$/.test(token)) return undefined
  const hash = Buffer.from(hashToken(token), 'hex')
  return (await getTriggerStore().list()).find((t) => {
    const other = Buffer.from(t.token_hash, 'hex')
    return other.length === hash.length && timingSafeEqual(other, hash)
  })
}

// ---------- a delivery ----------

const hmacHex = (secret: string, data: Buffer | string) => createHmac('sha256', secret).update(data).digest('hex')
const sameText = (a: string, b: string) => {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}
const header = (headers: Record<string, string | string[] | undefined>, name: string) => {
  const v = headers[name]
  return Array.isArray(v) ? v[0] : v
}

/** Whether the sender's own signature on the raw body is right. */
export function verifySenderSignature(verify: TriggerVerify, headers: Record<string, string | string[] | undefined>, raw: Buffer, nowS = Math.floor(Date.now() / 1000)): boolean {
  if (verify.sender === 'stripe') {
    const parts = (header(headers, 'stripe-signature') ?? '').split(',').map((p) => p.split('=') as [string, string])
    const t = Number(parts.find(([k]) => k === 't')?.[1])
    if (!Number.isFinite(t) || Math.abs(nowS - t) > SIGNATURE_TOLERANCE_S) return false
    const expected = hmacHex(verify.secret, Buffer.concat([Buffer.from(`${t}.`), raw]))
    return parts.some(([k, v]) => k === 'v1' && typeof v === 'string' && sameText(v, expected))
  }
  if (verify.sender === 'github') {
    const sig = header(headers, 'x-hub-signature-256') ?? ''
    return sig.startsWith('sha256=') && sameText(sig.slice(7), hmacHex(verify.secret, raw))
  }
  if (verify.sender === 'shopify') {
    const sig = header(headers, 'x-shopify-hmac-sha256') ?? ''
    return Boolean(sig) && sameText(sig, createHmac('sha256', verify.secret).update(raw).digest('base64'))
  }
  if (verify.sender === 'standard') {
    // webhook-* headers, or Svix's own svix-* names for the same thing.
    const id = header(headers, 'webhook-id') ?? header(headers, 'svix-id')
    const t = Number(header(headers, 'webhook-timestamp') ?? header(headers, 'svix-timestamp'))
    const sigs = header(headers, 'webhook-signature') ?? header(headers, 'svix-signature') ?? ''
    if (!id || !Number.isFinite(t) || Math.abs(nowS - t) > SIGNATURE_TOLERANCE_S) return false
    const key = Buffer.from(verify.secret.replace(/^whsec_/, ''), 'base64')
    const expected = createHmac('sha256', key).update(Buffer.concat([Buffer.from(`${id}.${t}.`), raw])).digest('base64')
    return sigs.split(' ').some((part) => {
      const [version, sig] = part.split(',')
      return version === 'v1' && typeof sig === 'string' && sameText(sig, expected)
    })
  }
  // custom: an HMAC of the raw body, in the header the sender names.
  const got = (header(headers, verify.header ?? '') ?? '').trim()
  const prefix = verify.prefix ?? ''
  if (!got || (prefix && !got.startsWith(prefix))) return false
  const expected = createHmac(verify.algorithm ?? 'sha256', verify.secret).update(raw).digest(verify.encoding ?? 'hex')
  const value = got.slice(prefix.length)
  return verify.encoding === 'base64' ? sameText(value, expected) : sameText(value.toLowerCase(), expected)
}

/** The payload: JSON, a form, or plain text (as { body }). */
export function parsePayload(raw: Buffer, contentType: string | undefined): unknown {
  const text = raw.toString('utf8')
  if (/application\/x-www-form-urlencoded/i.test(contentType ?? '')) {
    const form = Object.fromEntries(new URLSearchParams(text))
    // Slack-style and some tools put JSON in a "payload" field.
    if (typeof form.payload === 'string') {
      try {
        return JSON.parse(form.payload)
      } catch {
        // Leave it as a form.
      }
    }
    return form
  }
  try {
    return text.trim() ? JSON.parse(text) : {}
  } catch {
    return { body: text }
  }
}

/** The value at a dot path: "data.object.id", "items.0.sku". */
export function valueAt(payload: unknown, dotPath: string): unknown {
  let value: unknown = payload
  for (const key of dotPath.split('.')) {
    if (value === null || value === undefined || typeof value !== 'object') return undefined
    value = (value as Record<string, unknown>)[key]
  }
  return value
}

function asText(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value)
}

/** The sender's id for this delivery, if it gives one: what a retry
 * repeats. */
export function deliveryId(headers: Record<string, string | string[] | undefined>, payload: unknown): string | undefined {
  for (const name of ['x-github-delivery', 'x-shopify-webhook-id', 'idempotency-key', 'x-delivery-id', 'x-request-id']) {
    const v = header(headers, name)
    if (v) return v.slice(0, 200)
  }
  const id = valueAt(payload, 'id')
  return typeof id === 'string' && id ? id.slice(0, 200) : undefined
}

/** Whether the filter keeps this payload. */
export function passesFilter(filter: TriggerFilter | undefined, payload: unknown): boolean {
  if (!filter) return true
  const value = asText(valueAt(payload, filter.path))
  return value !== undefined && filter.values.includes(value)
}

/** The workflow's parameters from the payload. */
export function paramsFromPayload(trigger: Pick<WorkflowTrigger, 'mapping' | 'payload_param'>, payload: unknown): Record<string, string> {
  const params: Record<string, string> = {}
  for (const [param, dotPath] of Object.entries(trigger.mapping ?? {})) {
    const value = asText(valueAt(payload, dotPath))
    if (value !== undefined && value !== '') params[param] = value.slice(0, MAX_PAYLOAD_PARAM)
  }
  if (trigger.payload_param) params[trigger.payload_param] = JSON.stringify(payload).slice(0, MAX_PAYLOAD_PARAM)
  return params
}

/** Notes a delivery on its trigger, and its id as handled. */
export async function recordDelivery(id: string, delivery: TriggerDelivery, seenId?: string): Promise<void> {
  await getTriggerStore().update(id, (t) => t && {
    ...t,
    deliveries: [delivery, ...t.deliveries].slice(0, MAX_DELIVERIES),
    seen_ids: seenId ? [...t.seen_ids.filter((s) => s !== seenId), seenId].slice(-MAX_SEEN) : t.seen_ids,
  })
}
