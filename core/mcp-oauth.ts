// Signing in to an app's MCP server with OAuth, for apps that offer a
// sign-in instead of (or as well as) an API key. The MCP SDK does the
// protocol (discovery, dynamic client registration, PKCE, refresh); this
// keeps its state.
//
// Everything a signed-in app needs (its client registration, tokens and
// where its authorization server is) is one JSON setting,
// <PREFIX>_MCP_OAUTH, saved through the secret store like an API key, so
// it lives wherever the workspace keeps its keys. A refreshed token is
// saved back the same way.
//
// Signing in takes two requests: startMcpSignIn gives the address of the
// app's sign-in page, and the app sends the browser back to the console
// with a code, which finishMcpSignIn swaps for tokens. In between, the
// PKCE verifier stays in memory here, keyed by the OAuth `state`.
import { randomBytes } from 'node:crypto'
import { auth, discoverOAuthServerInfo, type OAuthClientProvider, type OAuthDiscoveryState } from '@modelcontextprotocol/sdk/client/auth.js'
import type { OAuthClientInformationMixed, OAuthClientMetadata, OAuthTokens } from '@modelcontextprotocol/sdk/shared/auth.js'
import { getSecretStore } from './secret-store.js'

export interface McpOAuthState {
  /** The console address the app sends the browser back to. */
  redirectUrl?: string
  client?: OAuthClientInformationMixed
  tokens?: OAuthTokens
  discovery?: OAuthDiscoveryState
}

export class McpSignInError extends Error {}

/** The setting a signed-in app's state is kept in. */
export function mcpOAuthEnvName(prefix: string): string {
  return `${prefix.toUpperCase()}_MCP_OAUTH`
}

export function parseMcpOAuthState(value: string | undefined): McpOAuthState {
  if (!value) return {}
  try {
    const parsed = JSON.parse(value) as unknown
    return parsed && typeof parsed === 'object' ? (parsed as McpOAuthState) : {}
  } catch {
    return {}
  }
}

/** Saves a signed-in app's state as a workspace setting, and in this
 * process so it's used at once. */
export async function saveMcpOAuthState(envName: string, state: McpOAuthState): Promise<void> {
  const value = JSON.stringify(state)
  await getSecretStore().setShared(envName, value)
  process.env[envName] = value
}

interface ProviderOptions {
  state: McpOAuthState
  /** Reads the saved state afresh (at run time, where other connections
   * may have refreshed the tokens since); `state` is used without it. */
  read?: () => McpOAuthState
  /** Called with the state after anything in it changes. */
  persist?: (state: McpOAuthState) => void | Promise<void>
  /** Where to send the browser to sign in; without it, a server that
   * wants a new sign-in is an error saying to connect again. */
  onRedirect?: (url: URL) => void
  oauthState?: string
  appTitle?: string
}

/** The SDK's view of one app's sign-in, backed by McpOAuthState. */
export class StoredOAuthProvider implements OAuthClientProvider {
  private verifier = ''

  constructor(private readonly options: ProviderOptions) {}

  /** What's saved for the app. */
  get saved(): McpOAuthState {
    if (this.options.read) this.options.state = this.options.read()
    return this.options.state
  }

  get redirectUrl(): string | undefined {
    return this.saved.redirectUrl
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: 'LoopEngine',
      client_uri: 'https://loopengine.app',
      redirect_uris: this.redirectUrl ? [this.redirectUrl] : [],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    }
  }

  /** The OAuth `state` sent with the sign-in, matched when it returns. */
  state(): string {
    return this.options.oauthState ?? ''
  }

  clientInformation(): OAuthClientInformationMixed | undefined {
    return this.saved.client
  }

  async saveClientInformation(client: OAuthClientInformationMixed): Promise<void> {
    await this.update({ client })
  }

  tokens(): OAuthTokens | undefined {
    return this.saved.tokens
  }

  async saveTokens(tokens: OAuthTokens): Promise<void> {
    await this.update({ tokens })
  }

  discoveryState(): OAuthDiscoveryState | undefined {
    return this.saved.discovery
  }

  async saveDiscoveryState(discovery: OAuthDiscoveryState): Promise<void> {
    await this.update({ discovery })
  }

  private async update(change: Partial<McpOAuthState>): Promise<void> {
    this.options.state = { ...this.saved, ...change }
    await this.options.persist?.(this.options.state)
  }

  redirectToAuthorization(url: URL): void {
    if (this.options.onRedirect) return this.options.onRedirect(url)
    throw new McpSignInError(`${this.options.appTitle ?? 'The app'}'s sign-in has expired or was revoked. Disconnect it on the Apps page and connect it again.`)
  }

  saveCodeVerifier(verifier: string): void {
    this.verifier = verifier
  }

  codeVerifier(): string {
    return this.verifier
  }

  /** While signing in, forgets what the server turned down. At run time
   * the saved sign-in is left alone: another connection may have just
   * refreshed it, and one that's really revoked gets reconnected by a
   * person (redirectToAuthorization says so). */
  invalidateCredentials(scope: 'all' | 'client' | 'tokens' | 'verifier' | 'discovery'): void {
    if (scope === 'all' || scope === 'verifier') this.verifier = ''
    if (this.options.read) return
    const s = this.options.state
    if (scope === 'all' || scope === 'client') delete s.client
    if (scope === 'all' || scope === 'tokens') delete s.tokens
    if (scope === 'all' || scope === 'discovery') delete s.discovery
  }
}

