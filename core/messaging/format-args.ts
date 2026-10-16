// A tool call's arguments as something a person can read in a chat app,
// instead of JSON: one labelled line per argument, long or multi-line
// text (an email body) as a quoted block with its line breaks, lists as
// bullets. Labels come from the tool's schema (a property's `title`),
// else from the argument's name ("customer_id" -> "Customer id").
//
// The result is Markdown, which each connector turns into its own format
// (Slack: ./connectors/slack/format.ts). Every value goes through the
// connector's `escape`, so text the agent wrote can't become a mention,
// a link or a ping in the app.

const INLINE_MAX = 80
const LONG_MAX = 1500

type Escape = (text: string) => string

interface Property {
  title?: string
}

function propertiesOf(schema?: Record<string, unknown>): Record<string, Property> {
  const props = schema?.properties
  return props && typeof props === 'object' ? (props as Record<string, Property>) : {}
}

/** A label comes from the tool's own schema, not from the agent, but is
 * still kept plain: no markup or link characters. */
function plain(label: string): string {
  return label.replace(/[*_~`<>&|[\]]/g, '').trim() || 'Value'
}

/** "customer_id" / "customerId" -> "Customer id". */
export function labelFor(key: string, schema?: Record<string, unknown>): string {
  const title = propertiesOf(schema)[key]?.title
  if (typeof title === 'string' && title.trim()) return title.trim()
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLowerCase()
  return words ? words[0].toUpperCase() + words.slice(1) : key
}

/** Keys in the schema's order, then any others. */
function orderedKeys(args: Record<string, unknown>, schema?: Record<string, unknown>): string[] {
  const fromSchema = Object.keys(propertiesOf(schema)).filter((k) => k in args)
  return [...fromSchema, ...Object.keys(args).filter((k) => !fromSchema.includes(k))]
}

function isLongText(value: unknown): value is string {
  return typeof value === 'string' && (value.length > INLINE_MAX || value.includes('\n'))
}

function quote(text: string, escape: Escape): string {
  const cut = text.length > LONG_MAX ? text.slice(0, LONG_MAX).trimEnd() + '… (cut short here; the decision link has it all)' : text
  return cut
    .split('\n')
    .map((line) => `> ${escape(line)}`)
    .join('\n')
}

function inline(value: unknown, escape: Escape): string {
  if (typeof value === 'string') return escape(value)
  if (value === null || typeof value !== 'object') return String(value)
  return '`' + escape(JSON.stringify(value)) + '`'
}

/** One argument: `**Label:** value`, or the label over a quoted block,
 * bullets or nested fields. */
function field(label: string, value: unknown, escape: Escape, indent = ''): string {
  const head = `${indent}**${plain(label)}:**`
  if (isLongText(value)) return `${head}\n${quote(value, escape)}`
  if (Array.isArray(value)) {
    if (!value.length) return `${head} (none)`
    const simple = value.every((v) => v === null || typeof v !== 'object')
    const joined = value.map((v) => inline(v, escape)).join(', ')
    if (simple && joined.length <= INLINE_MAX) return `${head} ${joined}`
    return `${head}\n${value.map((v) => `${indent}- ${isLongText(v) ? escape(v.slice(0, 300)) : inline(v, escape)}`).join('\n')}`
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined)
    if (!entries.length) return `${head} (empty)`
    if (indent) return `${head} ${inline(value, escape)}`
    return `${head}\n${entries.map(([k, v]) => field(labelFor(k), v, escape, '  ')).join('\n')}`
  }
  return `${head} ${inline(value, escape)}`
}

/** All of a call's arguments, one per line (long text quoted below its
 * label). */
export function formatArgs(args: Record<string, unknown>, escape: Escape, schema?: Record<string, unknown>): string {
  const keys = orderedKeys(args, schema).filter((k) => args[k] !== undefined && args[k] !== null)
  if (!keys.length) return '(no arguments)'
  return keys.map((k) => field(labelFor(k, schema), args[k], escape)).join('\n')
}

/** Only the arguments that differ, old struck through and new beside it;
 * changed long text is shown in full as it will run. */
export function formatChange(before: Record<string, unknown>, after: Record<string, unknown>, escape: Escape, schema?: Record<string, unknown>): string {
  const keys = [...new Set([...orderedKeys(after, schema), ...Object.keys(before)])].filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]))
  return keys
    .map((k) => {
      const label = `**${plain(labelFor(k, schema))}:**`
      const was = before[k]
      const now = after[k]
      if (now === undefined || now === null) return `${label} ~~${inline(was, escape)}~~ (removed)`
      if (isLongText(now) || isLongText(was)) return `${label} (changed, now:)\n${quote(typeof now === 'string' ? now : JSON.stringify(now), escape)}`
      if (was === undefined || was === null) return `${label} ${inline(now, escape)} (added)`
      return `${label} ~~${inline(was, escape)}~~ → ${inline(now, escape)}`
    })
    .join('\n')
}
