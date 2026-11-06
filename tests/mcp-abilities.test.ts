import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type Server as HttpServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { installAbility, removeAbility, upgradeAbility, AbilityCollisionError, AbilityManifestError } from '../bin/ability-manager.js'
import { readActauthConfig } from '../web/actauth-admin.js'
import { readAbilityDetails } from '../core/ability-details.js'
import { closeMcpConnections, loadMcpAbilityTools, mcpAbilityLoadError } from '../core/mcp-abilities.js'
import { createAgentEnv } from '../core/agent-env.js'
import type { ToolContext } from '../core/agent-config.js'
// @ts-expect-error — a plain .mjs test fixture, no type declarations
import { createFakeMcpServer } from './fixtures/fake-mcp-server.mjs'

// These install made-up packages; the official-ability check has its
// own tests (tests/official-abilities.test.ts).
process.env.LOOPENGINE_ALLOW_UNOFFICIAL_ABILITIES = '1'

const AGENT_NAME = 'mcp-ability-fixture-agent'
const AGENT_DIR = join(process.cwd(), 'agents', AGENT_NAME)
const FAKE_SERVER = join(process.cwd(), 'tests', 'fixtures', 'fake-mcp-server.mjs')

afterEach(async () => {
  await closeMcpConnections()
  rmSync(AGENT_DIR, { recursive: true, force: true })
  delete process.env.FAKE_MCP_KEY
  delete process.env.FAKE_TOKEN_VALUE
  delete process.env.FAKE_DEFAULT_REPO
})

function buildMcpAbility(mcp: Record<string, unknown>, options: { name?: string; version?: string; rules?: string } = {}): string {
  const { name = 'lp-fake', version = '1.0.0', rules = '- name: fake-echo\n  scope: "*/*"\n  tool: fake_echo\n  decision: allow\n- name: fake-fail\n  scope: "*/*"\n  tool: fake_fail\n  decision: ask\n' } = options
  const dir = mkdtempSync(join(tmpdir(), 'loopengine-mcp-ability-'))
  mkdirSync(join(dir, 'actauth'), { recursive: true })
  mkdirSync(join(dir, 'skills', 'fake'), { recursive: true })
  writeFileSync(join(dir, 'actauth', 'rules.yml'), rules)
  writeFileSync(join(dir, 'skills', 'fake', 'SKILL.md'), '---\nname: fake\ndescription: "How to use the fake server"\n---\n\nUse echo.\n')
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name, version, private: true }))
  writeFileSync(join(dir, 'loopengine.ability.json'), JSON.stringify({ loopengineVersion: '*', mcp, skills: ['skills/fake'], actauth: 'actauth/rules.yml' }))
  return dir
}

const stdioMcp = (tools: string[] = ['echo', 'addNumbers', 'fail', 'whoami', 'big'], extra: Record<string, unknown> = {}) => ({
  command: process.execPath,
  args: [FAKE_SERVER],
  tools,
  ...extra,
})

function ctx(): ToolContext {
  return { agentName: AGENT_NAME, tenant: 'default', env: createAgentEnv(AGENT_NAME, AGENT_DIR) }
}

async function install(mcp: Record<string, unknown>, options?: Parameters<typeof buildMcpAbility>[1]) {
  const dir = buildMcpAbility(mcp, options)
  return installAbility(AGENT_NAME, options?.name ?? 'lp-fake', { fetchAbilityDir: () => dir })
}

describe('installing an MCP ability', () => {
  it('records the server and tool names, and installs its rules and skill as usual', async () => {
    const result = await install(stdioMcp())

    expect(result.installed).toEqual(['mcp:fake_echo', 'mcp:fake_add_numbers', 'mcp:fake_fail', 'mcp:fake_whoami', 'mcp:fake_big', 'skills/fake/', 'actauth:fake-echo', 'actauth:fake-fail'])
    expect(existsSync(join(AGENT_DIR, 'tools'))).toBe(false)
    expect(readActauthConfig(AGENT_NAME).rules.map((r) => r.tool)).toEqual(['fake_echo', 'fake_fail'])
    const provenance = JSON.parse(readFileSync(join(AGENT_DIR, '.loopengine-abilities.json'), 'utf8'))
    expect(provenance['lp-fake'].tools).toEqual([])
    expect(provenance['lp-fake'].mcp.tools[1]).toEqual({ name: 'fake_add_numbers', remote: 'addNumbers' })
    expect(provenance['lp-fake'].mcp.server).toEqual({ command: process.execPath, args: [FAKE_SERVER] })
  })

  it('refuses a manifest with neither a url nor a command', async () => {
    await expect(install({ tools: ['echo'] })).rejects.toThrow(AbilityManifestError)
  })

  it('refuses OAuth, which isn\'t supported yet', async () => {
    await expect(install({ url: 'https://example.com/mcp', auth: { type: 'oauth' }, tools: ['echo'] })).rejects.toThrow(/OAuth/)
  })

  it('refuses a plain-http remote server that isn\'t localhost', async () => {
    await expect(install({ url: 'http://example.com/mcp', tools: ['echo'] })).rejects.toThrow(/https/)
  })

  it('refuses a tool name another ability already uses, before writing anything', async () => {
    await install(stdioMcp(['echo']))
    await expect(install(stdioMcp(['echo'], { prefix: 'fake' }), { name: 'lp-fake-two', rules: '[]' })).rejects.toThrow(AbilityCollisionError)
    expect(existsSync(join(AGENT_DIR, 'skills', 'lp-fake-two'))).toBe(false)
  })

  it('uses the manifest prefix when given', async () => {
    const result = await install(stdioMcp(['echo'], { prefix: 'demo' }), { rules: '[]' })
    expect(result.installed[0]).toBe('mcp:demo_echo')
  })

  it('shows its tools and their shipped decisions in the ability details', () => {
    const details = readAbilityDetails(buildMcpAbility(stdioMcp(['echo', 'fail'])))
    expect(details.tools).toEqual([
      { name: 'fake_echo', description: '', decision: 'allow' },
      { name: 'fake_fail', description: '', decision: 'ask' },
    ])
  })
})

