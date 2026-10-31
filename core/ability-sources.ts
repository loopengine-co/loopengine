// Private ability sources: where a project's own, unpublished abilities
// come from, next to the public ones on npm (packages tagged
// loopengine-ability). Set in the console's Settings and kept in
// ability-sources.yml in the project root (or the file
// LOOPENGINE_ABILITY_SOURCES_FILE names):
//
//   sources:
//     - id: github-loopengine-co
//       type: github          # a GitHub org or user; each ability is a repo
//       owner: loopengine-co  # with loopengine.ability.json at its root
//     - id: npm-everymarket
//       type: npm             # a private registry, for one scope
//       registry: https://npm.pkg.github.com
//       scope: "@everymarket"
//     - id: folder-abilities
//       type: folder          # a local folder of ability folders
//       path: ../loopengine-abilities
//
// A source's token (a GitHub token that can read the repos, or the
// registry's auth token) is never in the file: it lives in the project
// env as LOOPENGINE_ABILITY_SOURCE_<ID>_TOKEN, saved like a model key.
// It's handed to `npm pack` only while an ability is fetched (see
// abilityFetchAuth), so an installed ability's recorded spec
// (github:owner/repo, @scope/name, file:/path) never carries it, and an
// upgrade fetches the same way.
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'
import { workspaceAbilityAt } from './workspace-abilities.js'

export type AbilitySource =
  | { id: string; type: 'github'; owner: string }
  | { id: string; type: 'npm'; registry: string; scope: string }
  | { id: string; type: 'folder'; path: string }

export interface SourceAbility {
  name: string
  description: string
  version: string
  /** What to install it with: github:owner/repo, @scope/name or file:/path. */
  spec: string
}

export interface AbilityOrigin {
  kind: 'public' | 'private'
  /** Where it came from, for the console's badge: "npm", "GitHub
   * loopengine-co/lp-github", "Folder ../loopengine-abilities", ... */
  label: string
}

export class AbilitySourceError extends Error {}

export const ABILITY_SOURCES_FILE_ENV = 'LOOPENGINE_ABILITY_SOURCES_FILE'

export function abilitySourcesPath(): string {
  return resolve(process.cwd(), process.env[ABILITY_SOURCES_FILE_ENV]?.trim() || 'ability-sources.yml')
}

/** The env var a source's token lives in. */
export function sourceTokenVar(id: string): string {
  return `LOOPENGINE_ABILITY_SOURCE_${id.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}_TOKEN`
}

function sourceToken(source: AbilitySource): string | undefined {
  return source.type === 'folder' ? undefined : process.env[sourceTokenVar(source.id)]?.trim() || undefined
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)
}

/** Throws AbilitySourceError naming the first problem. An id is made up
 * from the source when none is given. */
