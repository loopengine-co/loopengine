// Backs the global /config page's Models and Gateways sections (see
// web/agents-config-page.ts's left sidebar) — the account-wide,
// not-scoped-to-one-agent counterpart to that page's existing per-agent
// Overview/Skills/Tools/ActAuth tabs. "Global" here means: which model
// providers this deployment can actually call (an API-key-in-env-vars
// question, same everywhere regardless of which agent is running) and
// which gateway providers (Composio today) this machine's CLI session
// is authenticated against — neither is a property of any one
// AgentConfig.
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { parse as parseYaml } from 'yaml'
import type { AgentConfig } from '../core/agent-config.js'
import { getComposioAuthStatus } from '../core/gateway-tools.js'
import { moveScheduledTasksToTimeZone } from '../core/scheduler.js'
import { TIME_ZONE_ENV, isValidTimeZone, listTimeZones, serverTimeZone, workspaceTimeZone } from '../core/time-zone.js'
import { setEnvVar, unsetEnvVar } from './env-admin.js'

export interface ModelProviderInfo {
  provider: 'anthropic' | 'openai' | 'deepseek' | 'kimi' | 'glm' | 'gemini' | 'xai' | 'meta'
  envVar: string
  configured: boolean
}

export interface AgentModelUsage {
  agent: string
  provider: string
  model: string
}

export interface ModelsView {
  providers: ModelProviderInfo[]
  agents: AgentModelUsage[]
}

export class ModelKeyError extends Error {}

// One entry per provider agent-config.ts's own AgentModelConfig union
// actually supports (see its own doc comment) — kept here, not derived
// from that type, since there's no runtime list to introspect a TS
// union from; adding a fourth provider means one more line here and one
// more arm in that union, not a rewrite.
const KNOWN_PROVIDERS: Array<{ provider: ModelProviderInfo['provider']; envVar: string }> = [
  { provider: 'openai', envVar: 'OPENAI_API_KEY' },
  { provider: 'anthropic', envVar: 'ANTHROPIC_API_KEY' },
  { provider: 'gemini', envVar: 'GEMINI_API_KEY' },
  // LiteLLM's name; see core/model-calls/meta-model-call.ts.
  { provider: 'meta', envVar: 'META_API_KEY' },
  { provider: 'xai', envVar: 'XAI_API_KEY' },
  { provider: 'deepseek', envVar: 'DEEPSEEK_API_KEY' },
  // Moonshot AI's own env var name, not KIMI_API_KEY — see
  // core/model-calls/kimi-model-call.ts's own header comment for why.
  { provider: 'kimi', envVar: 'MOONSHOT_API_KEY' },
  { provider: 'glm', envVar: 'GLM_API_KEY' },
]

/** Every registered agent's resolved model, alongside whether each
 * supported provider actually has credentials available in this
 * process's environment — an operator's first question when a request
 * fails isn't "what does this one agent request?" (Overview's own Model
 * section already answers that) but "is this deployment even set up to
 * call that provider at all?". Read-only: providers/env vars are wired
 * into the actual model-call modules (model-calls/*.ts), not something
 * this page can add support for by itself. An agent with a custom
 * `createModelCall` (no `config.model`) is skipped — there's no
 * provider/model pair to report for it, the same "custom" case
 * describeAgent's own model field already carves out.
 *
 * Takes the registered agent names and a config lookup as parameters,
 * rather than importing core/agent-registry.ts's listAgents/getEntry
 * directly — that module is this repo's own reference app, not part of
 * the published package (see index.ts's own header comment), and its
 * top-level-await agent scan is resolved relative to *its own* file
 * location, which would be meaningless run from inside node_modules.
 * Every caller already has its own local registry's listAgents/getEntry
 * on hand (adapters/http.ts, in this repo or a scaffolded project alike)
 * to pass straight through. */
export function describeModelProviders(agentNames: string[], getConfig: (name: string) => AgentConfig | undefined): ModelsView {
  const providers = KNOWN_PROVIDERS.map(({ provider, envVar }) => ({
    provider,
    envVar,
    configured: Boolean(process.env[envVar]),
  }))

  const agents: AgentModelUsage[] = []
  for (const name of agentNames) {
    const config = getConfig(name)
    if (config?.model) {
      agents.push({ agent: name, provider: config.model.provider, model: config.model.model ?? '(provider default)' })
    }
  }

  return { providers, agents }
}

