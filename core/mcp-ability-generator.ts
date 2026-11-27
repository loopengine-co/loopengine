// Makes an app's ability from its MCP server: connects (with the key the
// person gave, if any), lists every tool the server offers, gives each a
// default permission, and lays it all out as an ability package (the
// `mcp` block of core/mcp-abilities.ts and actauth rules). The caller
// stores it as a workspace ability: the app, as the Apps page shows it.
//
// No skill: each tool's own description says what it does, and a guide
// written for every tool the server offers mostly covered tools an agent
// wasn't given, cost tokens in every run, and led models to open it
// before calling a tool their instructions already named.
//
// The package lists every tool; an agent that adds the app chooses which
// of them it gets and with what permission (installAbility's mcpTools).
// For the workflow builder it also works out which tool does each step
// the app is used for, so Create can add exactly those.
//
// Default permissions lean strict: a tool runs on its own only when the
// server marks it read-only (or, with no mark, its name reads as a
// lookup); anything else, and anything marked destructive, asks.
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { stringify as stringifyYaml } from 'yaml'
import type { AgentEnv, ToolSchema } from './agent-config.js'
import type { ModelCall } from './run-agent.js'
import { isReadOnlyToolName } from './gateway-tools.js'
import { isMcpAuthError, listMcpServerTools, mcpToolName, type InstalledMcpRecord, type McpToolInfo } from './mcp-abilities.js'
import type { McpDirectoryServer } from './mcp-directory.js'
import { mcpOAuthEnvName } from './mcp-oauth.js'

export type Decision = 'allow' | 'ask'

export interface McpAbilityStep {
  /** The step's place in the workflow (0-based). */
  index: number
  title: string
  kind: 'tool' | 'ask' | 'approval' | 'other'
  detail?: string
  /** The server tool the planner named, if it could see them. */
  tool?: string
}

export interface McpAbilityRequest {
  server: McpDirectoryServer
  key?: string
  /** Use the sign-in saved for the app (core/mcp-oauth.ts) instead of a
   * key. */
  signedIn?: boolean
  /** Steps the app is used for, to work out each one's tool (workflow
   * builder); none when it's connected from the Apps page. */
  workflow?: { name: string; summary: string; steps: McpAbilityStep[] }
  /** Matches steps to tools; without one, steps match only by the tool
   * the planner named. */
  modelCall?: ModelCall
}

export interface GeneratedMcpAbility {
  /** A temporary folder holding the ability package. */
  dir: string
  /** Its package name, e.g. mcp-linear. */
  name: string
  /** The setting its key is read from, when it uses one. */
  keyEnv?: string
  /** The setting its sign-in is kept in, when it uses one. */
  oauthEnv?: string
  /** Every tool, with its default permission. */
  tools: { name: string; remote: string; decision: Decision }[]
  /** Step index → the server tool that does it. */
  stepTools: Record<number, string>
}

export class McpAbilityGenerationError extends Error {
  /** The server turned the connection down for want of credentials. */
  needsAuth: boolean

  constructor(message: string, options: { needsAuth?: boolean } = {}) {
    super(message)
    this.needsAuth = options.needsAuth ?? false
  }
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30).replace(/-+$/, '') || 'server'
}

const snake = (value: string): string => value.replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').toLowerCase()

/** Names for a server's ability: mcp-<slug>, tools <prefix>_<tool>, key <PREFIX>_MCP_KEY. */
export function mcpAbilityNames(server: Pick<McpDirectoryServer, 'id' | 'title'>): { name: string; prefix: string; keyEnv: string } {
  const base = slug(server.title || server.id.split('/').pop() || server.id)
  const prefix = snake(base)
  return { name: `mcp-${base}`, prefix, keyEnv: `${prefix.toUpperCase()}_MCP_KEY` }
}

function isReadOnly(tool: McpToolInfo): boolean {
  return tool.readOnly ?? (tool.destructive ? false : isReadOnlyToolName(snake(tool.name)))
}

/** A tool's default permission: Allow for a read-only tool, Ask me for
 * anything else. */
export function defaultMcpDecision(tool: McpToolInfo): Decision {
  return tool.destructive || !isReadOnly(tool) ? 'ask' : 'allow'
}

function envWith(name: string | undefined, value: string | undefined): AgentEnv {
  const get = (n: string) => (n === name ? value : undefined)
  return {
    get,
    require(n) {
      const v = get(n)
      if (v === undefined) throw new McpAbilityGenerationError(`${n} is needed`)
      return v
    },
  }
}

/** Builds the app's ability package from `request.server`. Throws
 * McpAbilityGenerationError when the server can't be reached or used. */
