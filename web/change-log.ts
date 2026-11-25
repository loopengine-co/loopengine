// The workspace's change log: every setting changed in the console or over
// the API, with who changed it, kept as an audit event of kind "change"
// (core/audit-store.ts). adapters/http.ts calls changeOf for each request
// that changes something and records it once the answer is a success.
//
// What's a change is decided by path: agents, their workflows, triggers,
// schedules, permissions, tools, apps, messaging, secrets, and the
// workspace's settings. Doing work (running, previewing, chatting,
// deciding, feedback) isn't: decisions and feedback are events of their
// own. The request's body is kept with anything secret blanked, and the
// brief's own before and after are its versions.

export interface Change {
  /** In words: "Edited the workflow", "Changed permissions". */
  label: string
  agent?: string
  workflowId?: string
}

// Doing, not changing.
const NOT_CHANGES = [
  /^\/agents\/[^/]+\/messages(\/stream)?$/,
  /\/(feedback|run|preview|test|evals\/run|criteria\/draft|telegram-webhook|slack-channels|search|install-deps|refresh)$/,
]

const LABELS: [RegExp, string | ((method: string, m: RegExpMatchArray) => string)][] = [
  [/^\/agents$/, 'Added an agent'],
  [/^\/agents\/[^/]+$/, (method) => (method === 'DELETE' ? 'Removed the agent' : 'Changed the agent')],
  [/^\/agents\/[^/]+\/workflows$/, 'Created a workflow'],
  [/^\/agents\/[^/]+\/workflows\/[^/]+$/, (method) => (method === 'DELETE' ? 'Removed the workflow' : 'Edited the workflow')],
  [/^\/agents\/[^/]+\/workflows\/[^/]+\/versions\/(\d+)\/restore$/, (_method, m) => `Restored workflow version ${m[1]}`],
  [/^\/agents\/[^/]+\/workflows\/[^/]+\/messages$/, 'Changed where messages go'],
  [/^\/agents\/[^/]+\/workflows\/[^/]+\/triggers/, 'Changed webhook triggers'],
  [/^\/agents\/[^/]+\/workflows\/[^/]+\/evals\/criteria/, 'Changed the success criteria'],
  [/^\/agents\/[^/]+\/workflows\/[^/]+\/evals/, 'Changed eval cases'],
  [/^\/agents\/[^/]+\/schedules/, 'Changed schedules'],
  [/^\/schedules\//, 'Changed a schedule'],
  [/^\/agents\/[^/]+\/actauth/, 'Changed permissions'],
  [/^\/agents\/[^/]+\/tools\/http/, 'Changed HTTP tools'],
  [/^\/agents\/[^/]+\/gateway-tools/, 'Changed app tools'],
  [/^\/agents\/[^/]+\/apps\//, 'Changed apps'],
  [/^\/agents\/[^/]+\/skills\//, 'Changed skills'],
  [/^\/agents\/[^/]+\/abilities/, 'Changed abilities'],
  [/^\/agents\/[^/]+\/notifier/, 'Changed the messaging app'],
  [/^\/agents\/[^/]+\/env/, 'Changed agent secrets'],
  [/^\/config\/policies\/versions\/(\d+)\/restore$/, (_method, m) => `Restored shared policies version ${m[1]}`],
  [/^\/config\/policies$/, 'Changed shared policies'],
  [/^\/config\/models/, 'Changed models'],
  [/^\/config\/time-zone$/, 'Changed the time zone'],
  [/^\/config\/apps/, 'Changed apps'],
  [/^\/config\/gateways/, 'Changed the app gateway'],
  [/^\/config\/upgrade$/, 'Upgraded LoopEngine'],
  [/^\/abilities\//, 'Changed workspace abilities'],
]

/** The change a request makes, or undefined when it doesn't change a
 * setting. */
export function changeOf(method: string, path: string): Change | undefined {
  if (method !== 'POST' && method !== 'PUT' && method !== 'PATCH' && method !== 'DELETE') return undefined
  if (NOT_CHANGES.some((pattern) => pattern.test(path))) return undefined
  for (const [pattern, label] of LABELS) {
    const m = path.match(pattern)
    if (!m) continue
    const agent = path.match(/^\/agents\/([^/]+)/)?.[1]
    const workflowId = path.match(/^\/agents\/[^/]+\/workflows\/([^/]+)/)?.[1]
    return {
      label: typeof label === 'string' ? label : label(method, m),
      ...(agent ? { agent: decodeURIComponent(agent) } : {}),
      ...(workflowId ? { workflowId } : {}),
    }
  }
  return undefined
}

const SECRET_KEY = /secret|token|password|passwd|api[_-]?key|authorization|credential|private|^value$|^key$/i
const MAX_TEXT = 4000

/** A body as kept in the log: secret-looking fields blanked, long text
 * cut. Secrets' bodies are dropped whole. */
export function keptBody(path: string, body: unknown): unknown {
  if (/\/env(\/|$)/.test(path)) return undefined
  return redact(body, 0)
}

function redact(value: unknown, depth: number): unknown {
  if (depth > 6) return '…'
  if (typeof value === 'string') return value.length > MAX_TEXT ? value.slice(0, MAX_TEXT) + '…' : value
  if (Array.isArray(value)) return value.slice(0, 100).map((v) => redact(v, depth + 1))
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, SECRET_KEY.test(k) && v ? '(hidden)' : redact(v, depth + 1)]))
  }
  return value
}

