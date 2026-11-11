import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type Server as HttpServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { generateMcpAbility } from '../core/mcp-ability-generator.js'
import { addWorkspaceAbility, WORKSPACE_ABILITIES_DIR_ENV } from '../core/workspace-abilities.js'
import { appTools, refreshAppTools, setAppDefault, AppToolsError } from '../core/mcp-apps.js'
import { closeMcpConnections, loadMcpAbilityTools } from '../core/mcp-abilities.js'
import { addActauthRule, applyPlannedRules, readActauthConfig } from '../web/actauth-admin.js'
import { AbilityManifestError, configureAgentMcpTools, installAbility, listInstalledAbilities } from '../bin/ability-manager.js'
// @ts-expect-error — a plain .mjs test fixture, no type declarations
import { createFakeMcpServer } from './fixtures/fake-mcp-server.mjs'

// These install made-up packages; the official-ability check has its
// own tests (tests/official-abilities.test.ts).
process.env.LOOPENGINE_ALLOW_UNOFFICIAL_ABILITIES = '1'

const AGENT_NAME = 'mcp-app-tools-fixture-agent'
const AGENT_DIR = join(process.cwd(), 'agents', AGENT_NAME)
const env = () => undefined

let http: HttpServer
let url: string
let workspaceDir: string

beforeAll(async () => {
  http = createServer(async (req, res) => {
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
    await createFakeMcpServer().connect(transport)
    await transport.handleRequest(req, res)
  })
  await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve))
  url = `http://127.0.0.1:${(http.address() as AddressInfo).port}/mcp`
})
afterAll(() => new Promise<void>((resolve) => http.close(() => resolve())))

beforeEach(() => {
  workspaceDir = mkdtempSync(join(tmpdir(), 'loopengine-ws-'))
  process.env[WORKSPACE_ABILITIES_DIR_ENV] = workspaceDir
})
afterEach(async () => {
  await closeMcpConnections()
  delete process.env[WORKSPACE_ABILITIES_DIR_ENV]
  rmSync(workspaceDir, { recursive: true, force: true })
  rmSync(AGENT_DIR, { recursive: true, force: true })
})

/** The fake app, connected to the workspace (every tool, default permissions). */
async function connect(): Promise<string> {
  const generated = await generateMcpAbility({ server: { id: 'dev.fake/fake', title: 'Fake', description: '', url, transport: 'streamable-http', source: 'saved', verified: true } })
  return addWorkspaceAbility(generated.dir, `mcp:${url}`).spec
}

const install = (spec: string, options: Parameters<typeof installAbility>[2] = {}) => installAbility(AGENT_NAME, 'mcp-fake', { fetchAbilityDir: () => spec.replace(/^file:/, ''), ...options })
const loaded = async () => (await loadMcpAbilityTools(AGENT_DIR, AGENT_NAME)).map((t) => t.name).sort()

describe('a connected app', () => {
  it('has every server tool, each at its default permission', async () => {
    const spec = await connect()
    const tools = Object.fromEntries((await appTools(spec, env, {})).map((t) => [t.remote, t]))
    expect(Object.keys(tools)).toContain('secret_admin')
    expect(tools.getThing).toMatchObject({ name: 'fake_get_thing', decision: 'allow', readOnly: true, usedBy: [] })
    expect(tools.listThings.decision).toBe('allow')
    expect(tools.createThing.decision).toBe('ask')
    expect(tools.secret_admin).toMatchObject({ decision: 'ask', destructive: true })
  })

  it('shows which agents use each tool, with their permission', async () => {
    const spec = await connect()
    const tools = await appTools(spec, env, { support: [{ remote: 'listThings', decision: 'ask' }] })
    expect(tools.find((t) => t.remote === 'listThings')?.usedBy).toEqual([{ agent: 'support', decision: 'ask' }])
  })

  it('a changed default is what an agent adding the tool starts from', async () => {
    const spec = await connect()
    setAppDefault(spec, 'getThing', 'ask')
    expect((await appTools(spec, env, {})).find((t) => t.remote === 'getThing')?.decision).toBe('ask')
    await install(spec, { mcpTools: ['getThing'] })
    expect(readActauthConfig(AGENT_NAME).rules.find((r) => r.tool === 'fake_get_thing')?.decision).toBe('ask')
    expect(() => setAppDefault(spec, 'nope', 'allow')).toThrow(AppToolsError)
  })

  it('checking for new tools adds them at their default', async () => {
    const spec = await connect()
    const manifestPath = join(spec.replace(/^file:/, ''), 'loopengine.ability.json')
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    manifest.mcp.tools = manifest.mcp.tools.filter((t: string) => t !== 'createThing').concat(['gone_tool'])
    writeFileSync(manifestPath, JSON.stringify(manifest))
    expect(await refreshAppTools(spec, env)).toEqual({ added: ['createThing'], removed: ['gone_tool'] })
    expect((await appTools(spec, env, {})).find((t) => t.remote === 'createThing')?.decision).toBe('ask')
  })
})

