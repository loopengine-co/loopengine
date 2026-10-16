// Models write Markdown even when asked for Slack's own format, and Slack
// shows Markdown's **bold**, [links](url) and # headings as literal
// characters. This turns the common cases into Slack mrkdwn before a
// reply is posted; code (```blocks``` and `spans`) is left as written,
// and so is text slackEscape marked as someone else's.

import { formatArgs } from '../../format-args.js'

// slackEscape wraps text that isn't ours in these, so the conversion
// below never turns it into formatting or a link; they're removed after.
const OPEN = '\u0001'
const CLOSE = '\u0002'
const KEEP = /(```[\s\S]*?```|`[^`\n]*`|\u0001[\s\S]*?\u0002)/

export function toSlackMrkdwn(markdown: string): string {
  return markdown
    // ~~old value~~ around protected text: the markers sit outside it.
    .replace(/~~(\u0001[^\u0002]*\u0002)~~/g, '~$1~')
    .split(KEEP)
    .map((part, i) => (i % 2 === 1 ? part : convertProse(part)))
    .join('')
    .replace(/[\u0001\u0002]/g, '')
}

function convertProse(text: string): string {
  const bold: string[] = []
  const keepBold = (inner: string) => {
    bold.push(inner)
    return `\u0000${bold.length - 1}\u0000`
  }
  let out = text
    // # Heading -> *Heading*
    .replace(/^#{1,6}[ \t]+(.+?)[ \t]*#*[ \t]*$/gm, (_m, title: string) => keepBold(title))
    // - item / * item -> • item
    .replace(/^([ \t]*)[-*+][ \t]+/gm, '$1• ')
    // **bold** / __bold__ -> *bold*
    .replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, (_m, inner: string) => keepBold(inner))
    .replace(/__(?=\S)([\s\S]*?\S)__/g, (_m, inner: string) => keepBold(inner))
    // *italic* -> _italic_ (what's left of single asterisks)
    .replace(/(^|[^\w*])\*(?=\S)([^*\n]*?\S)\*(?![\w*])/g, '$1_$2_')
    // ~~strike~~ -> ~strike~
    .replace(/~~(?=\S)([\s\S]*?\S)~~/g, '~$1~')
    // [text](url) -> <url|text>
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, '<$2|$1>')
  out = out.replace(/\u0000(\d+)\u0000/g, (_m, n: string) => `*${bold[Number(n)]}*`)
  return out
}

/** Slack's own escaping, for text that isn't ours (an argument, a
 * reason): with &, < and > escaped, a value can't become a mention, a
 * channel-wide ping (<!channel>) or a disguised link. */
export function slackEscape(text: string): string {
  return OPEN + text.replace(/[\u0001\u0002]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + CLOSE
}

/** A call's arguments as Slack mrkdwn (core/messaging/format-args.ts). */
export function slackArgs(args: Record<string, unknown>, schema?: Record<string, unknown>): string {
  return toSlackMrkdwn(formatArgs(args, slackEscape, schema))
}