export interface GatewayProviderInfo {
  provider: string
  supported: boolean
  connected: boolean
  email?: string
  org?: string
}

export interface GatewaysView {
  gateways: GatewayProviderInfo[]
}

/** The provider-level counterpart to gateway-tools.ts's own registry
 * (which is scoped to one agent's chosen tools within an already-
 * connected provider) — this is "is Composio itself usable from this
 * machine at all", not "what has agent X registered". Nango/Arcade/
 * Scalekit are listed as not-yet-supported placeholders, matching
 * gateway-tools.ts's own header comment about them slotting in later as
 * thin mcpplug ToolSource adapters once this mechanism is proven —
 * shown so the Gateways panel isn't silently missing them, not because
 * there's anything to check for them yet. */
export async function describeGateways(cliCommand = 'composio'): Promise<GatewaysView> {
  const composio = await getComposioAuthStatus(cliCommand)
  return {
    gateways: [
      { provider: 'composio', supported: true, connected: composio.connected, email: composio.email, org: composio.org },
      { provider: 'scalekit', supported: false, connected: false },
      { provider: 'nango', supported: false, connected: false },
      { provider: 'arcade', supported: false, connected: false },
    ],
  }
}

/** The env var a provider's key lives in, or undefined for an unknown
 * provider. */
export function modelKeyEnvVar(provider: string): string | undefined {
  return KNOWN_PROVIDERS.find((p) => p.provider === provider)?.envVar
}

/**
 * Saves a provider's API key from the console's Models page, through the
 * same secret store as the Environment tab (the project's .env by
 * default), and applies it to this process, so the next model call uses
 * it without a restart. Write-only: nothing here or in describeModelProviders
 * ever returns a key, only whether one is set.
 */
export async function setModelProviderKey(provider: string, key: unknown): Promise<void> {
  const envVar = modelKeyEnvVar(provider)
  if (!envVar) throw new ModelKeyError(`unknown provider '${provider}'`)
  const value = typeof key === 'string' ? key.trim() : ''
  // Keys are single tokens; whitespace inside one is a paste mistake.
  if (value.length < 8 || value.length > 500 || /\s/.test(value)) {
    throw new ModelKeyError('That doesn\'t look like an API key: paste the whole key, with no spaces or line breaks.')
  }
  await setEnvVar(envVar, value)
}

export async function clearModelProviderKey(provider: string): Promise<void> {
  const envVar = modelKeyEnvVar(provider)
  if (!envVar) throw new ModelKeyError(`unknown provider '${provider}'`)
  await unsetEnvVar(envVar)
}

export interface ProviderModelsView {
  provider: string
  /** Model ids to offer, newest first where the provider says when each
   * was released. Empty when they couldn't be listed (see `error`). */
  models: string[]
  /** Why the list is short or empty: no key saved (only common models,
   * if any, are listed), or the provider refused or timed out. Shown
   * under the dropdown. */
  error?: string
}

// The OpenAI-compatible providers' base URLs, the same ones their
// model-calls/*.ts use (OpenAI's own comes from the SDK, so
// OPENAI_BASE_URL applies to both). Anthropic has its own models API.
const OPENAI_COMPATIBLE_BASE_URLS: Partial<Record<ModelProviderInfo['provider'], string>> = {
  deepseek: 'https://api.deepseek.com',
  kimi: 'https://api.moonshot.ai/v1',
  glm: 'https://open.bigmodel.cn/api/paas/v4/',
  gemini: 'https://generativelanguage.googleapis.com/v1beta/openai/',
  xai: 'https://api.x.ai/v1',
  meta: 'https://api.meta.ai/v1',
}

// OpenAI and Gemini also list models a chat agent can't use.
const NON_CHAT_MODEL = /embed|tts|whisper|dall-e|davinci|babbage|moderation|transcribe|image|audio|realtime|search|aqa|imagen|veo|sora/i