export async function generateMcpAbility(request: McpAbilityRequest): Promise<GeneratedMcpAbility> {
  const { server } = request
  const steps = request.workflow?.steps ?? []
  const key = request.key?.trim() || undefined
  const names = mcpAbilityNames(server)
  const keyEnv = key ? names.keyEnv : undefined
  const oauthEnv = !key && request.signedIn ? mcpOAuthEnvName(names.prefix) : undefined
  const serverBlock: InstalledMcpRecord['server'] = {
    url: server.url,
    ...(server.headers ? { headers: server.headers } : {}),
    ...(server.transport === 'sse' ? { transport: 'sse' as const } : {}),
    auth: oauthEnv ? { type: 'oauth', env: oauthEnv } : keyEnv ? { type: 'key', env: keyEnv, ...(server.auth?.header ? { header: server.auth.header } : {}), ...(server.auth?.prefix !== undefined ? { prefix: server.auth.prefix } : {}) } : { type: 'none' },
  }

  let available: McpToolInfo[]
  try {
    available = await listMcpServerTools(serverBlock, oauthEnv ? envWith(oauthEnv, process.env[oauthEnv]) : envWith(keyEnv, key))
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (isMcpAuthError(err)) {
      throw new McpAbilityGenerationError(key
        ? `${server.title} turned down the key.`
        : oauthEnv
          ? `${server.title} turned down the sign-in.`
          : `${server.title} needs a key or a sign-in to connect.`, { needsAuth: true })
    }
    throw new McpAbilityGenerationError(`Couldn't connect to ${server.title} (${server.url}): ${message}`)
  }
  if (!available.length) throw new McpAbilityGenerationError(`${server.title} offers no tools.`)
  // Two server tools that would get the same installed name: keep the first.
  const seen = new Set<string>()
  available = available.filter((t) => {
    const installed = mcpToolName(names.prefix, t.name)
    if (seen.has(installed)) return false
    seen.add(installed)
    return true
  })
  const byName = new Map(available.map((t) => [t.name, t]))

  const choice = request.modelCall && steps.length ? await chooseWithModel(request.modelCall, server, request.workflow, available).catch(() => undefined) : undefined
  const stepTools: Record<number, string> = {}
  for (const step of steps) {
    const picked = choice?.steps[step.index] ?? (step.tool && byName.has(step.tool) ? step.tool : undefined)
    if (picked && byName.has(picked)) stepTools[step.index] = picked
  }

  const toolName = (remote: string) => mcpToolName(names.prefix, remote)
  const tools = available.map((t) => ({ name: toolName(t.name), remote: t.name, decision: defaultMcpDecision(t) }))

  const dir = mkdtempSync(join(tmpdir(), 'loopengine-mcp-generated-'))
  mkdirSync(join(dir, 'actauth'), { recursive: true })
  writeFileSync(join(dir, 'package.json'), JSON.stringify({
    name: names.name,
    version: '1.0.0',
    description: `${server.title}${server.description ? `: ${server.description}` : ''} (made from its MCP server)`.slice(0, 300),
    private: true,
    keywords: ['loopengine-ability', 'mcp'],
  }, null, 2) + '\n')
  writeFileSync(join(dir, 'loopengine.ability.json'), JSON.stringify({
    loopengineVersion: '>=0.1.99',
    mcp: { ...serverBlock, tools: tools.map((t) => t.remote), prefix: names.prefix },
    skills: [],
    actauth: 'actauth/rules.yml',
    env: keyEnv ? [{ name: keyEnv, description: `API key for ${server.title}'s MCP server`, secret: true, scope: 'overridable' }] : [],
    generatedFrom: { server: server.id, url: server.url, source: server.source },
  }, null, 2) + '\n')
  writeFileSync(join(dir, 'actauth', 'rules.yml'), stringifyYaml(tools.map((t) => ({ name: appRuleName(names.name, t.name), scope: '*/*', tool: t.name, decision: t.decision }))))

  return { dir, name: names.name, ...(keyEnv ? { keyEnv } : {}), ...(oauthEnv ? { oauthEnv } : {}), tools, stepTools }
}

/** The name of an app ability's rule for one of its tools. */
export function appRuleName(abilityName: string, toolName: string): string {
  return `${abilityName}-${toolName.replace(/_/g, '-')}`.slice(0, 80)
}

// ---- Matching steps with the model ----

interface ModelChoice {
  steps: Record<number, string>
}

const CHOOSER_PROMPT = `You set up an app's MCP server for LoopEngine agents.

You get the app, every tool its server offers (with its hints: readOnly, destructive), and the workflow steps that use it. Call save_ability once with:
- steps: for each step listed, the one server tool that does it (its exact name).`

const CHOOSER_TOOL: ToolSchema = {
  name: 'save_ability',
  description: 'Save the tool for each step. Call once.',
  input_schema: {
    type: 'object',
    properties: {
      steps: { type: 'array', items: { type: 'object', properties: { step: { type: 'number' }, tool: { type: 'string' } }, required: ['step', 'tool'] } },
    },
    required: ['steps'],
  },
}

async function chooseWithModel(modelCall: ModelCall, server: McpDirectoryServer, workflow: McpAbilityRequest['workflow'], available: McpToolInfo[]): Promise<ModelChoice | undefined> {
  const toolList = available.slice(0, 200).map((t) => ({
    name: t.name,
    description: t.description.split('\n')[0].slice(0, 240),
    ...(t.readOnly !== undefined ? { readOnly: t.readOnly } : {}),
    ...(t.destructive ? { destructive: true } : {}),
  }))
  const content = [
    `App: ${server.title} (${server.url})`,
    workflow?.steps.length
      ? `Workflow: ${workflow.name}: ${workflow.summary}\n\nSteps that use it:\n${workflow.steps.map((s) => `- step ${s.index}: ${s.title}${s.detail ? `: ${s.detail}` : ''}${s.kind === 'approval' ? ' (a person approves first)' : ''}${s.tool ? ` (planner suggested ${s.tool})` : ''}`).join('\n')}`
      : 'No workflow: the app is being connected for the workspace. Leave steps empty.',
    `Its tools:\n${JSON.stringify(toolList)}`,
  ].join('\n\n')
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await modelCall([{ role: 'user', content: attempt ? `${content}\n\nCall save_ability now.` : content }], CHOOSER_PROMPT, [CHOOSER_TOOL])
    const call = response.content.find((b) => b.type === 'tool_use' && b.name === 'save_ability')
    if (!call) continue
    const input = (call.input ?? {}) as Record<string, unknown>
    const steps: Record<number, string> = {}
    for (const s of Array.isArray(input.steps) ? input.steps : []) {
      const e = (s ?? {}) as { step?: unknown; tool?: unknown }
      if (typeof e.step === 'number' && typeof e.tool === 'string') steps[e.step] = e.tool
    }
    return { steps }
  }
  return undefined
}
