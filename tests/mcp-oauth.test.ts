import { createHash } from 'node:crypto'
import { readFileSync, rmSync } from 'node:fs'
import { createServer, type IncomingMessage, type Server as HttpServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { installAbility } from '../bin/ability-manager.js'
import { closeMcpConnections, loadMcpAbilityTools } from '../core/mcp-abilities.js'
import { generateMcpAbility, mcpAbilityNames } from '../core/mcp-ability-generator.js'
import { McpSignInError, finishMcpSignIn, mcpOAuthEnvName, mcpSignInSupport, parseMcpOAuthState, startMcpSignIn } from '../core/mcp-oauth.js'
import { getSecretStore, setSecretStore, type SecretStore } from '../core/secret-store.js'
import { createAgentEnv } from '../core/agent-env.js'
import type { McpDirectoryServer } from '../core/mcp-directory.js'

process.env.LOOPENGINE_ALLOW_UNOFFICIAL_ABILITIES = '1'

const AGENT_NAME = 'mcp-oauth-fixture-agent'
const AGENT_DIR = join(process.cwd(), 'agents', AGENT_NAME)
const REDIRECT = 'http://console.test/config/apps/oauth/callback'

// An app whose MCP server only takes a sign-in: protected resource
// metadata, an authorization server with dynamic registration and PKCE,
// and refresh tokens. /authorize approves at once, as if the person
// clicked Allow.
const fake = {
  registration: true,
  issued: 0,
  valid: new Set<string>(),
  codes: new Map<string, { challenge: string; clientId: string; redirect: string }>(),
  refreshTokens: new Set<string>(),
  registered: [] as Record<string, unknown>[],
}
let http: HttpServer
let base = ''

async function body(req: IncomingMessage): Promise<string> {
  let text = ''
  for await (const chunk of req) text += chunk
  return text
}

beforeAll(async () => {
  http = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', base)
    const send = (status: number, value: unknown, headers: Record<string, string> = {}) => res.writeHead(status, { 'content-type': 'application/json', ...headers }).end(JSON.stringify(value))
    if (url.pathname.startsWith('/.well-known/oauth-protected-resource')) return send(200, { resource: `${base}/mcp`, authorization_servers: [base] })
    if (url.pathname === '/.well-known/oauth-authorization-server') {
      return send(200, {
        issuer: base,
        authorization_endpoint: `${base}/authorize`,
        token_endpoint: `${base}/token`,
        ...(fake.registration ? { registration_endpoint: `${base}/register` } : {}),
        response_types_supported: ['code'],
        code_challenge_methods_supported: ['S256'],
        grant_types_supported: ['authorization_code', 'refresh_token'],
        token_endpoint_auth_methods_supported: ['none'],
      })
    }
    if (url.pathname === '/register' && req.method === 'POST') {
      const meta = JSON.parse(await body(req)) as Record<string, unknown>
      fake.registered.push(meta)
      return send(201, { ...meta, client_id: `client-${fake.registered.length}` })
    }
    if (url.pathname === '/authorize') {
      const code = `code-${fake.codes.size + 1}`
      fake.codes.set(code, { challenge: url.searchParams.get('code_challenge') ?? '', clientId: url.searchParams.get('client_id') ?? '', redirect: url.searchParams.get('redirect_uri') ?? '' })
      const back = new URL(url.searchParams.get('redirect_uri')!)
      back.searchParams.set('code', code)
      back.searchParams.set('state', url.searchParams.get('state') ?? '')
      return res.writeHead(302, { location: back.toString() }).end()
    }
    if (url.pathname === '/token' && req.method === 'POST') {
      const form = new URLSearchParams(await body(req))
      const issue = () => {
        fake.issued++
        const access = `at-${fake.issued}`
        const refresh = `rt-${fake.issued}`
        fake.valid.add(access)
        fake.refreshTokens.add(refresh)
        return send(200, { access_token: access, refresh_token: refresh, token_type: 'Bearer', expires_in: 3600 })
      }
      if (form.get('grant_type') === 'authorization_code') {
        const code = fake.codes.get(form.get('code') ?? '')
        const challenge = createHash('sha256').update(form.get('code_verifier') ?? '').digest('base64url')
        if (!code || code.challenge !== challenge || code.redirect !== form.get('redirect_uri')) return send(400, { error: 'invalid_grant' })
        fake.codes.delete(form.get('code')!)
        return issue()
      }
      if (form.get('grant_type') === 'refresh_token' && fake.refreshTokens.delete(form.get('refresh_token') ?? '')) return issue()
      return send(400, { error: 'invalid_grant' })
    }
    if (url.pathname === '/mcp') {
      const token = String(req.headers.authorization ?? '').replace(/^Bearer /, '')
      if (!fake.valid.has(token)) {
        return send(401, { error: 'invalid_token' }, { 'www-authenticate': `Bearer resource_metadata="${base}/.well-known/oauth-protected-resource/mcp"` })
      }
      const server = new McpServer({ name: 'fake-oauth', version: '1.0.0' })
      server.registerTool('whoami', { description: 'The token this call used', annotations: { readOnlyHint: true } }, async () => ({ content: [{ type: 'text', text: token }] }))
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
      await server.connect(transport)
      return transport.handleRequest(req, res)
    }
    send(404, { error: 'not found' })
  })
  await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${(http.address() as AddressInfo).port}`
})

afterAll(() => new Promise<void>((resolve) => http.close(() => resolve())))

// Settings go to memory, not the project's .env.
const shared: Record<string, string> = {}
let original: SecretStore
beforeAll(() => {
  original = getSecretStore()
  setSecretStore({
    readAgentValues: () => ({}),
    setShared: (name, value) => { shared[name] = value },
    unsetShared: (name) => { delete shared[name] },
    setAgent: () => {},
    unsetAgent: () => {},
  })
})
afterAll(() => setSecretStore(original))

const server: McpDirectoryServer = { id: 'test.fake/oauth', title: 'Fake OAuth', description: 'A test app', url: '', transport: 'streamable-http', source: 'saved', verified: true }
const envName = mcpOAuthEnvName(mcpAbilityNames(server).prefix)

afterEach(async () => {
  await closeMcpConnections()
  rmSync(AGENT_DIR, { recursive: true, force: true })
  delete process.env[envName]
  fake.registration = true
})

/** Signs in the way the console does: start, follow the app's sign-in
 * page back to the console's address, finish. */
async function signIn(): Promise<{ state: string; code: string }> {
  const support = await mcpSignInSupport(`${base}/mcp`)
  if (!support.ok) throw new Error(`no sign-in: ${support.reason}`)
  const { authorizeUrl } = await startMcpSignIn({ serverUrl: `${base}/mcp`, envName, appId: server.id, appTitle: server.title, redirectUrl: REDIRECT, discovery: support.discovery })
  const page = await fetch(authorizeUrl, { redirect: 'manual' })
  const back = new URL(page.headers.get('location')!)
  expect(`${back.origin}${back.pathname}`).toBe(REDIRECT)
  const returned = { state: back.searchParams.get('state')!, code: back.searchParams.get('code')! }
  expect(await finishMcpSignIn(returned.state, returned.code)).toEqual({ appId: server.id })
  return returned
}

describe('signing in to an app (OAuth)', () => {
  it('registers LoopEngine, signs in with PKCE and saves the sign-in as a workspace setting', async () => {
    await signIn()
    expect(fake.registered.at(-1)).toMatchObject({ client_name: 'LoopEngine', redirect_uris: [REDIRECT], token_endpoint_auth_method: 'none' })
    const saved = parseMcpOAuthState(process.env[envName])
    expect(saved.tokens?.access_token).toMatch(/^at-/)
    expect(saved.client?.client_id).toMatch(/^client-/)
    expect(saved.redirectUrl).toBe(REDIRECT)
    expect(shared[envName]).toBe(process.env[envName])
  })

  it('uses each returned sign-in once', async () => {
    const { state, code } = await signIn()
    await expect(finishMcpSignIn(state, code)).rejects.toThrow(McpSignInError)
    await expect(finishMcpSignIn('made-up', 'code')).rejects.toThrow(/expired or was already used/)
  })

  it('says when the app has no sign-in, or only one for apps registered by hand', async () => {
    fake.registration = false
    expect(await mcpSignInSupport(`${base}/mcp`)).toEqual({ ok: false, reason: 'no-registration' })
    expect(await mcpSignInSupport('http://127.0.0.1:1/mcp')).toEqual({ ok: false, reason: 'none' })
  })

  it('makes the app\'s ability with the sign-in, and its tools call the server with the token, refreshing it when it expires', async () => {
    await signIn()
    const generated = await generateMcpAbility({ server: { ...server, url: `${base}/mcp` }, signedIn: true })
    expect(generated.oauthEnv).toBe(envName)
    const manifest = JSON.parse(readFileSync(join(generated.dir, 'loopengine.ability.json'), 'utf8'))
    expect(manifest.mcp.auth).toEqual({ type: 'oauth', env: envName })
    expect(manifest.env).toEqual([])

    await installAbility(AGENT_NAME, generated.name, { fetchAbilityDir: () => generated.dir })
    const [whoami] = await loadMcpAbilityTools(AGENT_DIR, AGENT_NAME)
    const ctx = { agentName: AGENT_NAME, tenant: 'default', env: createAgentEnv(AGENT_NAME, AGENT_DIR) }
    const first = parseMcpOAuthState(process.env[envName]).tokens!.access_token
    expect(await whoami.execute({}, ctx)).toBe(first)

    // The app expires the token: the next call refreshes it, saves the
    // new one and goes through.
    fake.valid.delete(first)
    const second = await whoami.execute({}, ctx)
    expect(second).not.toBe(first)
    expect(parseMcpOAuthState(process.env[envName]).tokens!.access_token).toBe(second)
    expect(parseMcpOAuthState(shared[envName]).tokens!.access_token).toBe(second)
    rmSync(generated.dir, { recursive: true, force: true })
  })

  it('without a sign-in, says the app needs one', async () => {
    await expect(generateMcpAbility({ server: { ...server, url: `${base}/mcp` } })).rejects.toMatchObject({ needsAuth: true, message: expect.stringMatching(/key or a sign-in/) })
  })
})