describe('loading and calling MCP ability tools (local server)', () => {
  it('exposes only the allowlisted tools, with the server\'s descriptions and schemas', async () => {
    await install(stdioMcp(['echo', 'addNumbers']))
    const tools = await loadMcpAbilityTools(AGENT_DIR, AGENT_NAME)
    expect(tools.map((t) => t.name)).toEqual(['fake_echo', 'fake_add_numbers'])
    expect(tools[0].description).toBe('Echoes the text back')
    expect(tools[0].input_schema).toMatchObject({ properties: { text: { type: 'string' } } })
  })

  it('calls the server tool and returns its text, or its structured content', async () => {
    await install(stdioMcp())
    const tools = await loadMcpAbilityTools(AGENT_DIR, AGENT_NAME)
    const byName = Object.fromEntries(tools.map((t) => [t.name, t]))
    expect(await byName.fake_echo.execute({ text: 'hi' }, ctx())).toBe('echo: hi')
    expect(await byName.fake_add_numbers.execute({ a: 2, b: 3 }, ctx())).toBe('{"sum":5}')
  })

  it('turns a tool error into a thrown error', async () => {
    await install(stdioMcp())
    const fail = (await loadMcpAbilityTools(AGENT_DIR, AGENT_NAME)).find((t) => t.name === 'fake_fail')!
    await expect(fail.execute({}, ctx())).rejects.toThrow('it broke')
  })

  it('cuts off a result longer than maxOutputChars', async () => {
    await install(stdioMcp(['big'], { maxOutputChars: 100 }), { rules: '[]' })
    const [big] = await loadMcpAbilityTools(AGENT_DIR, AGENT_NAME)
    const out = (await big.execute({}, ctx())) as string
    expect(out.startsWith('x'.repeat(100) + '\n\n[cut off at 100 characters]')).toBe(true)
  })

  it('passes ${NAME} settings to a local server\'s environment', async () => {
    process.env.FAKE_TOKEN_VALUE = 'tok-123'
    await install(stdioMcp(['whoami'], { env: { FAKE_TOKEN: '${FAKE_TOKEN_VALUE}' } }), { rules: '[]' })
    const [whoami] = await loadMcpAbilityTools(AGENT_DIR, AGENT_NAME)
    expect(await whoami.execute({}, ctx())).toBe('tok-123')
  })

  it('leaves the tools out, with a reason, when a setting is missing', async () => {
    await install(stdioMcp(['whoami'], { env: { FAKE_TOKEN: '${FAKE_TOKEN_VALUE}' } }), { rules: '[]' })
    expect(await loadMcpAbilityTools(AGENT_DIR, AGENT_NAME)).toEqual([])
    expect(mcpAbilityLoadError(AGENT_DIR, 'lp-fake')).toMatch(/FAKE_TOKEN_VALUE is not set/)
  })

  it('loads from the schema cache without reaching the server', async () => {
    await install(stdioMcp(['echo']))
    await loadMcpAbilityTools(AGENT_DIR, AGENT_NAME)
    expect(existsSync(join(AGENT_DIR, '.loopengine-mcp-cache.json'))).toBe(true)
    await closeMcpConnections()
    const path = join(AGENT_DIR, '.loopengine-abilities.json')
    const provenance = JSON.parse(readFileSync(path, 'utf8'))
    provenance['lp-fake'].mcp.server.command = '/nonexistent/mcp-server'
    writeFileSync(path, JSON.stringify(provenance))
    expect((await loadMcpAbilityTools(AGENT_DIR, AGENT_NAME)).map((t) => t.name)).toEqual(['fake_echo'])
  })

  it('upgrade takes the new version\'s tool list and refetches schemas', async () => {
    await install(stdioMcp(['echo']))
    await loadMcpAbilityTools(AGENT_DIR, AGENT_NAME)
    const newDir = buildMcpAbility(stdioMcp(['echo', 'addNumbers']), { version: '1.1.0' })
    const oldDir = buildMcpAbility(stdioMcp(['echo']))
    const { files } = await upgradeAbility(AGENT_NAME, 'lp-fake', { fetchAbilityDir: (spec) => (spec.endsWith('@1.0.0') ? oldDir : newDir) })
    expect(files).toContainEqual({ path: 'mcp:fake_add_numbers', status: 'updated' })
    expect((await loadMcpAbilityTools(AGENT_DIR, AGENT_NAME)).map((t) => t.name)).toEqual(['fake_echo', 'fake_add_numbers'])
  })

  it('remove takes its tools away and clears the cache', async () => {
    await install(stdioMcp(['echo']))
    await loadMcpAbilityTools(AGENT_DIR, AGENT_NAME)
    const { removed } = removeAbility(AGENT_NAME, 'lp-fake')
    expect(removed).toContain('mcp:fake_echo')
    expect(await loadMcpAbilityTools(AGENT_DIR, AGENT_NAME)).toEqual([])
    expect(JSON.parse(readFileSync(join(AGENT_DIR, '.loopengine-mcp-cache.json'), 'utf8'))).toEqual({})
  })
})

