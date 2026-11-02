// Makes a private ability from an MCP server, for the workflow builder:
// connects (with the key the person gave, if any), lists the server's
// tools, picks the ones the workflow needs plus related read-only ones,
// sets each one's permission, writes a skill, and lays it all out as an
// ability package (the `mcp` block of core/mcp-abilities.ts, actauth
// rules, a SKILL.md). The caller stores it as a workspace ability and
// installs it like any other.
//
// Permissions lean strict whatever the model says: a tool may run on its
// own only when the server marks it read-only (or, with no mark, its name
// reads as a lookup); a tool a workflow step must get approval for, and
// anything marked destructive, always asks.
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { stringify as stringifyYaml } from 'yaml'
import type { AgentEnv, ToolSchema } from './agent-config.js'
import type { ModelCall } from './run-agent.js'
import { isReadOnlyToolName } from './gateway-tools.js'
import { isMcpAuthError, listMcpServerTools, type InstalledMcpRecord, type McpToolInfo } from './mcp-abilities.js'
import type { McpDirectoryServer } from './mcp-directory.js'

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
  workflow: { name: string; summary: string; steps: McpAbilityStep[] }
  /** Picks tools and writes the skill; without one, a plainer version. */
  modelCall?: ModelCall
}

export interface GeneratedMcpAbility {
  /** A temporary folder holding the ability package. */
  dir: string
  /** Its package name, e.g. mcp-linear. */
  name: string
  /** The setting its key is read from, when it uses one. */
  keyEnv?: string
  tools: { name: string; remote: string; decision: Decision }[]
  /** Step index → the installed tool name that does it. */
  stepTools: Record<number, string>
}

export class McpAbilityGenerationError extends Error {}

const MAX_TOOLS = 15

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

/** The strict permission for `tool`: allow only for a read-only tool
 * that no approval step uses and the model didn't ask to hold. */