// Offered when the provider's own list isn't available (no key saved
// yet, or the provider refused) and models.yaml doesn't list it. Only
// names checked against the provider's docs (2026-10-31); other
// providers need a key to list theirs. Meta's "-contributor" variants are
// left out, since choosing one lets Meta train on the requests; type one
// under "Other" to use it.
const KNOWN_MODELS: Partial<Record<ModelProviderInfo['provider'], string[]>> = {
  anthropic: ['claude-fable-5-1', 'claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-sonnet-5'],
  deepseek: ['deepseek-v4-pro', 'deepseek-flash'],
  meta: ['muse-spark-1.3', 'muse-wonder-1.0', 'muse-spark-1.2', 'muse-spark-1.1'],
}

const MODEL_LIST_TTL_MS = 10 * 60 * 1000
const modelListCache = new Map<string, { key: string; at: number; models: string[] }>()

export const MODELS_FILE_ENV = 'LOOPENGINE_MODELS_FILE'

/** models.yaml in the project root (where .env is), or the file
 * LOOPENGINE_MODELS_FILE names (absolute, or relative to the root). */
export function modelsFilePath(): string {
  return resolve(process.cwd(), process.env[MODELS_FILE_ENV]?.trim() || 'models.yaml')
}

/**
 * The hand-edited model lists in models.yaml: provider name to the models
 * its dropdown offers, in order.
 *
 *   anthropic:
 *     - claude-opus-5-5
 *     - claude-sonnet-5-5
 *
 * Read fresh on every call (it's a few lines), so an edit shows the next
 * time a dropdown loads. A missing file is no lists; a malformed one is
 * reported in `error` and ignored as a whole, so a typo can't hide one
 * provider's models while the rest still load.
 */
export function readModelsFile(): { models: Partial<Record<ModelProviderInfo['provider'], string[]>>; error?: string } {
  const path = modelsFilePath()
  if (!existsSync(path)) return { models: {} }
  const name = process.env[MODELS_FILE_ENV]?.trim() || 'models.yaml'
  let data: unknown
  try {
    data = parseYaml(readFileSync(path, 'utf8'))
  } catch (err) {
    return { models: {}, error: `${name} isn't valid YAML: ${err instanceof Error ? err.message : String(err)}` }
  }
  if (data == null) return { models: {} }
  if (typeof data !== 'object' || Array.isArray(data)) return { models: {}, error: `${name} should map each provider to a list of models.` }

  const models: Partial<Record<ModelProviderInfo['provider'], string[]>> = {}
  for (const [provider, list] of Object.entries(data as Record<string, unknown>)) {
    if (!modelKeyEnvVar(provider)) {
      return { models: {}, error: `${name}: unknown provider '${provider}'. Use one of ${KNOWN_PROVIDERS.map((p) => p.provider).join(', ')}.` }
    }
    // An empty key ("openai:") means no list, same as leaving it out.
    if (list == null) continue
    if (!Array.isArray(list) || list.some((m) => typeof m !== 'string' || !m.trim())) {
      return { models: {}, error: `${name}: '${provider}' should be a list of model names.` }
    }
    models[provider as ModelProviderInfo['provider']] = [...new Set(list.map((m: string) => m.trim()))]
  }
  return { models }
}

/**
 * The models a provider offers, for the model dropdown in the New agent
 * and Model forms. A provider listed in models.yaml (readModelsFile)
 * offers exactly that list, with no key needed. Otherwise this asks the
 * provider itself with the saved key (cached for ten minutes per key),
 * so new models show up without a release. Never throws for a provider
 * problem: the view carries an `error` instead, and the form lets the
 * model name be typed. Throws ModelKeyError for an unknown provider.
 */
export async function listProviderModels(provider: string, options: { fetch?: typeof fetch } = {}): Promise<ProviderModelsView> {
  const envVar = modelKeyEnvVar(provider)
  if (!envVar) throw new ModelKeyError(`unknown provider '${provider}'`)

  const file = readModelsFile()
  const fromFile = file.models[provider as ModelProviderInfo['provider']]
  if (fromFile) return { provider, models: fromFile }
  const view = await listProviderModelsLive(provider, envVar, options)
  return file.error ? { ...view, error: view.error ? `${file.error} ${view.error}` : file.error } : view
}

