// The goal planner's playbook (core/system-agents/goal-planner.ts):
// proven levers by focus. A lever is one way to move a kind of goal, the
// idea behind a workflow, general enough to fit many businesses. The
// planner starts from the levers for the brief's focus, adapts the ones
// that fit to the person's context, and may add its own ideas, labelled
// as new. Ids are the stable names saved workflows, discards and eval
// expectations refer to: change a lever's wording freely, never its id.
//
// The levers are data, in playbook.json next to this file (copied into
// dist by the build), so updating the playbook is editing that file. It's
// checked when loaded: a malformed lever fails loudly, naming it.
//
// A lever describes a mechanism, never a promised result: why it tends
// to move the measure, and how to see whether it does.
//
// Focuses are data too: the playbook lists them (an id, a label people
// read, and a hint the planner reads), and its levers belong to them.
//
// Each workspace also has its own playbook, .loopengine/playbook-local.json:
// focuses and levers the goal planner wrote when nothing in the shared
// playbook fit (a goal about hiring, a lever the playbook lacks). Their
// ids carry "x-" (focus "x-hiring", lever "x-hiring.x-screen-applicants",
// or "new-signups.x-..." for a new lever under a shared focus), so they
// never clash with shared ones. They're used like shared ones, in this
// workspace only.
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** A focus id: a shared one (below), or a workspace's own ("x-..."). */
export type GoalFocus = string

/** The shared playbook's focuses, as bundled. */
export const GOAL_FOCUSES: readonly string[] = ['new-signups', 'activation', 'retention', 'faster-support', 'revenue-recovery', 'ops-hygiene']

export interface Focus {
  /** lowercase-hyphenated; a workspace's own starts with "x-". */
  id: string
  /** What people read: "Getting new signups or customers". */
  label: string
  /** What the planner reads: what goals with this focus are about. */
  hint: string
}

/** Whether an id is a workspace's own focus or lever (never shared as is). */
export const isLocalId = (id: string): boolean => /(^|\.)x-/.test(id)

const FOCUS_ID = /^[a-z][a-z0-9-]{1,48}$/

export interface Lever {
  /** `<focus>.<name>`, stable. */
  id: string
  focus: GoalFocus
  name: string
  /** Why it works, in a sentence: shown as the plan's "Why". */
  mechanism: string
  fitsWhen: string[]
  notWhen: string[]
  /** What a job for it uses: any one of `anyOf`, plus each of `plus`.
   * Names are kinds of app or ability (email, messaging, web-search…). */
  needs: { anyOf?: string[]; plus?: string[] }
  /** The person's review time it usually takes. */
  humanMinutesPerWeek: number
  /** Days until it first shows something. */
  firstResultDays: number
  /** How its effect on the measure shows up: the job's own measure. */
  measureLink: string
  /** Rules every job made from it keeps. */
  guardrails: string[]
  /** The request it starts from, with {placeholders} filled from context. */
  template: string
  /** A workspace's own lever written from a job the person typed, which
   * they didn't agree to share: it, and every job made from it, stays in
   * the workspace. */
  private?: true
}

const PLAYBOOK_FILE = new URL('./playbook.json', import.meta.url)

function parseFocuses(raw: unknown, where: string): Focus[] {
  if (raw === undefined) return []
  if (!Array.isArray(raw)) throw new Error(`${where}: "focuses" must be a list`)
  return raw.map((item, i) => {
    const f = (item ?? {}) as Record<string, unknown>
    const at = `${where} focus ${typeof f.id === 'string' ? f.id : `#${i + 1}`}`
    if (typeof f.id !== 'string' || !FOCUS_ID.test(f.id)) throw new Error(`${at}: id must be lowercase words with hyphens`)
    if (typeof f.label !== 'string' || !f.label.trim()) throw new Error(`${at}: "label" must be non-empty text`)
    if (typeof f.hint !== 'string' || !f.hint.trim()) throw new Error(`${at}: "hint" must be non-empty text`)
    return { id: f.id, label: f.label.trim(), hint: f.hint.trim() }
  })
}

/** Checks the playbook's shape, naming the lever at fault. A lever's
 * focus must be one the playbook lists, or one of `knownFocuses`. */