export function validateAbilitySource(input: unknown): AbilitySource {
  if (!input || typeof input !== 'object') throw new AbilitySourceError('a source must be an object')
  const raw = input as Record<string, unknown>
  const str = (key: string): string | undefined => (typeof raw[key] === 'string' && (raw[key] as string).trim() ? (raw[key] as string).trim() : undefined)
  const givenId = str('id')
  if (givenId && !/^[a-z0-9][a-z0-9-]{0,39}$/.test(givenId)) throw new AbilitySourceError('id must be lowercase letters, digits and hyphens')
  switch (raw.type) {
    case 'github': {
      const owner = str('owner')?.replace(/^https?:\/\/github\.com\//, '').replace(/\/+$/, '')
      if (!owner || !/^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/.test(owner)) throw new AbilitySourceError('owner must be a GitHub org or user name, like loopengine-co')
      return { id: givenId ?? slug(`github-${owner}`), type: 'github', owner }
    }
    case 'npm': {
      const registry = str('registry')?.replace(/\/+$/, '')
      if (!registry || !/^https?:\/\/[^/]+/.test(registry)) throw new AbilitySourceError('registry must be an http(s) URL, like https://npm.pkg.github.com')
      const scope = str('scope')
      // A scope, so only its packages come from this registry; public
      // abilities keep coming from npm.
      if (!scope || !/^@[a-z0-9][a-z0-9._-]*$/.test(scope)) throw new AbilitySourceError('scope must be an npm scope, like @everymarket')
      return { id: givenId ?? slug(`npm-${scope}`), type: 'npm', registry, scope }
    }
    case 'folder': {
      const path = str('path')
      if (!path) throw new AbilitySourceError('path is required for a folder')
      return { id: givenId ?? slug(`folder-${basename(path)}`), type: 'folder', path }
    }
    default:
      throw new AbilitySourceError('type must be github, npm or folder')
  }
}

export function readAbilitySources(): AbilitySource[] {
  const path = abilitySourcesPath()
  if (!existsSync(path)) return []
  const parsed = parseYaml(readFileSync(path, 'utf8')) as { sources?: unknown } | null
  if (parsed?.sources !== undefined && !Array.isArray(parsed.sources)) throw new AbilitySourceError('sources must be a list')
  const sources: AbilitySource[] = []
  for (const entry of (parsed?.sources as unknown[] | undefined) ?? []) {
    const source = validateAbilitySource(entry)
    if (!sources.some((s) => s.id === source.id)) sources.push(source)
  }
  return sources
}

function writeAbilitySources(sources: AbilitySource[]): void {
  const path = abilitySourcesPath()
  if (!sources.length) {
    rmSync(path, { force: true })
    return
  }
  const header =
    '# Private ability sources, edited from the console (Settings). Each source\'s\n' +
    '# token lives in the project env as LOOPENGINE_ABILITY_SOURCE_<ID>_TOKEN.\n'
  writeFileSync(path, header + stringifyYaml({ sources }))
}

/** Adds a source, or replaces the one with the same id. */
export function saveAbilitySource(input: unknown): AbilitySource {
  const source = validateAbilitySource(input)
  const sources = readAbilitySources()
  const index = sources.findIndex((s) => s.id === source.id)
  if (index === -1) sources.push(source)
  else sources[index] = source
  writeAbilitySources(sources)
  listCache.delete(source.id)
  return source
}

export function removeAbilitySource(id: string): void {
  writeAbilitySources(readAbilitySources().filter((s) => s.id !== id))
  listCache.delete(id)
}

export function describeSource(source: AbilitySource): string {
  if (source.type === 'github') return `GitHub ${source.owner}`
  if (source.type === 'npm') return `npm ${source.scope} (${new URL(source.registry).host})`
  return `Folder ${source.path}`
}

// ---- Listing what a source offers ----

const LIST_TTL_MS = 5 * 60 * 1000
const listCache = new Map<string, { at: number; key: string; abilities: SourceAbility[] }>()

/** The abilities a source offers. GitHub and npm listings are cached for
 * five minutes per token; a folder is read fresh. Throws with a message
 * fit for the console when the source can't be read. */
export async function listSourceAbilities(source: AbilitySource, options: { fetch?: typeof fetch } = {}): Promise<SourceAbility[]> {
  if (source.type === 'folder') return listFolder(source)
  const token = sourceToken(source)
  const key = JSON.stringify([source, token ?? ''])
  const cached = listCache.get(source.id)
  if (cached && cached.key === key && Date.now() - cached.at < LIST_TTL_MS) return cached.abilities
  const doFetch = options.fetch ?? fetch
  const abilities = source.type === 'github' ? await listGitHub(source, token, doFetch) : await listNpm(source, token, doFetch)
  listCache.set(source.id, { at: Date.now(), key, abilities })
  return abilities
}

function readAbilityDir(dir: string): SourceAbility | undefined {
  if (!existsSync(join(dir, 'loopengine.ability.json'))) return undefined
  let pkg: { name?: string; version?: string; description?: string } = {}
  try {
    pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
  } catch {}
  return { name: pkg.name || basename(dir), description: pkg.description || '', version: pkg.version || '', spec: `file:${dir}` }
}

function listFolder(source: Extract<AbilitySource, { type: 'folder' }>): SourceAbility[] {
  const root = resolve(process.cwd(), source.path)
  if (!existsSync(root) || !statSync(root).isDirectory()) throw new Error(`${source.path} isn't a folder on this server`)
  const own = readAbilityDir(root)
  if (own) return [own]
  return readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('.') && d.name !== 'node_modules')
    .flatMap((d) => readAbilityDir(join(root, d.name)) ?? [])
    .sort((a, b) => a.name.localeCompare(b.name))
}

