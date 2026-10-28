// Backs the global /config page's Models and Gateways sections (see
// web/agents-config-page.ts's left sidebar) — the account-wide,
// not-scoped-to-one-agent counterpart to that page's existing per-agent
// Overview/Skills/Tools/ActAuth tabs. "Global" here means: which model
// providers this deployment can actually call (an API-key-in-env-vars
// question, same everywhere regardless of which agent is running) and
// which gateway providers (Composio today) this machine's CLI session
// is authenticated against — neither is a property of any one
// AgentConfig.
import type { AgentConfig } from '../core/agent-config.js'
import { getComposioAuthStatus } from '../core/gateway-tools.js'
import { moveScheduledTasksToTimeZone } from '../core/scheduler.js'
import { TIME_ZONE_ENV, isValidTimeZone, listTimeZones, serverTimeZone, workspaceTimeZone } from '../core/time-zone.js'
import { setEnvVar, unsetEnvVar } from './env-admin.js'

export interface ModelProviderInfo {
  provider: 'anthropic' | 'openai' | 'deepseek' | 'kimi' | 'glm' | 'gemini'
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
  { provider: 'anthropic', envVar: 'ANTHROPIC_API_KEY' },
  { provider: 'openai', envVar: 'OPENAI_API_KEY' },
  { provider: 'deepseek', envVar: 'DEEPSEEK_API_KEY' },
  // Moonshot AI's own env var name, not KIMI_API_KEY — see
  // core/model-calls/kimi-model-call.ts's own header comment for why.
  { provider: 'kimi', envVar: 'MOONSHOT_API_KEY' },
  { provider: 'glm', envVar: 'GLM_API_KEY' },
  { provider: 'gemini', envVar: 'GEMINI_API_KEY' },
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