/** A provider for a connected app at run time: it refreshes tokens and
 * saves them back, and never starts a new sign-in. */
export function runtimeOAuthProvider(envName: string, value: string | undefined, appTitle?: string): StoredOAuthProvider {
  return new StoredOAuthProvider({
    state: parseMcpOAuthState(value),
    // The saved value is the workspace's (process.env), where every
    // connection's refresh lands; the one it started with is the
    // fallback.
    read: () => parseMcpOAuthState(process.env[envName] ?? value),
    persist: (s) => saveMcpOAuthState(envName, s),
    ...(appTitle ? { appTitle } : {}),
  })
}

/** Whether a server offers a sign-in LoopEngine can use: OAuth metadata,
 * and a way to register as a client without setting one up by hand. */
export async function mcpSignInSupport(serverUrl: string): Promise<{ ok: true; discovery: OAuthDiscoveryState } | { ok: false; reason: 'none' | 'no-registration' }> {
  let info: Awaited<ReturnType<typeof discoverOAuthServerInfo>>
  try {
    info = await discoverOAuthServerInfo(serverUrl)
  } catch {
    return { ok: false, reason: 'none' }
  }
  const meta = info.authorizationServerMetadata
  if (!meta || !info.resourceMetadata) return { ok: false, reason: 'none' }
  if (!meta.registration_endpoint) return { ok: false, reason: 'no-registration' }
  return { ok: true, discovery: info }
}

interface PendingSignIn {
  provider: StoredOAuthProvider
  serverUrl: string
  envName: string
  appId: string
  at: number
}

const pending = new Map<string, PendingSignIn>()
const PENDING_MS = 15 * 60 * 1000

/** Starts signing in to an app: registers with its authorization server
 * and returns the address of its sign-in page. */
export async function startMcpSignIn(options: { serverUrl: string; envName: string; appId: string; appTitle: string; redirectUrl: string; discovery?: OAuthDiscoveryState }): Promise<{ authorizeUrl: string }> {
  for (const [key, p] of pending) if (Date.now() - p.at > PENDING_MS) pending.delete(key)
  const oauthState = randomBytes(24).toString('base64url')
  let authorizeUrl: URL | undefined
  const provider = new StoredOAuthProvider({
    state: { redirectUrl: options.redirectUrl, ...(options.discovery ? { discovery: options.discovery } : {}) },
    oauthState,
    appTitle: options.appTitle,
    onRedirect: (url) => {
      authorizeUrl = url
    },
  })
  let result: Awaited<ReturnType<typeof auth>>
  try {
    result = await auth(provider, { serverUrl: options.serverUrl })
  } catch (err) {
    throw new McpSignInError(`Couldn't start signing in to ${options.appTitle}: ${err instanceof Error ? err.message : String(err)}`)
  }
  if (result !== 'REDIRECT' || !authorizeUrl) throw new McpSignInError(`${options.appTitle} didn't offer a sign-in page.`)
  pending.set(oauthState, { provider, serverUrl: options.serverUrl, envName: options.envName, appId: options.appId, at: Date.now() })
  return { authorizeUrl: authorizeUrl.toString() }
}

/** Finishes a sign-in the app sent back: swaps the code for tokens and
 * saves them. Returns the app it was for. */
export async function finishMcpSignIn(oauthState: string, code: string): Promise<{ appId: string }> {
  const p = pending.get(oauthState)
  if (!p || Date.now() - p.at > PENDING_MS) {
    pending.delete(oauthState)
    throw new McpSignInError('That sign-in has expired or was already used. Connect the app again.')
  }
  pending.delete(oauthState)
  try {
    const result = await auth(p.provider, { serverUrl: p.serverUrl, authorizationCode: code })
    if (result !== 'AUTHORIZED') throw new Error('it asked to sign in again')
  } catch (err) {
    throw new McpSignInError(`Signing in didn't finish: ${err instanceof Error ? err.message : String(err)}`)
  }
  await saveMcpOAuthState(p.envName, p.provider.saved)
  return { appId: p.appId }
}

/** A pending sign-in's app, without using it up (for the console to say
 * which app a returned sign-in was for). */
export function pendingSignInApp(oauthState: string): string | undefined {
  return pending.get(oauthState)?.appId
}