/** One setting a change touched: short values from and to, or for a
 * long text (instructions, policies) the lines added and removed. */
export interface FieldChange {
  field: string
  from?: string
  to?: string
  added?: string[]
  removed?: string[]
}

const showValue = (v: unknown): string => {
  if (v === undefined || v === null || v === '') return '(none)'
  const text = typeof v === 'string' ? v : JSON.stringify(v)
  return text.length > 200 ? text.slice(0, 199) + '…' : text
}

// Lines in `after` and not `before`, and the reverse, in order (the same
// longest-common-subsequence diff the workflow audit uses).
function lineChanges(before: string, after: string): { added: string[]; removed: string[] } {
  const a = before.split('\n')
  const b = after.split('\n')
  if (a.length * b.length > 4_000_000) {
    const inA = new Set(a)
    const inB = new Set(b)
    return { added: b.filter((l) => !inA.has(l) && l.trim()), removed: a.filter((l) => !inB.has(l) && l.trim()) }
  }
  const t: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0))
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) t[i][j] = a[i] === b[j] ? t[i + 1][j + 1] + 1 : Math.max(t[i + 1][j], t[i][j + 1])
  const added: string[] = []
  const removed: string[] = []
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++ } else if (t[i + 1][j] >= t[i][j + 1]) removed.push(a[i++])
    else added.push(b[j++])
  }
  removed.push(...a.slice(i))
  added.push(...b.slice(j))
  return { added: added.filter((l) => l.trim()).map((l) => l.slice(0, 300)), removed: removed.filter((l) => l.trim()).map((l) => l.slice(0, 300)) }
}

/** What differs between two snapshots of the same settings, field by
 * field. A text of several lines, or a long one, is told as lines added
 * and removed; anything else as its value before and after. */
// Always told as lines, however short: what an agent reads.
const TEXT_FIELDS = new Set(['instructions', 'shared policies', 'success criteria'])

export function describeChanges(before: Record<string, unknown>, after: Record<string, unknown>): FieldChange[] {
  const out: FieldChange[] = []
  for (const field of [...new Set([...Object.keys(before), ...Object.keys(after)])]) {
    const b = before[field]
    const a = after[field]
    if (JSON.stringify(b) === JSON.stringify(a)) continue
    const long = (v: unknown) => typeof v === 'string' && (TEXT_FIELDS.has(field) || v.includes('\n') || v.length > 200)
    if (long(b) || long(a)) {
      const { added, removed } = lineChanges(typeof b === 'string' ? b : '', typeof a === 'string' ? a : '')
      out.push({ field, added: added.slice(0, 40), removed: removed.slice(0, 40) })
    } else out.push({ field, from: showValue(b), to: showValue(a) })
  }
  return out
}

/** The changes in a line: "instructions: 2 lines added, 1 removed; title:
 * Refunds → Refund check". */
export function changesSummary(changes: FieldChange[]): string {
  return changes.map((c) => (c.added || c.removed
    ? `${c.field}: ${c.added?.length ?? 0} line${c.added?.length === 1 ? '' : 's'} added, ${c.removed?.length ?? 0} removed`
    : `${c.field}: ${c.from} → ${c.to}`)).join('; ')
}
