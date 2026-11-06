import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type Server as HttpServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { parse as parseYaml } from 'yaml'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { generateMcpAbility } from '../core/mcp-ability-generator.js'
import { closeMcpConnections } from '../core/mcp-abilities.js'
import { MCP_SERVERS_FILE_ENV, McpServerInputError, getMcpServer, ownMcpServer, removeSavedMcpServer, saveMcpServer, savedMcpServers } from '../core/mcp-directory.js'
// @ts-expect-error — a plain .mjs test fixture, no type declarations
import { createFakeMcpServer } from './fixtures/fake-mcp-server.mjs'

let dir: string
let file: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'own-mcp-'))
  file = join(dir, 'mcp-servers.yml')
  process.env[MCP_SERVERS_FILE_ENV] = file
})
afterEach(() => {
  delete process.env[MCP_SERVERS_FILE_ENV]
  rmSync(dir, { recursive: true, force: true })
})

describe('your own MCP server', () => {
  it('is checked and named from its title', () => {
    expect(ownMcpServer({ title: 'Acme CRM', url: 'https://mcp.acme.example/mcp', description: 'Our customers', header: 'X-Api-Key' })).toEqual({
      id: 'acme-crm',
      title: 'Acme CRM',
      description: 'Our customers',
      url: 'https://mcp.acme.example/mcp',
      transport: 'streamable-http',
      source: 'saved',
      verified: true,
      auth: { header: 'X-Api-Key' },
    })
    // Authorization is the default, so it isn't kept.
    expect(ownMcpServer({ title: 'Acme', url: 'https://mcp.acme.example/mcp', header: 'Authorization' }).auth).toBeUndefined()
  })

  it('refuses what it can\'t connect to safely', () => {
    const bad = (input: Record<string, unknown>, message: RegExp) => expect(() => ownMcpServer(input)).toThrow(message)
    bad({ url: 'https://mcp.acme.example/mcp' }, /Give the server a name/)
    bad({ title: 'Acme', url: 'mcp.acme.example' }, /full address/)
    bad({ title: 'Acme', url: 'http://mcp.acme.example/mcp' }, /https address/)
    bad({ title: 'Acme', url: 'https://mcp.acme.example/{token}/mcp' }, /nothing left to fill in/)
    bad({ title: 'Acme', url: 'https://mcp.acme.example/mcp', header: 'X Api Key' }, /letters, digits and dashes/)
    expect(() => ownMcpServer({ title: 'x'.repeat(61), url: 'https://a.example' })).toThrow(McpServerInputError)
  })

  it('gets a free id, or the same one for an address already saved', () => {
    const saved = [ownMcpServer({ title: 'Acme CRM', url: 'https://one.example/mcp' })]
    expect(ownMcpServer({ title: 'Acme CRM', url: 'https://two.example/mcp' }, saved).id).toBe('acme-crm-2')
    expect(ownMcpServer({ title: 'Renamed', url: 'https://one.example/mcp' }, saved).id).toBe('acme-crm')
  })

  it('is saved next to the servers already in the file, and can be removed', async () => {
    writeFileSync(file, 'servers:\n  - id: billing\n    title: Billing\n    url: https://billing.example/mcp\n')
    saveMcpServer(ownMcpServer({ title: 'Acme CRM', url: 'https://mcp.acme.example/mcp', header: 'X-Api-Key' }))
    expect(savedMcpServers().map((s) => s.id)).toEqual(['billing', 'acme-crm'])
    expect(await getMcpServer('acme-crm')).toMatchObject({ source: 'saved', auth: { header: 'X-Api-Key' } })

    // Saving it again replaces it.
    saveMcpServer(ownMcpServer({ title: 'Acme CRM', description: 'Customers', url: 'https://mcp.acme.example/mcp' }))
    expect((parseYaml(readFileSync(file, 'utf8')) as { servers: unknown[] }).servers).toEqual([
      { id: 'billing', title: 'Billing', url: 'https://billing.example/mcp' },
      { id: 'acme-crm', title: 'Acme CRM', description: 'Customers', url: 'https://mcp.acme.example/mcp' },
    ])

    expect(removeSavedMcpServer('acme-crm')).toBe(true)
    expect(removeSavedMcpServer('acme-crm')).toBe(false)
    expect(savedMcpServers().map((s) => s.id)).toEqual(['billing'])
  })

  it('isn\'t saved over a file it can\'t read', () => {
    writeFileSync(file, 'servers: [unclosed\n')
    expect(() => saveMcpServer(ownMcpServer({ title: 'Acme', url: 'https://a.example/mcp' }))).toThrow(/couldn't be read/)
    expect(readFileSync(file, 'utf8')).toBe('servers: [unclosed\n')
  })
})

describe('connecting your own server', () => {
  let http: HttpServer
  let base: string
  beforeAll(async () => {
    // Wants its key in X-Api-Key, as many company servers do.
    http = createServer(async (req, res) => {
      if (req.headers['x-api-key'] !== 'secret-123') {
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
  })

  it('sends the key in the header it names, and says so when the key is wrong', async () => {
    const server = ownMcpServer({ title: 'Acme CRM', url: `${base}/mcp`, header: 'X-Api-Key' })
    const workflow = { name: 'Acme CRM for this workspace', summary: 'Everyday work with Acme CRM', steps: [] }
    const generated = await generateMcpAbility({ server, key: 'secret-123', workflow })
    try {
      const manifest = JSON.parse(readFileSync(join(generated.dir, 'loopengine.ability.json'), 'utf8'))
      expect(manifest.mcp.url).toBe(`${base}/mcp`)
      expect(manifest.mcp.auth).toMatchObject({ type: 'key', header: 'X-Api-Key' })
      expect(manifest.mcp.tools.length).toBeGreaterThan(0)
    } finally {
      rmSync(generated.dir, { recursive: true, force: true })
    }
    await expect(generateMcpAbility({ server, key: 'wrong', workflow })).rejects.toThrow(/Acme CRM turned down the key/)
  })
})