async function listProviderModelsLive(provider: string, envVar: string, options: { fetch?: typeof fetch }): Promise<ProviderModelsView> {
  const key = process.env[envVar]
  if (!key) {
    const known = KNOWN_MODELS[provider as ModelProviderInfo['provider']] ?? []
    return {
      provider,
      models: known,
      error: known.length
        ? `Showing common ${provider} models. Save ${envVar} on the Models page to list all of them.`
        : `No ${envVar} saved. Save it on the Models page to list ${provider}'s models, or choose Other.`,
    }
  }

  const cached = modelListCache.get(provider)
  if (cached && cached.key === key && Date.now() - cached.at < MODEL_LIST_TTL_MS) return { provider, models: cached.models }

  const clientOptions = { apiKey: key, timeout: 10_000, maxRetries: 0, ...(options.fetch ? { fetch: options.fetch } : {}) }
  try {
    const listed: Array<{ id: string; created: number }> = []
    if (provider === 'anthropic') {
      // Already newest first.
      for await (const model of new Anthropic(clientOptions).models.list({ limit: 1000 })) {
        listed.push({ id: model.id, created: 0 })
      }
    } else {
      const client = new OpenAI({ ...clientOptions, baseURL: OPENAI_COMPATIBLE_BASE_URLS[provider as ModelProviderInfo['provider']] })
      for await (const model of client.models.list()) {
        // Gemini's ids come back as "models/gemini-...", but its chat
        // endpoint takes the bare name.
        listed.push({ id: model.id.replace(/^models\//, ''), created: model.created ?? 0 })
      }
    }
    const models = listed
      .filter((model) => (provider === 'openai' || provider === 'gemini' ? !NON_CHAT_MODEL.test(model.id) : true))
      .sort((a, b) => b.created - a.created)
      .map((model) => model.id)
      .filter((id, index, ids) => ids.indexOf(id) === index)
    modelListCache.set(provider, { key, at: Date.now(), models })
    return { provider, models }
  } catch (err) {
    const known = KNOWN_MODELS[provider as ModelProviderInfo['provider']]
    if (known) return { provider, models: known }
    return { provider, models: [], error: `Couldn't list ${provider}'s models: ${err instanceof Error ? err.message : String(err)}` }
  }
}

export class TimeZoneError extends Error {}

export interface TimeZoneView {
  /** The one in use. */
  timeZone: string
  /** Whether it was chosen (LOOPENGINE_TIME_ZONE), not the server's. */
  chosen: boolean
  server: string
  zones: string[]
}

export function describeTimeZone(): TimeZoneView {
  const timeZone = workspaceTimeZone()
  const configured = process.env[TIME_ZONE_ENV]?.trim()
  return { timeZone, chosen: Boolean(configured && isValidTimeZone(configured)), server: serverTimeZone(), zones: listTimeZones() }
}

/**
 * The console's Settings → Time zone: saved like a model key (the
 * project's .env by default) and applied to this process at once. New
 * schedules and template start times use it from then on; with
 * `moveSchedules`, existing daily and weekly schedules move to it too,
 * keeping their time of day. An empty value goes back to the server's.
 */
export async function setWorkspaceTimeZone(value: unknown, options: { moveSchedules?: boolean } = {}): Promise<{ timeZone: string; moved: number }> {
  const requested = typeof value === 'string' ? value.trim() : ''
  if (requested && !isValidTimeZone(requested)) throw new TimeZoneError(`"${requested}" isn't a time zone this server knows, such as America/New_York or Europe/London`)
  const before = workspaceTimeZone()
  // Saved by its canonical name ("america/new_york" → "America/New_York").
  if (requested) await setEnvVar(TIME_ZONE_ENV, new Intl.DateTimeFormat('en-US', { timeZone: requested }).resolvedOptions().timeZone)
  else await unsetEnvVar(TIME_ZONE_ENV)
  const timeZone = workspaceTimeZone()
  const moved = options.moveSchedules && timeZone !== before ? await moveScheduledTasksToTimeZone(before, timeZone) : 0
  return { timeZone, moved }
}
