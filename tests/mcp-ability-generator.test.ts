import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type Server as HttpServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { parse as parseYaml } from 'yaml'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { generateMcpAbility, mcpAbilityNames, McpAbilityGenerationError } from '../core/mcp-ability-generator.js'
import { getMcpServer, registryTitle, searchMcpServers, MCP_REGISTRY_URL_ENV, MCP_SERVERS_FILE_ENV, type McpDirectoryServer } from '../core/mcp-directory.js'
import { closeMcpConnections, loadMcpAbilityTools } from '../core/mcp-abilities.js'
import { installAbility } from '../bin/ability-manager.js'
import { createAgentEnv } from '../core/agent-env.js'
import { prepareMcpAbilities, resolveMcpServers, type WorkflowMcpCreateDeps } from '../web/workflow-admin.js'
import { validateWorkflowPlan, type WorkflowPlan } from '../core/system-agents/workflow-planner.js'
import type { ModelCall } from '../core/run-agent.js'
// @ts-expect-error — a plain .mjs test fixture, no type declarations
import { createFakeMcpServer } from './fixtures/fake-mcp-server.mjs'

// These install made-up packages; the official-ability check has its
// own tests (tests/official-abilities.test.ts).
process.env.LOOPENGINE_ALLOW_UNOFFICIAL_ABILITIES = '1'

const AGENT_NAME = 'mcp-generator-fixture-agent'
const AGENT_DIR = join(process.cwd(), 'agents', AGENT_NAME)

let http: HttpServer
let base: string
let requiredKey: string | undefined
let registryBody: unknown = { servers: [] }