export function parsePlaybook(raw: unknown, knownFocuses: readonly string[] = GOAL_FOCUSES): { version: number; focuses: Focus[]; levers: Lever[] } {
  if (!raw || typeof raw !== 'object' || !Array.isArray((raw as { levers?: unknown }).levers)) throw new Error('playbook.json: expected { "levers": [...] }')
  const version = typeof (raw as { version?: unknown }).version === 'number' ? (raw as { version: number }).version : 0
  const focuses = parseFocuses((raw as { focuses?: unknown }).focuses, 'playbook.json')
  const allowed = new Set([...knownFocuses, ...focuses.map((f) => f.id)])
  const seen = new Set<string>()
  const levers = ((raw as { levers: unknown[] }).levers).map((item, i) => {
    const l = (item ?? {}) as Record<string, unknown>
    const where = `playbook.json lever ${typeof l.id === 'string' ? l.id : `#${i + 1}`}`
    const text = (k: string) => { if (typeof l[k] !== 'string' || !(l[k] as string).trim()) throw new Error(`${where}: "${k}" must be non-empty text`); return l[k] as string }
    const list = (k: string) => { if (!Array.isArray(l[k]) || (l[k] as unknown[]).some((x) => typeof x !== 'string')) throw new Error(`${where}: "${k}" must be a list of text`); return l[k] as string[] }
    const num = (k: string) => { if (typeof l[k] !== 'number' || (l[k] as number) < 0) throw new Error(`${where}: "${k}" must be a number`); return l[k] as number }
    const focus = text('focus') as GoalFocus
    if (!allowed.has(focus)) throw new Error(`${where}: focus must be one of ${[...allowed].join(', ')}`)
    const id = text('id')
    if (!id.startsWith(`${focus}.`)) throw new Error(`${where}: its id must start with "${focus}."`)
    if (seen.has(id)) throw new Error(`${where}: the id is used twice`)
    seen.add(id)
    const needs = (l.needs ?? {}) as { anyOf?: unknown; plus?: unknown }
    const kinds = (v: unknown, k: string) => { if (v === undefined) return undefined; if (!Array.isArray(v) || v.some((x) => typeof x !== 'string')) throw new Error(`${where}: needs.${k} must be a list of kinds`); return v as string[] }
    const anyOf = kinds(needs.anyOf, 'anyOf')
    const plus = kinds(needs.plus, 'plus')
    return {
      id, focus, name: text('name'), mechanism: text('mechanism'), fitsWhen: list('fitsWhen'), notWhen: list('notWhen'),
      needs: { ...(anyOf ? { anyOf } : {}), ...(plus ? { plus } : {}) },
      humanMinutesPerWeek: num('humanMinutesPerWeek'), firstResultDays: num('firstResultDays'), measureLink: text('measureLink'),
      guardrails: list('guardrails'), template: text('template'),
      ...(l.private === true ? { private: true as const } : {}),
    }
  })
  return { version, focuses, levers }
}

const playbook = parsePlaybook(JSON.parse(readFileSync(PLAYBOOK_FILE, 'utf8')))

/** The playbook bundled with this package. */
export const PLAYBOOK_VERSION: number = playbook.version
export const LEVERS: readonly Lever[] = playbook.levers
export const FOCUSES: readonly Focus[] = playbook.focuses

// ---- The playbook in use: the bundled one, merged with the latest one a
// Cloud workspace fetched (core/playbook-sync.ts keeps it in the project,
// .loopengine/playbook-cache.json). By lever id: a fetched lever replaces
// the bundled one, new ids are added, and retired ids are left out. A
// cache that's missing or doesn't pass the checks leaves the bundled one.

let cacheDir: string | undefined
let memo: { key: string; focuses: readonly Focus[]; levers: readonly Lever[]; version: number } | undefined

/** Where the fetched playbook is cached: the project folder. */
export function setPlaybookProjectDir(dir: string | undefined): void {
  cacheDir = dir
  memo = undefined
}

export function mergePlaybooks(bundled: readonly Lever[], fetched: { levers: Lever[]; retired?: string[] } | undefined): Lever[] {
  if (!fetched) return [...bundled]
  const retired = new Set(fetched.retired ?? [])
  const byId = new Map(bundled.map((l) => [l.id, l]))
  for (const l of fetched.levers) byId.set(l.id, l)
  return [...byId.values()].filter((l) => !retired.has(l.id))
}

