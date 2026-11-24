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
  [/^\/agents\/[^/]+\/workflows\/[^/]+\/versions\/(\d+)\/restore$/, (_method, m) => `Restored brief version ${m[1]}`],
  [/^\/agents\/[^/]+\/workflows\/[^/]+\/messages$/, 'Changed where messages go'],
  [/^\/agents\/[^/]+\/workflows\/[^/]+\/triggers/, 'Changed webhook triggers'],
  [/^\/agents\/[^/]+\/workflows\/[^/]+\/evals\/criteria/, 'Changed the checklist'],
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
