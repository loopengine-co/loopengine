// What an ability can do, read from its files without running any of
// them: its tools (name and description, taken from each tool file's
// ToolDefinition with the TypeScript parser), the permission each tool
// ships with (its actauth rules), and its skills (each SKILL.md's
// frontmatter). Backs the console's ability details.
import { existsSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import ts from 'typescript'
import { parse as parseYaml } from 'yaml'

export type Decision = 'allow' | 'ask' | 'deny'

export interface AbilityToolDetails {
  name: string
  description: string
  /** The decision the ability ships for it (its actauth rules), if any. */
  decision?: Decision
}

export interface AbilitySkillDetails {
  name: string
  description: string
}

export interface AbilityDetails {
  name: string
  version: string
  description: string
  tools: AbilityToolDetails[]
  skills: AbilitySkillDetails[]
  /** Settings it reads (env var names), with a description when given. */
  settings: Array<{ name: string; description?: string }>
}

interface AbilityManifest {
  tools?: unknown
  skills?: unknown
  actauth?: unknown
  env?: unknown
  settings?: unknown
}

/** Throws when `dir` holds no loopengine.ability.json. */
export function readAbilityDetails(dir: string): AbilityDetails {
  const manifestPath = join(dir, 'loopengine.ability.json')
  if (!existsSync(manifestPath)) throw new Error('This package has no loopengine.ability.json, so it isn\'t a loopengine ability')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as AbilityManifest
  let pkg: { name?: string; version?: string; description?: string } = {}
  try {
    pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
  } catch {}

  const decisions = readShippedDecisions(dir, manifest.actauth)
  const tools = strings(manifest.tools).flatMap((file) => {
    const path = join(dir, file)
    const found = existsSync(path) ? readToolDefinitions(readFileSync(path, 'utf8'), file) : []
    // A file whose definition can't be read statically still shows, by its file name.
    const listed = found.length ? found : [{ name: basename(file).replace(/\.[cm]?[jt]s$/, ''), description: '' }]
    return listed.map((tool) => (decisions[tool.name] ? { ...tool, decision: decisions[tool.name] } : tool))
  })

  const skills = strings(manifest.skills).map((skillDir) => readSkill(join(dir, skillDir), skillDir))
  return { name: pkg.name || basename(dir), version: pkg.version || '', description: pkg.description || '', tools, skills, settings: readSettings(manifest) }
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []
}

/** Each tool rule's decision, by tool name, from the ability's own rules
 * file (a list of { tool, decision }, or { rules: [...] }). */
function readShippedDecisions(dir: string, actauth: unknown): Record<string, Decision> {
  if (typeof actauth !== 'string' || !existsSync(join(dir, actauth))) return {}
  let parsed: unknown
  try {
    parsed = parseYaml(readFileSync(join(dir, actauth), 'utf8'))
  } catch {
    return {}
  }
  const rules = Array.isArray(parsed) ? parsed : Array.isArray((parsed as { rules?: unknown } | null)?.rules) ? (parsed as { rules: unknown[] }).rules : []
  const out: Record<string, Decision> = {}
  for (const rule of rules as Array<{ tool?: unknown; decision?: unknown }>) {
    if (typeof rule?.tool === 'string' && (rule.decision === 'allow' || rule.decision === 'ask' || rule.decision === 'deny') && !out[rule.tool]) out[rule.tool] = rule.decision
  }
  return out
}

/** The { name, description } of every object literal in a tool file that
 * has both as string values: its ToolDefinition(s). Parsed, never run. */
export function readToolDefinitions(source: string, fileName = 'tool.ts'): Array<{ name: string; description: string }> {
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, fileName.endsWith('.js') ? ts.ScriptKind.JS : ts.ScriptKind.TS)
  const found: Array<{ name: string; description: string }> = []
  const visit = (node: ts.Node): void => {
    if (ts.isObjectLiteralExpression(node)) {
      let name: string | undefined
      let description: string | undefined
      let hasSchema = false
      for (const prop of node.properties) {
        if (!ts.isPropertyAssignment(prop)) continue
        const key = ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name) ? prop.name.text : undefined
        if (key === 'name') name = staticString(prop.initializer)
        else if (key === 'description') description = staticString(prop.initializer)
        else if (key === 'input_schema' || key === 'inputSchema' || key === 'execute') hasSchema = true
      }
      // A tool definition, not an input-schema property that also has a
      // description: those have no name.
      if (name && description !== undefined && hasSchema) {
        found.push({ name, description })
        return
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(file)
  return found
}

/** A string literal, a template without substitutions, or a + of them. */
function staticString(node: ts.Expression): string | undefined {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text
  if (ts.isParenthesizedExpression(node)) return staticString(node.expression)
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const left = staticString(node.left)
    const right = staticString(node.right)
    return left !== undefined && right !== undefined ? left + right : undefined
  }
  return undefined
}

function readSkill(dir: string, skillDir: string): AbilitySkillDetails {
  const fallback = { name: basename(skillDir), description: '' }
  const path = join(dir, 'SKILL.md')
  if (!existsSync(path)) return fallback
  const match = readFileSync(path, 'utf8').match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!match) return fallback
  try {
    const front = parseYaml(match[1]) as { name?: unknown; description?: unknown } | null
    return { name: typeof front?.name === 'string' ? front.name : fallback.name, description: typeof front?.description === 'string' ? front.description : '' }
  } catch {
    return fallback
  }
}

/** The env vars an ability declares it reads, from loopengine.ability.json
 * (`env` or `settings`: a list of names or { name, description }, or a
 * map of name to description or { description }). */
function readSettings(manifest: AbilityManifest): Array<{ name: string; description?: string }> {
  const raw = manifest.env ?? manifest.settings
  const out: Array<{ name: string; description?: string }> = []
  const add = (name: unknown, description?: unknown) => {
    if (typeof name === 'string' && name && !out.some((s) => s.name === name)) out.push(typeof description === 'string' && description ? { name, description } : { name })
  }
  if (Array.isArray(raw)) {
    for (const entry of raw) {
      if (typeof entry === 'string') add(entry)
      else if (entry && typeof entry === 'object') add((entry as { name?: unknown }).name, (entry as { description?: unknown }).description)
    }
  } else if (raw && typeof raw === 'object') {
    for (const [name, value] of Object.entries(raw)) add(name, typeof value === 'string' ? value : (value as { description?: unknown } | null)?.description)
  }
  return out
}