function clampDecision(tool: McpToolInfo, wanted: Decision | undefined, approvalTools: Set<string>): Decision {
  if (approvalTools.has(tool.name) || tool.destructive || !isReadOnly(tool)) return 'ask'
  return wanted === 'ask' ? 'ask' : 'allow'
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

/** Builds the ability package for `request.server`. Throws
 * McpAbilityGenerationError when the server can't be reached or used. */
export async function generateMcpAbility(request: McpAbilityRequest): Promise<GeneratedMcpAbility> {
  const { server, workflow } = request
  const key = request.key?.trim() || undefined
  const names = mcpAbilityNames(server)
  const keyEnv = key ? names.keyEnv : undefined
  const serverBlock: InstalledMcpRecord['server'] = {
    url: server.url,
    ...(server.transport === 'sse' ? { transport: 'sse' as const } : {}),
    auth: keyEnv ? { type: 'key', env: keyEnv, ...(server.auth?.header ? { header: server.auth.header } : {}), ...(server.auth?.prefix !== undefined ? { prefix: server.auth.prefix } : {}) } : { type: 'none' },
  }

  let available: McpToolInfo[]
  try {
    available = await listMcpServerTools(serverBlock, envWith(keyEnv, key))
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (isMcpAuthError(err)) {
      throw new McpAbilityGenerationError(key
        ? `${server.title} turned down the key.`
        : `${server.title} needs a key to connect (or a sign-in, which LoopEngine doesn't support yet). Add its API key and create again.`)
    }
    throw new McpAbilityGenerationError(`Couldn't connect to ${server.title} (${server.url}): ${message}`)
  }
  if (!available.length) throw new McpAbilityGenerationError(`${server.title} offers no tools.`)
  const byName = new Map(available.map((t) => [t.name, t]))
  const approvalTools = new Set<string>()

  const choice = request.modelCall ? await chooseWithModel(request.modelCall, server, workflow, available).catch(() => undefined) : undefined
  const stepRemote = new Map<number, string>()
  for (const step of workflow.steps) {
    const picked = choice?.steps[step.index] ?? (step.tool && byName.has(step.tool) ? step.tool : undefined)
    if (picked && byName.has(picked)) stepRemote.set(step.index, picked)
  }
  for (const step of workflow.steps) {
    const remote = stepRemote.get(step.index)
    if (remote && step.kind === 'approval') approvalTools.add(remote)
  }

  // The steps' tools first, then the model's picks, then (without a
  // model) related read-only ones, up to MAX_TOOLS.
  const chosen: string[] = [...new Set(stepRemote.values())]
  const extra = choice ? choice.tools.map((t) => t.name) : available.length <= MAX_TOOLS ? available.map((t) => t.name) : available.filter(isReadOnly).map((t) => t.name)
  for (const name of extra) if (byName.has(name) && !chosen.includes(name) && chosen.length < MAX_TOOLS) chosen.push(name)
  if (!chosen.length) throw new McpAbilityGenerationError(`None of ${server.title}'s tools fit the workflow's steps.`)

  const wanted = new Map(choice?.tools.map((t) => [t.name, t.decision]) ?? [])
  const toolName = (remote: string) => snake(`${names.prefix}_${remote}`)
  const tools = chosen.map((remote) => ({ name: toolName(remote), remote, decision: clampDecision(byName.get(remote)!, wanted.get(remote), approvalTools) }))
  const stepTools: Record<number, string> = {}
  for (const [index, remote] of stepRemote) stepTools[index] = toolName(remote)

  const skillBody = choice?.skill.body || plainSkill(server, workflow, tools, byName)
  const skillDescription = choice?.skill.description || `How to use ${server.title} (its MCP server): which tool does what, and when to ask first.`

  const dir = mkdtempSync(join(tmpdir(), 'loopengine-mcp-generated-'))
  const skillId = slug(names.prefix)
  mkdirSync(join(dir, 'actauth'), { recursive: true })
  mkdirSync(join(dir, 'skills', skillId), { recursive: true })
  writeFileSync(join(dir, 'package.json'), JSON.stringify({
    name: names.name,
    version: '1.0.0',
    description: `${server.title}${server.description ? `: ${server.description}` : ''} (made from its MCP server)`.slice(0, 300),
    private: true,
    keywords: ['loopengine-ability', 'mcp'],
  }, null, 2) + '\n')
  writeFileSync(join(dir, 'loopengine.ability.json'), JSON.stringify({
    loopengineVersion: '>=0.1.99',
    mcp: { ...serverBlock, tools: chosen, prefix: names.prefix },
    skills: [`skills/${skillId}`],
    actauth: 'actauth/rules.yml',
    env: keyEnv ? [{ name: keyEnv, description: `API key for ${server.title}'s MCP server`, secret: true, scope: 'overridable' }] : [],
    generatedFrom: { server: server.id, url: server.url, source: server.source },
  }, null, 2) + '\n')
  writeFileSync(join(dir, 'actauth', 'rules.yml'), stringifyYaml(tools.map((t) => ({ name: `${names.name}-${t.name.replace(/_/g, '-')}`.slice(0, 80), scope: '*/*', tool: t.name, decision: t.decision }))))
  writeFileSync(join(dir, 'skills', skillId, 'SKILL.md'), `---\nname: ${skillId}\ndescription: ${JSON.stringify(skillDescription.slice(0, 300))}\n---\n\n${skillBody.trim()}\n`)

  return { dir, name: names.name, ...(keyEnv ? { keyEnv } : {}), tools, stepTools }
}

function plainSkill(server: McpDirectoryServer, workflow: McpAbilityRequest['workflow'], tools: GeneratedMcpAbility['tools'], byName: Map<string, McpToolInfo>): string {
  const lines = tools.map((t) => `- \`${t.name}\`${t.decision === 'ask' ? ' (asks first)' : ''}: ${(byName.get(t.remote)?.description || t.remote).split('\n')[0].slice(0, 200)}`)
  return `# ${server.title}\n\nTools from ${server.title}'s MCP server, set up for "${workflow.name}".\n\n${lines.join('\n')}\n\nUse the search and lookup tools to find exact ids before creating or changing anything. A tool marked "asks first" waits for a person's OK.`
}

// ---- Choosing with the model ----

interface ModelChoice {
  tools: { name: string; decision: Decision }[]
  steps: Record<number, string>
  skill: { description: string; body: string }
}

const CHOOSER_PROMPT = `You set up an MCP server's tools for one workflow of a LoopEngine agent.

You get the workflow, the steps that use this server, and every tool the server offers (with its hints: readOnly, destructive). Call save_ability once with:
- steps: for each step listed, the one server tool that does it (its exact name).
- tools: the tools to include. Every tool a step uses, plus a few closely related read-only ones the agent will need (searching or looking up the ids those steps take). At most ${MAX_TOOLS}; leave out anything unrelated. decision: "allow" for reading and searching, "ask" for anything that creates, changes, sends, deletes or spends.
- skill: a short guide for the agent (under 1200 characters): which tool to use for what, in what order, what ids to look up first, and that tools set to "ask" wait for a person. description: one sentence.`

const CHOOSER_TOOL: ToolSchema = {
  name: 'save_ability',
  description: 'Save the chosen tools, the tool for each step, and the skill. Call once.',
  input_schema: {
    type: 'object',
    properties: {
      steps: { type: 'array', items: { type: 'object', properties: { step: { type: 'number' }, tool: { type: 'string' } }, required: ['step', 'tool'] } },
      tools: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, decision: { type: 'string', enum: ['allow', 'ask'] } }, required: ['name', 'decision'] } },
      skill: { type: 'object', properties: { description: { type: 'string' }, body: { type: 'string' } }, required: ['description', 'body'] },
    },
    required: ['steps', 'tools', 'skill'],
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
    `Workflow: ${workflow.name}: ${workflow.summary}`,
    `Server: ${server.title} (${server.url})`,
    `Steps that use it:\n${workflow.steps.map((s) => `- step ${s.index}: ${s.title}${s.detail ? `: ${s.detail}` : ''}${s.kind === 'approval' ? ' (a person approves first)' : ''}${s.tool ? ` (planner suggested ${s.tool})` : ''}`).join('\n')}`,
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
    const tools = (Array.isArray(input.tools) ? input.tools : []).flatMap((t) => {
      const e = (t ?? {}) as { name?: unknown; decision?: unknown }
      return typeof e.name === 'string' ? [{ name: e.name, decision: (e.decision === 'allow' ? 'allow' : 'ask') as Decision }] : []
    })
    const skill = (input.skill ?? {}) as { description?: unknown; body?: unknown }
    return {
      steps,
      tools,
      skill: { description: typeof skill.description === 'string' ? skill.description : '', body: typeof skill.body === 'string' ? skill.body.slice(0, 4000) : '' },
    }
  }
  return undefined
}