async function githubJson(url: string, token: string | undefined, doFetch: typeof fetch): Promise<{ status: number; body: unknown }> {
  const res = await doFetch(url, {
    headers: { accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', 'user-agent': 'loopengine', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    signal: AbortSignal.timeout(15_000),
  })
  return { status: res.status, body: await res.json().catch(() => null) }
}

async function listGitHub(source: Extract<AbilitySource, { type: 'github' }>, token: string | undefined, doFetch: typeof fetch): Promise<SourceAbility[]> {
  const owner = source.owner
  // An org's repos; for a user, their own (private ones need a token for
  // that user, through /user/repos).
  let { status, body } = await githubJson(`https://api.github.com/orgs/${owner}/repos?per_page=100&type=all`, token, doFetch)
  if (status === 404) {
    ;({ status, body } = token
      ? await githubJson('https://api.github.com/user/repos?per_page=100&affiliation=owner', token, doFetch)
      : await githubJson(`https://api.github.com/users/${owner}/repos?per_page=100`, token, doFetch))
  }
  if (status === 401) throw new Error('GitHub refused the token: check it and that it can read these repos')
  if (status === 403) throw new Error('GitHub refused the request (rate limit or token permissions); try again later or save a token')
  if (status === 404) throw new Error(`No GitHub org or user named ${owner}`)
  if (status !== 200 || !Array.isArray(body)) throw new Error(`GitHub answered HTTP ${status}`)
  const repos = (body as Array<{ name: string; owner?: { login?: string }; archived?: boolean; description?: string | null }>)
    .filter((r) => !r.archived && (r.owner?.login ?? owner).toLowerCase() === owner.toLowerCase())

  const found = await Promise.all(
    repos.map(async (repo): Promise<SourceAbility | undefined> => {
      const manifest = await githubJson(`https://api.github.com/repos/${owner}/${repo.name}/contents/loopengine.ability.json`, token, doFetch)
      if (manifest.status !== 200) return undefined
      const pkgFile = await githubJson(`https://api.github.com/repos/${owner}/${repo.name}/contents/package.json`, token, doFetch)
      let pkg: { name?: string; version?: string; description?: string } = {}
      const content = (pkgFile.body as { content?: string } | null)?.content
      if (pkgFile.status === 200 && content) {
        try {
          pkg = JSON.parse(Buffer.from(content, 'base64').toString('utf8'))
        } catch {}
      }
      return { name: pkg.name || repo.name, description: pkg.description || repo.description || '', version: pkg.version || '', spec: `github:${owner}/${repo.name}` }
    }),
  )
  return found.filter((a): a is SourceAbility => Boolean(a)).sort((a, b) => a.name.localeCompare(b.name))
}

async function listNpm(source: Extract<AbilitySource, { type: 'npm' }>, token: string | undefined, doFetch: typeof fetch): Promise<SourceAbility[]> {
  const url = `${source.registry}/-/v1/search?text=${encodeURIComponent(`keywords:loopengine-ability ${source.scope}`)}&size=100`
  const res = await doFetch(url, { headers: token ? { authorization: `Bearer ${token}` } : {}, signal: AbortSignal.timeout(15_000) })
  if (res.status === 401 || res.status === 403) throw new Error('The registry refused the token')
  // GitHub Packages, for one, has no search; its abilities can still be
  // installed by name.
  if (!res.ok) throw new Error(`This registry can't be searched (HTTP ${res.status}); install its abilities by name instead`)
  const data = (await res.json()) as { objects?: Array<{ package: { name: string; version: string; description?: string } }> }
  return (data.objects ?? [])
    .map((o) => o.package)
    .filter((p) => p.name.startsWith(`${source.scope}/`))
    .map((p) => ({ name: p.name, description: p.description ?? '', version: p.version, spec: p.name }))
}

// ---- Where an installed ability came from ----

/** Public (npm) or private (a source, a git repo or a local folder), from
 * the spec it was installed with. */
export function abilityOrigin(spec: string | undefined, name: string, sources: AbilitySource[] = safeReadSources()): AbilityOrigin {
  const target = spec || name
  if (target.startsWith('file:') || target.startsWith('/') || target.startsWith('.')) {
    const path = target.replace(/^file:/, '')
    // The workspace's copy (core/workspace-abilities.ts): labelled by where
    // that copy came from.
    const copy = workspaceAbilityAt(path)
    if (copy) {
      if (copy.source.startsWith('upload:')) return { kind: 'private', label: 'Workspace (uploaded)' }
      const from = copy.source.startsWith('file:') ? undefined : abilityOrigin(copy.source, copy.name, sources)
      return { kind: 'private', label: from && from.kind === 'private' ? `Workspace (${from.label})` : 'Workspace' }
    }
    const folder = sources.find((s) => s.type === 'folder' && resolve(process.cwd(), s.path) === resolve(path, '..'))
    return { kind: 'private', label: folder ? describeSource(folder) : `Folder ${path}` }
  }
  const github = target.match(/^(?:github:|git\+ssh:\/\/git@github\.com\/|git\+https:\/\/github\.com\/|https:\/\/github\.com\/|git@github\.com:)([^/]+)\/([^/#.]+)/)
  if (github) return { kind: 'private', label: `GitHub ${github[1]}/${github[2]}` }
  if (/^(git\+|git:|https?:)/.test(target)) return { kind: 'private', label: 'Git' }
  const scope = target.match(/^(@[^/]+)\//)?.[1]
  const npmSource = scope ? sources.find((s) => s.type === 'npm' && s.scope === scope) : undefined
  if (npmSource) return { kind: 'private', label: describeSource(npmSource) }
  return { kind: 'public', label: 'npm' }
}

function safeReadSources(): AbilitySource[] {
  try {
    return readAbilitySources()
  } catch {
    return []
  }
}

// ---- Fetching with a source's token ----

/** What `npm pack` needs to fetch from the private sources: GitHub tokens
 * as git URL rewrites (only in the child's env, per owner), and a
 * temporary npm config adding each private scope's registry and token to
 * the user's own. `cleanup` removes that file. */
export function abilityFetchAuth(sources: AbilitySource[] = safeReadSources()): { args: string[]; env: NodeJS.ProcessEnv; cleanup: () => void } {
  const env: NodeJS.ProcessEnv = { ...process.env, GIT_TERMINAL_PROMPT: '0' }
  const rewrites: Array<[string, string]> = []
  for (const source of sources) {
    const token = sourceToken(source)
    if (source.type !== 'github' || !token) continue
    const authed = `https://x-access-token:${token}@github.com/${source.owner}/`
    for (const from of [`https://github.com/${source.owner}/`, `git@github.com:${source.owner}/`, `ssh://git@github.com/${source.owner}/`]) rewrites.push([`url.${authed}.insteadOf`, from])
  }
  if (rewrites.length) {
    const start = Number(process.env.GIT_CONFIG_COUNT) || 0
    rewrites.forEach(([key, value], i) => {
      env[`GIT_CONFIG_KEY_${start + i}`] = key
      env[`GIT_CONFIG_VALUE_${start + i}`] = value
    })
    env.GIT_CONFIG_COUNT = String(start + rewrites.length)
  }

  const npmLines = sources.flatMap((source) => {
    if (source.type !== 'npm') return []
    const token = sourceToken(source)
    const url = new URL(source.registry)
    return [`${source.scope}:registry=${source.registry}/`, ...(token ? [`//${url.host}${url.pathname.replace(/\/+$/, '')}/:_authToken=${token}`] : [])]
  })
  if (!npmLines.length) return { args: [], env, cleanup: () => {} }
  const dir = mkdtempSync(join(tmpdir(), 'loopengine-npmrc-'))
  const userNpmrc = join(homedir(), '.npmrc')
  const own = existsSync(userNpmrc) ? readFileSync(userNpmrc, 'utf8') + '\n' : ''
  const file = join(dir, 'npmrc')
  writeFileSync(file, own + npmLines.join('\n') + '\n', { mode: 0o600 })
  return { args: ['--userconfig', file], env, cleanup: () => rmSync(dir, { recursive: true, force: true }) }
}