describe('input defaults from settings', () => {
  it('fills owner and repo from one setting, and makes them optional in the schema', async () => {
    process.env.FAKE_DEFAULT_REPO = 'acme/checkout'
    await install(stdioMcp(['repoInfo'], { defaults: { owner: { env: 'FAKE_DEFAULT_REPO', split: '/', part: 0 }, repo: { env: 'FAKE_DEFAULT_REPO', split: '/', part: 1 } } }), { rules: '[]' })
    const [tool] = await loadMcpAbilityTools(AGENT_DIR, AGENT_NAME)
    expect(tool.input_schema.required).toEqual([])
    expect((tool.input_schema.properties as Record<string, { description: string }>).owner.description).toBe('Repository owner. Defaults to acme.')
    expect(await tool.execute({}, ctx())).toBe('acme/checkout')
    expect(await tool.execute({ repo: 'billing' }, ctx())).toBe('acme/billing')
  })

  it('leaves inputs required when the setting isn\'t set', async () => {
    await install(stdioMcp(['repoInfo'], { defaults: { owner: { env: 'FAKE_DEFAULT_REPO', split: '/', part: 0 } } }), { rules: '[]' })
    const [tool] = await loadMcpAbilityTools(AGENT_DIR, AGENT_NAME)
    expect(tool.input_schema.required).toEqual(['owner', 'repo'])
  })

  it('refuses a malformed defaults block', async () => {
    await expect(install(stdioMcp(['repoInfo'], { defaults: { owner: 42 } }), { rules: '[]' })).rejects.toThrow(/defaults/)
  })
})

