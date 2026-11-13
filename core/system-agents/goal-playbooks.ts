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
import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

export type GoalFocus = 'new-signups' | 'activation' | 'retention' | 'faster-support' | 'revenue-recovery' | 'ops-hygiene'

export const GOAL_FOCUSES: readonly GoalFocus[] = ['new-signups', 'activation', 'retention', 'faster-support', 'revenue-recovery', 'ops-hygiene']

export interface Lever {
  /** `<focus>.<name>`, stable. */
  id: string
  focus: GoalFocus
  name: string
  /** Why it works, in a sentence: shown as the plan's "Why". */
  mechanism: string
  fitsWhen: string[]
  notWhen: string[]
  /** What a workflow for it uses: any one of `anyOf`, plus each of `plus`.
   * Names are kinds of app or ability (email, messaging, web-search…). */
  needs: { anyOf?: string[]; plus?: string[] }
  /** The person's review time it usually takes. */
  humanMinutesPerWeek: number
  /** Days until it first shows something. */
  firstResultDays: number
  /** How its effect on the measure shows up. */
  measureLink: string
  /** Rules every workflow built from it keeps. */
  guardrails: string[]
  /** The request it starts from, with {placeholders} filled from context. */
  template: string
}

const PLAYBOOK_FILE = new URL('./playbook.json', import.meta.url)

/** Checks the playbook's shape, naming the lever at fault. */
export function parsePlaybook(raw: unknown): { version: number; levers: Lever[] } {
  if (!raw || typeof raw !== 'object' || !Array.isArray((raw as { levers?: unknown }).levers)) throw new Error('playbook.json: expected { "levers": [...] }')
  const version = typeof (raw as { version?: unknown }).version === 'number' ? (raw as { version: number }).version : 0
  const seen = new Set<string>()
  const levers = ((raw as { levers: unknown[] }).levers).map((item, i) => {
    const l = (item ?? {}) as Record<string, unknown>
    const where = `playbook.json lever ${typeof l.id === 'string' ? l.id : `#${i + 1}`}`
    const text = (k: string) => { if (typeof l[k] !== 'string' || !(l[k] as string).trim()) throw new Error(`${where}: "${k}" must be non-empty text`); return l[k] as string }
    const list = (k: string) => { if (!Array.isArray(l[k]) || (l[k] as unknown[]).some((x) => typeof x !== 'string')) throw new Error(`${where}: "${k}" must be a list of text`); return l[k] as string[] }
    const num = (k: string) => { if (typeof l[k] !== 'number' || (l[k] as number) < 0) throw new Error(`${where}: "${k}" must be a number`); return l[k] as number }
    const focus = text('focus') as GoalFocus
    if (!GOAL_FOCUSES.includes(focus)) throw new Error(`${where}: focus must be one of ${GOAL_FOCUSES.join(', ')}`)
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
    }
  })
  return { version, levers }
}

const playbook = parsePlaybook(JSON.parse(readFileSync(PLAYBOOK_FILE, 'utf8')))

/** The playbook bundled with this package. */
export const PLAYBOOK_VERSION: number = playbook.version
export const LEVERS: readonly Lever[] = playbook.levers

// ---- The playbook in use: the bundled one, merged with the latest one a
// Cloud workspace fetched (core/playbook-sync.ts keeps it in the project,
// .loopengine/playbook-cache.json). By lever id: a fetched lever replaces
// the bundled one, new ids are added, and retired ids are left out. A
// cache that's missing or doesn't pass the checks leaves the bundled one.

let cacheDir: string | undefined
let memo: { key: string; levers: readonly Lever[]; version: number } | undefined

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

/** The levers in use, and the version they come from (the fetched one's
 * when there is one, else the bundled one's). */
export function activePlaybook(): { version: number; levers: readonly Lever[] } {
  if (!cacheDir) return { version: PLAYBOOK_VERSION, levers: LEVERS }
  const file = join(cacheDir, '.loopengine', 'playbook-cache.json')
  let key = 'none'
  try {
    key = String(statSync(file).mtimeMs)
  } catch {}
  if (memo?.key === key) return memo
  let fetched: { version: number; levers: Lever[]; retired: string[] } | undefined
  if (key !== 'none') {
    try {
      const raw = JSON.parse(readFileSync(file, 'utf8')) as { version?: unknown; levers?: unknown; retired?: unknown }
      const parsed = parsePlaybook(raw)
      fetched = { version: parsed.version, levers: parsed.levers, retired: Array.isArray(raw.retired) ? raw.retired.filter((x): x is string => typeof x === 'string') : [] }
    } catch {}
  }
  memo = { key, levers: mergePlaybooks(LEVERS, fetched), version: fetched?.version ?? PLAYBOOK_VERSION }
  return memo
}

/** The levers in use for a focus. */
export function leversFor(focus: GoalFocus): Lever[] {
  return activePlaybook().levers.filter((l) => l.focus === focus)
}
