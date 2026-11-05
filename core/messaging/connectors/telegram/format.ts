// Telegram's side of formatting: messages go out with parse_mode HTML,
// so the Markdown the engine and the model write is turned into the few
// tags Telegram knows (b, i, s, code, pre, a). Everything else is
// HTML-escaped, so no text can become a tag. Text that isn't ours
// (telegramEscape) is escaped too but never turned into formatting or a
// link.

import { formatArgs } from '../../format-args.js'

const OPEN = '\u0001'
const CLOSE = '\u0002'
const KEEP = /(```[\s\S]*?```|`[^`\n]*`|\u0001[\s\S]*?\u0002)/

// Telegram's limit is 4096 characters of text after the tags are read;
// cutting the Markdown well short of it keeps the tags whole.
const MAX_MARKDOWN = 3800

function html(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Marks text that isn't ours, so toTelegramHtml escapes it and leaves it
 * as plain text. */
export function telegramEscape(text: string): string {
  return OPEN + text.replace(/[\u0001\u0002]/g, '') + CLOSE
}

export function toTelegramHtml(markdown: string): string {
  const cut = markdown.length > MAX_MARKDOWN ? markdown.slice(0, MAX_MARKDOWN).trimEnd() + '\n…' : markdown
  return cut
    .split(KEEP)
    .map((part, i) => {
      if (i % 2 === 0) return convertProse(part)
      const plain = part.replace(/[\u0001\u0002]/g, '')
      if (part.startsWith(OPEN)) return html(plain)
      if (part.startsWith('```')) return `<pre>${html(plain.slice(3, -3).replace(/^[\w-]*\n/, ''))}</pre>`
      return `<code>${html(plain.slice(1, -1))}</code>`
    })
    .join('')
    .replace(/[\u0001\u0002]/g, '')
}

function convertProse(text: string): string {
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
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)"]+)\)/g, '<a href="$2">$1</a>')
}

/** A call's arguments as Telegram HTML (core/messaging/format-args.ts). */
export function telegramArgs(args: Record<string, unknown>, schema?: Record<string, unknown>): string {
  return toTelegramHtml(formatArgs(args, telegramEscape, schema))
}