describe('adding an app to an agent', () => {
  it('gets just the chosen tools, with the permissions chosen', async () => {
    const spec = await connect()
    await install(spec, { mcpTools: ['listThings', 'createThing'], mcpDecisions: { createThing: 'deny' } })
    expect(await loaded()).toEqual(['fake_create_thing', 'fake_list_things'])
    const rules = readActauthConfig(AGENT_NAME).rules
    expect(rules.map((r) => [r.tool, r.decision]).sort()).toEqual([['fake_create_thing', 'deny'], ['fake_list_things', 'allow']])
  })

  it("for a workflow: just its steps' tools, under the app, and the workflow's rules add none of their own", async () => {
    const spec = await connect()
    // What Create does: the app with the steps' tools, then the plan's rules.
    await install(spec, { mcpTools: ['getThing', 'createThing'] })
    const ruled = applyPlannedRules(AGENT_NAME, [{ tool: 'fake_get_thing', decision: 'allow' }, { tool: 'fake_create_thing', decision: 'ask' }])
    expect(ruled).toEqual({ added: [], unchanged: ['fake_get_thing', 'fake_create_thing'], kept: [] })
    expect(await loaded()).toEqual(['fake_create_thing', 'fake_get_thing'])
    const app = listInstalledAbilities(AGENT_NAME).find((a) => a.name === 'mcp-fake')!
    expect(app.mcp?.tools.map((t) => t.name).sort()).toEqual(['fake_create_thing', 'fake_get_thing'])
    // Every rule is the app's.
    const rules = readActauthConfig(AGENT_NAME).rules
    expect(rules.map((r) => r.tool).sort()).toEqual(['fake_create_thing', 'fake_get_thing'])
    expect(rules.every((r) => app.actauthRules.includes(r.name))).toBe(true)
  })

  it("for a workflow on an agent that has the app: the tool turned on is the app's too", async () => {
    const spec = await connect()
    await install(spec, { mcpTools: ['getThing'] })
    configureAgentMcpTools(AGENT_NAME, 'mcp-fake', spec.replace(/^file:/, ''), [{ remote: 'getThing', decision: 'allow' }, { remote: 'createThing', decision: 'ask' }])
    expect(applyPlannedRules(AGENT_NAME, [{ tool: 'fake_create_thing', decision: 'ask' }]).added).toEqual([])
    const app = listInstalledAbilities(AGENT_NAME).find((a) => a.name === 'mcp-fake')!
    const rule = readActauthConfig(AGENT_NAME).rules.find((r) => r.tool === 'fake_create_thing')!
    expect(app.actauthRules).toContain(rule.name)
  })

  it('with no choice, gets only the read-only tools', async () => {
    const spec = await connect()
    await install(spec)
    const names = await loaded()
    expect(names).toContain('fake_get_thing')
    expect(names).not.toContain('fake_create_thing')
    expect(names).not.toContain('fake_secret_admin')
  })

  it('refuses an unknown tool, or none', async () => {
    const spec = await connect()
    await expect(install(spec, { mcpTools: ['nope'] })).rejects.toThrow(AbilityManifestError)
    await expect(install(spec, { mcpTools: [] })).rejects.toThrow(/at least one/)
  })
})

describe('changing an agent\'s tools from an app', () => {
  it('adds, removes and re-permissions tools for that agent only', async () => {
    const spec = await connect()
    await install(spec, { mcpTools: ['listThings', 'getThing'] })
    const dir = spec.replace(/^file:/, '')
    const result = configureAgentMcpTools(AGENT_NAME, 'mcp-fake', dir, [{ remote: 'listThings', decision: 'ask' }, { remote: 'createThing', decision: 'ask' }])
    expect(result).toEqual({ added: ['fake_create_thing'], removed: ['fake_get_thing'], changed: ['fake_list_things'] })
    expect(await loaded()).toEqual(['fake_create_thing', 'fake_list_things'])
    const rules = readActauthConfig(AGENT_NAME).rules
    expect(rules.some((r) => r.tool === 'fake_get_thing')).toBe(false)
    expect(rules.find((r) => r.tool === 'fake_list_things')?.decision).toBe('ask')
    expect(rules.find((r) => r.tool === 'fake_create_thing')?.decision).toBe('ask')
  })

  it('changes an agent\'s own rule for a tool rather than shadowing it', async () => {
    const spec = await connect()
    await install(spec, { mcpTools: ['listThings'] })
    addActauthRule(AGENT_NAME, { name: 'template-things', scope: '*/*', tool: 'fake_create_thing', decision: 'ask' })
    configureAgentMcpTools(AGENT_NAME, 'mcp-fake', spec.replace(/^file:/, ''), [{ remote: 'listThings', decision: 'allow' }, { remote: 'createThing', decision: 'allow' }])
    const rules = readActauthConfig(AGENT_NAME).rules.filter((r) => r.tool === 'fake_create_thing')
    expect(rules).toEqual([expect.objectContaining({ name: 'template-things', decision: 'allow' })])
  })

  it('needs at least one tool', async () => {
    const spec = await connect()
    await install(spec, { mcpTools: ['listThings'] })
    expect(() => configureAgentMcpTools(AGENT_NAME, 'mcp-fake', spec.replace(/^file:/, ''), [])).toThrow(/at least one/)
  })
})
