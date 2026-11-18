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
// The agent's own writing (slackAgentText): formatted, links shown.
const OPEN_AGENT = '\u0003'
const CLOSE_AGENT = '\u0004'
const MARKERS = /[\u0001-\u0006]/g
const KEEP = /(```[\s\S]*?```|`[^`\n]*`|\u0001[\s\S]*?\u0002|\u0003[\s\S]*?\u0004)/
// Where a kept piece sits while the text around it is converted.
const SLOT = '\u0005'
const SLOT_END = '\u0006'
const SLOTS = /\u0005(\d+)\u0006/g

export function toSlackMrkdwn(markdown: string): string {
  // The kept pieces (code, someone else's text, the agent's writing) are
  // set aside while the rest is converted as one, so formatting around
  // them pairs up: "**Answered by <name>:**", "~~<old value>~~".
  const kept: string[] = []
  const prose = markdown
    .split(KEEP)
    .map((part, i) => {
      if (i % 2 === 0) return part
      kept.push(part)
      return `${SLOT}${kept.length - 1}${SLOT_END}`
    })
    .join('')
  return convertProse(prose)
    .replace(SLOTS, (_m, n: string) => {
      const part = kept[Number(n)]
      return part.startsWith(OPEN_AGENT) ? agentMrkdwn(part.slice(1, -1)) : part
    })
    .replace(MARKERS, '')
}

// A run of Markdown table lines ("| a | b |").
const TABLE = /((?:^[ \t]*\|.*\|[ \t]*(?:\n|$)){2,})/m

/** The agent's Markdown as mrkdwn: &, < and > escaped first (so nothing
 * becomes a mention, a channel-wide ping or a disguised link), code and
 * tables as code blocks, the rest formatted with links' addresses showing. */
function agentMrkdwn(text: string): string {
  return escapeSlack(text)
    .split(/(```[\s\S]*?```|`[^`\n]*`)/)
    .map((part, i) => {
      if (i % 2 === 1) return part
      return part
        .split(TABLE)
        .map((piece, j) => (j % 2 === 1 ? '```\n' + piece.replace(/\n$/, '') + '\n```\n' : convertProse(piece, { links: false })))
        .join('')
    })
    .join('')
}

function escapeSlack(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function convertProse(text: string, options: { links?: boolean } = {}): string {
  const links = options.links ?? true
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
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, links ? '<$2|$1>' : '$1 ($2)')
  out = out.replace(/\u0000(\d+)\u0000/g, (_m, n: string) => `*${bold[Number(n)]}*`)
  return out
}

/** Slack's own escaping, for text that isn't ours (an argument, a
 * reason): with &, < and > escaped, a value can't become a mention, a
 * channel-wide ping (<!channel>) or a disguised link. */
export function slackEscape(text: string): string {
  return OPEN + escapeSlack(text.replace(MARKERS, '')) + CLOSE
}

/** Marks the agent's own writing (its question, its reason, its result):
 * its Markdown is shown formatted, but escaped like slackEscape and with
 * a link's address showing instead of hidden behind text, since what the
 * agent writes can carry text from anyone. */
export function slackAgentText(text: string): string {
  return OPEN_AGENT + text.replace(MARKERS, '') + CLOSE_AGENT
}

/** A call's arguments as Slack mrkdwn (core/messaging/format-args.ts). */
export function slackArgs(args: Record<string, unknown>, schema?: Record<string, unknown>): string {
  return toSlackMrkdwn(formatArgs(args, slackEscape, schema))
}