describe('upgrading from tool files to an MCP server', () => {
  it('removes the old tool files, moves the ability\'s rules to the new tools, and adds new rules', async () => {
    const v1 = mkdtempSync(join(tmpdir(), 'loopengine-mcp-v1-'))
    mkdirSync(join(v1, 'tools'))
    mkdirSync(join(v1, 'actauth'))
    writeFileSync(join(v1, 'tools', 'fake_old.ts'), "export const fakeOld = { name: 'fake_old', description: 'old', input_schema: { type: 'object', properties: {} }, execute: async () => 'old' }\n")
    writeFileSync(join(v1, 'actauth', 'rules.yml'), '- name: fake-read\n  scope: "*/*"\n  tool: fake_old\n  decision: allow\n')
    writeFileSync(join(v1, 'package.json'), JSON.stringify({ name: 'lp-fake', version: '1.0.0' }))
    writeFileSync(join(v1, 'loopengine.ability.json'), JSON.stringify({ loopengineVersion: '*', tools: ['tools/fake_old.ts'], actauth: 'actauth/rules.yml' }))
    await installAbility(AGENT_NAME, 'lp-fake', { fetchAbilityDir: () => v1 })
    expect(existsSync(join(AGENT_DIR, 'tools', 'fake_old.ts'))).toBe(true)

    const v2 = buildMcpAbility(stdioMcp(['echo', 'fail']), { version: '2.0.0', rules: '- name: fake-read\n  scope: "*/*"\n  tool: fake_echo\n  decision: allow\n- name: fake-fail\n  scope: "*/*"\n  tool: fake_fail\n  decision: ask\n' })
    const { files } = await upgradeAbility(AGENT_NAME, 'lp-fake', { fetchAbilityDir: (spec) => (spec.endsWith('@1.0.0') ? v1 : v2) })

    expect(files).toContainEqual({ path: 'tools/fake_old.ts', status: 'removed' })
    expect(files).toContainEqual({ path: 'actauth:fake-read', status: 'updated' })
    expect(files).toContainEqual({ path: 'actauth:fake-fail', status: 'added' })
    expect(existsSync(join(AGENT_DIR, 'tools', 'fake_old.ts'))).toBe(false)
    expect(readFileSync(join(AGENT_DIR, 'tools', 'index.ts'), 'utf8')).not.toContain('fake_old')
    expect(readActauthConfig(AGENT_NAME).rules.map((r) => [r.name, r.tool, r.decision])).toEqual([['fake-read', 'fake_echo', 'allow'], ['fake-fail', 'fake_fail', 'ask']])
    const provenance = JSON.parse(readFileSync(join(AGENT_DIR, '.loopengine-abilities.json'), 'utf8'))
    expect(provenance['lp-fake'].tools).toEqual([])
    expect((await loadMcpAbilityTools(AGENT_DIR, AGENT_NAME)).map((t) => t.name)).toEqual(['fake_echo', 'fake_fail'])
  })

  it('keeps an old tool file that was edited, and reports it', async () => {
    const v1 = mkdtempSync(join(tmpdir(), 'loopengine-mcp-v1-'))
    mkdirSync(join(v1, 'tools'))
    writeFileSync(join(v1, 'tools', 'fake_old.ts'), "export const fakeOld = { name: 'fake_old', description: 'old', input_schema: { type: 'object', properties: {} }, execute: async () => 'old' }\n")
    writeFileSync(join(v1, 'package.json'), JSON.stringify({ name: 'lp-fake', version: '1.0.0' }))
    writeFileSync(join(v1, 'loopengine.ability.json'), JSON.stringify({ loopengineVersion: '*', tools: ['tools/fake_old.ts'] }))
    await installAbility(AGENT_NAME, 'lp-fake', { fetchAbilityDir: () => v1 })
    writeFileSync(join(AGENT_DIR, 'tools', 'fake_old.ts'), '// edited\n' + readFileSync(join(AGENT_DIR, 'tools', 'fake_old.ts'), 'utf8'))

    const v2 = buildMcpAbility(stdioMcp(['echo']), { version: '2.0.0', rules: '[]' })
    const { files } = await upgradeAbility(AGENT_NAME, 'lp-fake', { fetchAbilityDir: (spec) => (spec.endsWith('@1.0.0') ? v1 : v2) })
    expect(files).toContainEqual({ path: 'tools/fake_old.ts', status: 'conflict' })
    expect(existsSync(join(AGENT_DIR, 'tools', 'fake_old.ts'))).toBe(true)
  })
})

describe('loading and calling MCP ability tools (remote server, key auth)', () => {
  let http: HttpServer
  let url: string
  const seenAuth: Array<string | undefined> = []

  beforeAll(async () => {
    http = createServer(async (req, res) => {
      seenAuth.push(req.headers['x-api-key'] as string | undefined)
      if (req.headers['x-api-key'] !== 'key-abc') {
        res.writeHead(401).end()
        return
      }
      // Stateless: a fresh server and transport per request.
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
      await createFakeMcpServer().connect(transport)
      await transport.handleRequest(req, res)
    })
    await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve))
    url = `http://127.0.0.1:${(http.address() as AddressInfo).port}/mcp`
  })

  afterAll(() => new Promise<void>((resolve) => http.close(() => resolve())))

  it('sends the key from the agent\'s settings and calls the tool', async () => {
    process.env.FAKE_MCP_KEY = 'key-abc'
    await install({ url, auth: { type: 'key', env: 'FAKE_MCP_KEY', header: 'X-Api-Key' }, tools: ['echo'] })
    const [echo] = await loadMcpAbilityTools(AGENT_DIR, AGENT_NAME)
    expect(echo.name).toBe('fake_echo')
    expect(await echo.execute({ text: 'remote' }, ctx())).toBe('echo: remote')
    expect(seenAuth.every((h) => h === 'key-abc')).toBe(true)
  })

  it('leaves the tools out when the key is wrong', async () => {
    process.env.FAKE_MCP_KEY = 'wrong'
    await install({ url, auth: { type: 'key', env: 'FAKE_MCP_KEY', header: 'X-Api-Key' }, tools: ['echo'] })
    expect(await loadMcpAbilityTools(AGENT_DIR, AGENT_NAME)).toEqual([])
    expect(mcpAbilityLoadError(AGENT_DIR, 'lp-fake')).toBeTruthy()
  })
})