beforeAll(async () => {
  http = createServer(async (req, res) => {
    if (req.url?.startsWith('/v0/servers')) {
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(registryBody))
      return
    }
    if (requiredKey && req.headers.authorization !== `Bearer ${requiredKey}`) {
      res.writeHead(401).end()
      return
    }
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
    await createFakeMcpServer().connect(transport)
    await transport.handleRequest(req, res)
  })
  await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${(http.address() as AddressInfo).port}`
})

afterAll(() => new Promise<void>((resolve) => http.close(() => resolve())))

afterEach(async () => {
  await closeMcpConnections()
  requiredKey = undefined
  registryBody = { servers: [] }
  rmSync(AGENT_DIR, { recursive: true, force: true })
  delete process.env.FAKE_MCP_KEY
  delete process.env[MCP_REGISTRY_URL_ENV]
  delete process.env[MCP_SERVERS_FILE_ENV]
})

const server = (): McpDirectoryServer => ({ id: 'dev.fake/fake', title: 'Fake', description: 'A fake app', url: `${base}/mcp`, transport: 'streamable-http', source: 'registry', verified: false })

const workflow = {
  name: 'Things',
  summary: 'Make a thing after checking the list',
  steps: [
    { index: 0, title: 'Look at the things', kind: 'tool' as const, tool: 'listThings' },
    { index: 2, title: 'Create the thing', kind: 'approval' as const, tool: 'createThing' },
  ],
}

function readRules(dir: string): Array<{ tool: string; decision: string }> {
  return parseYaml(readFileSync(join(dir, 'actauth', 'rules.yml'), 'utf8'))
}

describe('generateMcpAbility', () => {
  it('without a model: the steps\' tools plus read-only ones, strict permissions, and an installable package', async () => {
    const generated = await generateMcpAbility({ server: server(), workflow })

    expect(generated.name).toBe('mcp-fake')
    expect(generated.stepTools).toEqual({ 0: 'listThings', 2: 'createThing' })
    // Every tool the server offers, each at its default permission.
    expect(generated.tools.map((t) => t.name)).toContain('fake_secret_admin')
    const decisions = Object.fromEntries(generated.tools.map((t) => [t.name, t.decision]))
    expect(decisions.fake_list_things).toBe('allow')
    expect(decisions.fake_create_thing).toBe('ask')
    expect(decisions.fake_fail).toBe('ask')
    expect(readRules(generated.dir).find((r) => r.tool === 'fake_create_thing')?.decision).toBe('ask')
    const manifest = JSON.parse(readFileSync(join(generated.dir, 'loopengine.ability.json'), 'utf8'))
    expect(manifest.mcp).toMatchObject({ url: `${base}/mcp`, auth: { type: 'none' }, prefix: 'fake' })
    expect(manifest.mcp.tools).toHaveLength(generated.tools.length)
    expect(readFileSync(join(generated.dir, 'skills', 'fake', 'SKILL.md'), 'utf8')).toContain('fake_create_thing')

    await installAbility(AGENT_NAME, 'mcp-fake', { fetchAbilityDir: () => generated.dir, mcpTools: ['listThings', 'createThing'] })
    const tools = await loadMcpAbilityTools(AGENT_DIR, AGENT_NAME)
    const create = tools.find((t) => t.name === 'fake_create_thing')!
    expect(await create.execute({ title: 'x' }, { agentName: AGENT_NAME, tenant: 'default', env: createAgentEnv(AGENT_NAME, AGENT_DIR) })).toBe('created x')
  })

  it('with a model: its step choices and skill, with the installed tool names', async () => {
    const modelCall: ModelCall = async () => ({
      stop_reason: 'tool_use',
      content: [{
        type: 'tool_use',
        id: 'c1',
        name: 'save_ability',
        input: {
          steps: [{ step: 0, tool: 'listThings' }, { step: 2, tool: 'createThing' }],
          skill: { description: 'Using Fake', body: 'Use listThings, then createThing.' },
        },
      }],
    })
    const generated = await generateMcpAbility({ server: server(), workflow: { ...workflow, steps: workflow.steps.map(({ tool: _t, ...s }) => s) }, modelCall })

    expect(generated.stepTools).toEqual({ 0: 'listThings', 2: 'createThing' })
    expect(readFileSync(join(generated.dir, 'skills', 'fake', 'SKILL.md'), 'utf8')).toContain('Use fake_list_things, then fake_create_thing.')
  })

  it('sends a key, and records the setting it is read from', async () => {
    requiredKey = 'k-1'
    const generated = await generateMcpAbility({ server: server(), key: 'k-1', workflow })
    expect(generated.keyEnv).toBe('FAKE_MCP_KEY')
    const manifest = JSON.parse(readFileSync(join(generated.dir, 'loopengine.ability.json'), 'utf8'))
    expect(manifest.mcp.auth).toEqual({ type: 'key', env: 'FAKE_MCP_KEY' })
    expect(manifest.env[0]).toMatchObject({ name: 'FAKE_MCP_KEY', secret: true })
  })

  it('says a key is needed when the server turns it away without one', async () => {
    requiredKey = 'k-1'
    await expect(generateMcpAbility({ server: server(), workflow })).rejects.toThrow(McpAbilityGenerationError)
    await expect(generateMcpAbility({ server: server(), workflow })).rejects.toThrow(/needs a key/)
  })
})

describe('the MCP directory', () => {
  it('reads the registry: remote servers only, verified when on the publisher\'s domain, no {placeholder} URLs', async () => {
    process.env[MCP_REGISTRY_URL_ENV] = base
    registryBody = {
      servers: [
        { server: { name: 'io.github.someone/stripe', description: 'a proxy', remotes: [{ type: 'streamable-http', url: 'https://proxy.example.com/stripe' }] } },
        { server: { name: 'com.stripe/mcp', title: 'Stripe', description: 'Stripe', remotes: [{ type: 'streamable-http', url: 'https://mcp.stripe.com' }] } },
        { server: { name: 'eu.tokenized/stripe', remotes: [{ type: 'streamable-http', url: 'https://tokenized.eu/mcp/{token}' }] } },
        { server: { name: 'io.github.local/only', packages: [{}] } },
      ],
    }
    registryBody = { servers: [{ server: { name: 'app.vercel.checkup/stripe', remotes: [{ type: 'streamable-http', url: 'https://checkup.vercel.app/mcp' }] } }, ...(registryBody as { servers: unknown[] }).servers] }
    const found = await searchMcpServers('stripe')
    expect(found.map((s) => [s.id, s.verified, s.official])).toEqual([['com.stripe/mcp', true, true], ['app.vercel.checkup/stripe', true, false], ['io.github.someone/stripe', false, false]])
  })

  it('names a server with no title after its app, not "mcp"', async () => {
    expect(registryTitle('com.stripe/mcp')).toBe('Stripe')
    expect(registryTitle('com.paypal.mcp/mcp')).toBe('Paypal')
    expect(registryTitle('com.notion/mcp-server')).toBe('Notion')
    expect(registryTitle('io.github.getsentry/sentry-mcp')).toBe('Sentry')
    expect(registryTitle('io.github.acme/mcp')).toBe('Acme')
    expect(registryTitle('app.linear/linear')).toBe('Linear')
    expect(registryTitle('ai.exa/web-search')).toBe('Web Search')

    process.env[MCP_REGISTRY_URL_ENV] = base
    registryBody = { servers: [{ server: { name: 'com.stripe/mcp', description: 'Stripe', remotes: [{ type: 'streamable-http', url: 'https://mcp.stripe.com' }] } }] }
    const [stripe] = await searchMcpServers('stripe')
    expect(stripe.title).toBe('Stripe')
    expect(mcpAbilityNames(stripe)).toMatchObject({ name: 'mcp-stripe', keyEnv: 'STRIPE_MCP_KEY' })
  })

  it('treats a server published under a GitHub organisation as the app\'s own when its URL is on a domain named like it', async () => {
    process.env[MCP_REGISTRY_URL_ENV] = base
    registryBody = {
      servers: [
        { server: { name: 'io.github.someone/firecrawl-proxy', remotes: [{ type: 'streamable-http', url: 'https://proxy.example.com/firecrawl' }] } },
        { server: { name: 'io.github.firecrawl/firecrawl-mcp-server', title: 'Firecrawl MCP Server', remotes: [{ type: 'streamable-http', url: 'https://mcp.firecrawl.dev/v2/mcp' }] } },
      ],
    }
    const found = await searchMcpServers('firecrawl')
    expect(found.map((s) => [s.id, s.verified, s.official])).toEqual([['io.github.firecrawl/firecrawl-mcp-server', true, true], ['io.github.someone/firecrawl-proxy', false, false]])
  })

  it('puts the workspace\'s saved servers first', async () => {
    process.env[MCP_REGISTRY_URL_ENV] = 'off'
    const file = join(process.cwd(), 'agents', `${AGENT_NAME}-servers.yml`)
    writeFileSync(file, 'servers:\n  - id: acme-crm\n    title: Acme CRM\n    url: https://mcp.acme.example/mcp\n    auth: { header: X-Api-Key, prefix: "" }\n')
    process.env[MCP_SERVERS_FILE_ENV] = file
    try {
      expect((await searchMcpServers('acme')).map((s) => s.id)).toEqual(['acme-crm'])
      expect(await getMcpServer('acme-crm')).toMatchObject({ verified: true, source: 'saved', auth: { header: 'X-Api-Key', prefix: '' } })
    } finally {
      rmSync(file, { force: true })
    }
  })
})

describe('MCP servers in a workflow plan', () => {
  function plan(): WorkflowPlan {
    return validateWorkflowPlan({
      name: 'Things',
      summary: 'Make a thing',
      trigger: { kind: 'on_request', description: 'when asked' },
      steps: [
        { title: 'Look at the things', kind: 'tool', mcp: 'dev.fake/fake', tool: 'listThings' },
        { title: 'Create the thing', kind: 'approval', mcp: 'dev.fake/fake', tool: 'createThing' },
      ],
      rules: [{ tool: 'createThing', decision: 'allow' }],
      skill: { description: 'd', body: 'Run listThings, then createThing.' },
      startMessage: 'go',
    })!
  }

  it('drops rules for MCP tools: they\'re set when the ability is made', () => {
    expect(plan().rules).toEqual([])
    expect(plan().steps[0].mcp).toBe('dev.fake/fake')
  })

  it('lists the server with its ability name, and marks steps missing when the server is gone', async () => {
    const p = plan()
    await resolveMcpServers(p, { getServer: async () => server(), existingFor: () => undefined, keyValue: () => undefined })
    expect(p.mcpServers).toEqual([expect.objectContaining({ id: 'dev.fake/fake', ability: 'mcp-fake', keyEnv: 'FAKE_MCP_KEY', keySet: false })])

    const gone = plan()
    await resolveMcpServers(gone, { getServer: async () => undefined, existingFor: () => undefined, keyValue: () => undefined })
    expect(gone.steps[0].missing).toMatch(/couldn't be found/)
    expect(gone.mcpServers).toBeUndefined()
  })

  it("on Create: an app that isn't connected leaves its steps missing and is reported", async () => {
    const p = plan()
    const deps: WorkflowMcpCreateDeps = {
      getServer: async () => server(),
      existingFor: () => undefined,
      keyValue: () => undefined,
      generate: async () => { throw new Error('should not generate') },
    }
    await resolveMcpServers(p, deps)
    const result = await prepareMcpAbilities(p, deps)
    expect(result.failed).toEqual([{ name: 'Fake', error: 'connect Fake on the Apps page first' }])
    expect(p.steps.every((s) => s.missing === 'Fake: connect Fake on the Apps page first')).toBe(true)
    expect(p.apps).toBeUndefined()
  })

  it('on Create: matches steps to the connected app\'s tools when the plan doesn\'t name them', async () => {
    requiredKey = 'k-2'
    const p = plan()
    p.steps[1].tool = 'something_else'
    const deps: WorkflowMcpCreateDeps = {
      getServer: async () => server(),
      existingFor: () => ({ spec: 'file:/ws/mcp-fake', tools: [{ name: 'fake_list_things', remote: 'listThings' }, { name: 'fake_create_thing', remote: 'createThing' }] }),
      keyValue: () => 'k-2',
      generate: (request) => generateMcpAbility(request),
    }
    await resolveMcpServers(p, deps)
    const result = await prepareMcpAbilities(p, deps)
    expect(result).toEqual({ failed: [] })
    // Without a model to pick, a step keeps only a tool the server has.
    expect(p.steps.map((s) => [s.tool, s.ability, s.missing])).toEqual([['fake_list_things', 'file:/ws/mcp-fake', undefined], [undefined, 'file:/ws/mcp-fake', 'Fake has no tool for this']])
    expect(p.apps).toEqual([{ id: 'dev.fake/fake', title: 'Fake', tools: ['listThings'] }])
  })

  it('on Create: reuses the workspace ability already made from the server', async () => {
    const p = plan()
    const deps: WorkflowMcpCreateDeps = {
      getServer: async () => server(),
      existingFor: () => ({ spec: 'file:/ws/mcp-fake', tools: [{ name: 'fake_list_things', remote: 'listThings' }, { name: 'fake_create_thing', remote: 'createThing' }] }),
      keyValue: () => undefined,
      generate: async () => { throw new Error('should not generate') },
    }
    await resolveMcpServers(p, deps)
    expect(p.mcpServers?.[0].existing).toBe('file:/ws/mcp-fake')
    const result = await prepareMcpAbilities(p, deps)
    expect(result).toEqual({ failed: [] })
    expect(p.steps.map((s) => s.tool)).toEqual(['fake_list_things', 'fake_create_thing'])
    expect(p.abilities).toEqual([])
    expect(p.apps).toEqual([{ id: 'dev.fake/fake', title: 'Fake', tools: ['listThings', 'createThing'] }])
  })

  it('doesn\'t repeat a prefix the tool name already has', async () => {
    const { mcpToolName } = await import('../core/mcp-abilities.js')
    expect(mcpToolName('exa', 'web_search_exa')).toBe('web_search_exa')
    expect(mcpToolName('linear', 'list_issues')).toBe('linear_list_issues')
  })

  it('names abilities after the server', () => {
    expect(mcpAbilityNames({ id: 'app.linear/linear', title: 'Linear' })).toEqual({ name: 'mcp-linear', prefix: 'linear', keyEnv: 'LINEAR_MCP_KEY' })
  })
})
