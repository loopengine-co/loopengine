// Telegram's side of formatting: messages go out with parse_mode HTML,
// so the Markdown the engine and the model write is turned into the few
// tags Telegram knows (b, i, s, code, pre, a). Everything else is
// HTML-escaped, so no text can become a tag. Text that isn't ours
// (telegramEscape) is escaped too but never turned into formatting or a
// link.

import { formatArgs } from '../../format-args.js'

const OPEN = '\u0001'
const CLOSE = '\u0002'
// The agent's own writing (telegramAgentText): formatted, links shown.
const OPEN_AGENT = '\u0003'
const CLOSE_AGENT = '\u0004'
const MARKERS = /[\u0001-\u0004]/g
const KEEP = /(```[\s\S]*?```|`[^`\n]*`|\u0001[\s\S]*?\u0002|\u0003[\s\S]*?\u0004)/

// Telegram's limit is 4096 characters of text after the tags are read;
// cutting the Markdown well short of it keeps the tags whole.
const MAX_MARKDOWN = 3800

function html(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Marks text that isn't ours, so toTelegramHtml escapes it and leaves it
 * as plain text. */
export function telegramEscape(text: string): string {
  return OPEN + text.replace(MARKERS, '') + CLOSE
}

/** Marks the agent's own writing (its question, its reason, its result):
 * its Markdown is shown formatted, as the console shows it (bold, lists,
 * headings, code, a table as fixed-width text), but a link shows its
 * address instead of hiding it behind text, since what the agent writes
 * can carry text from anyone. */
export function telegramAgentText(text: string): string {
  return OPEN_AGENT + text.replace(MARKERS, '') + CLOSE_AGENT
}

// A long message goes out as several, at most this many; past that the
// middle is left out (the last part, with its link and buttons, stays).
const MAX_PARTS = 10

/** Where a part may end: a paragraph break, else a line break, else a
 * space, as late as fits; mid-word only when there's none in the later
 * half. */
function breakAt(text: string, max: number): number {
  for (const sep of ['\n\n', '\n', ' ']) {
    const at = text.lastIndexOf(sep, max)
    if (at > max / 2) return at
  }
  return max
}

/** Splits Markdown into parts that each fit one Telegram message, between
 * paragraphs where it can. A part ending inside the agent's escaped text
 * (telegramEscape) or a code block closes it, and the next part opens it
 * again, so every part formats on its own. Each is a little under the
 * limit, leaving room for those markers and the cut-short note. */
export function splitTelegramMarkdown(markdown: string, max = MAX_MARKDOWN - 100): string[] {
  const parts: string[] = []
  let rest = markdown
  while (rest.length > max) {
    const at = breakAt(rest, max)
    let head = rest.slice(0, at).trimEnd()
    rest = rest.slice(at).replace(/^[ \n]+/, '')
    let escaped = false
    let agent = false
    let fenced = false
    for (let i = 0; i < head.length; i++) {
      if (head[i] === OPEN) escaped = true
      else if (head[i] === CLOSE) escaped = false
      else if (head[i] === OPEN_AGENT) agent = true
      else if (head[i] === CLOSE_AGENT) agent = false
      else if (!escaped && head.startsWith('```', i)) {
        fenced = !fenced
        i += 2
      }
    }
    if (escaped) {
      head += CLOSE
      rest = OPEN + rest
    }
    // A code block open inside the agent's text closes before its marker.
    if (fenced) head += '\n```'
    if (agent) head += CLOSE_AGENT
    if (fenced) rest = '```\n' + rest
    if (agent) rest = OPEN_AGENT + rest
    parts.push(head)
  }
  parts.push(rest)
  if (parts.length <= MAX_PARTS) return parts
  const kept = parts.slice(0, MAX_PARTS - 1)
  kept[kept.length - 1] += '\n\n… (the rest is cut short here; the decision link has it all)'
  return [...kept, parts[parts.length - 1]!]
}

export function toTelegramHtml(markdown: string): string {
  const cut = markdown.length > MAX_MARKDOWN ? markdown.slice(0, MAX_MARKDOWN).trimEnd() + '\n…' : markdown
  return cut
    .split(KEEP)
    .map((part, i) => {
      if (i % 2 === 0) return convertProse(part)
      if (part.startsWith(OPEN_AGENT)) return agentHtml(part.slice(1, -1))
      const plain = part.replace(MARKERS, '')
      if (part.startsWith(OPEN)) return html(plain)
      if (part.startsWith('```')) return `<pre>${html(plain.slice(3, -3).replace(/^[\w-]*\n/, ''))}</pre>`
      return `<code>${html(plain.slice(1, -1))}</code>`
    })
    .join('')
    .replace(MARKERS, '')
}

// A run of Markdown table lines ("| a | b |").
const TABLE = /((?:^[ \t]*\|.*\|[ \t]*(?:\n|$)){2,})/m

/** The agent's Markdown: code and tables as fixed-width text, the rest
 * formatted, links with their address showing. */
function agentHtml(text: string): string {
  return text
    .split(/(```[\s\S]*?```|`[^`\n]*`)/)
    .map((part, i) => {
      if (i % 2 === 1) return part.startsWith('```') ? `<pre>${html(part.slice(3, -3).replace(/^[\w-]*\n/, ''))}</pre>` : `<code>${html(part.slice(1, -1))}</code>`
      return part
        .split(TABLE)
        .map((piece, j) => (j % 2 === 1 ? `<pre>${html(piece.replace(/\n$/, ''))}</pre>\n` : convertProse(piece, { links: false })))
        .join('')
    })
    .join('')
}

function convertProse(text: string, options: { links?: boolean } = {}): string {
  const links = options.links ?? true
  return html(text)
    // # Heading -> bold
    .replace(/^#{1,6}[ \t]+(.+?)[ \t]*#*[ \t]*$/gm, '<b>$1</b>')
    // - item / * item -> • item
    .replace(/^([ \t]*)[-*+][ \t]+/gm, '$1• ')
    .replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, '<b>$1</b>')
    .replace(/__(?=\S)([\s\S]*?\S)__/g, '<b>$1</b>')
    .replace(/(^|[^\w*])\*(?=\S)([^*\n]*?\S)\*(?![\w*])/g, '$1<i>$2</i>')
    .replace(/(^|[^\w])_(?=\S)([^_\n]*?\S)_(?!\w)/g, '$1<i>$2</i>')
    .replace(/~~(?=\S)([\s\S]*?\S)~~/g, '<s>$1</s>')
    // [text](url): the URL was escaped with the rest, which is what an
    // attribute needs, and can't hold a quote.
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)"]+)\)/g, links ? '<a href="$2">$1</a>' : '$1 ($2)')
}

/** A call's arguments as Telegram HTML (core/messaging/format-args.ts). */
export function telegramArgs(args: Record<string, unknown>, schema?: Record<string, unknown>): string {
  return toTelegramHtml(formatArgs(args, telegramEscape, schema))
}