const localFile = (dir: string) => join(dir, '.loopengine', 'playbook-local.json')
const mtime = (file: string) => {
  try {
    return String(statSync(file).mtimeMs)
  } catch {
    return 'none'
  }
}

/** The workspace's own focuses and levers (empty when there are none, or
 * the file doesn't pass the checks). */
export function readLocalPlaybook(dir = cacheDir): { focuses: Focus[]; levers: Lever[] } {
  if (!dir || !existsSync(localFile(dir))) return { focuses: [], levers: [] }
  try {
    const raw = JSON.parse(readFileSync(localFile(dir), 'utf8')) as Record<string, unknown>
    const parsed = parsePlaybook({ levers: raw.levers ?? [], focuses: raw.focuses ?? [] }, [...GOAL_FOCUSES, ...FOCUSES.map((f) => f.id)])
    return { focuses: parsed.focuses.filter((f) => isLocalId(f.id)), levers: parsed.levers.filter((l) => isLocalId(l.id)) }
  } catch {
    return { focuses: [], levers: [] }
  }
}

/** Adds focuses and levers to the workspace's own playbook (by id: a new
 * one is added, one with an id already there replaces it). Only local
 * ids ("x-...") are kept. */
export function addToLocalPlaybook(dir: string, add: { focuses?: Focus[]; levers?: Lever[] }): { focuses: Focus[]; levers: Lever[] } {
  const current = readLocalPlaybook(dir)
  const focuses = new Map(current.focuses.map((f) => [f.id, f]))
  for (const f of add.focuses ?? []) if (isLocalId(f.id)) focuses.set(f.id, f)
  const levers = new Map(current.levers.map((l) => [l.id, l]))
  for (const l of add.levers ?? []) if (isLocalId(l.id)) levers.set(l.id, l)
  const next = { focuses: [...focuses.values()], levers: [...levers.values()] }
  // Checked as a whole before it's written: a bad lever fails here.
  parsePlaybook(next, [...GOAL_FOCUSES, ...FOCUSES.map((f) => f.id)])
  mkdirSync(join(dir, '.loopengine'), { recursive: true })
  const file = localFile(dir)
  const temp = `${file}.${process.pid}.tmp`
  writeFileSync(temp, `${JSON.stringify(next, null, 2)}\n`)
  renameSync(temp, file)
  if (dir === cacheDir) memo = undefined
  return next
}

/** The playbook in use: the bundled one, the fetched one over it, and the
 * workspace's own focuses and levers; the version is the shared one's. */
export function activePlaybook(): { version: number; focuses: readonly Focus[]; levers: readonly Lever[] } {
  if (!cacheDir) return { version: PLAYBOOK_VERSION, focuses: FOCUSES, levers: LEVERS }
  const file = join(cacheDir, '.loopengine', 'playbook-cache.json')
  const key = `${mtime(file)}|${mtime(localFile(cacheDir))}`
  if (memo?.key === key) return memo
  let fetched: { version: number; focuses: Focus[]; levers: Lever[]; retired: string[] } | undefined
  if (!key.startsWith('none|')) {
    try {
      const raw = JSON.parse(readFileSync(file, 'utf8')) as { version?: unknown; levers?: unknown; retired?: unknown }
      const parsed = parsePlaybook(raw, [...GOAL_FOCUSES, ...FOCUSES.map((f) => f.id)])
      fetched = { ...parsed, retired: Array.isArray(raw.retired) ? raw.retired.filter((x): x is string => typeof x === 'string') : [] }
    } catch {}
  }
  const local = readLocalPlaybook(cacheDir)
  const focusById = new Map(FOCUSES.map((f) => [f.id, f]))
  for (const f of fetched?.focuses ?? []) focusById.set(f.id, f)
  for (const f of local.focuses) focusById.set(f.id, f)
  memo = { key, focuses: [...focusById.values()], levers: [...mergePlaybooks(LEVERS, fetched), ...local.levers], version: fetched?.version ?? PLAYBOOK_VERSION }
  return memo
}

/** A focus's label for people: its playbook label, else its id. */
export function focusLabel(id: string): string {
  if (id === 'other') return 'Something else'
  return activePlaybook().focuses.find((f) => f.id === id)?.label ?? id
}

/** The levers in use for a focus. */
export function leversFor(focus: GoalFocus): Lever[] {
  return activePlaybook().levers.filter((l) => l.focus === focus)
}
