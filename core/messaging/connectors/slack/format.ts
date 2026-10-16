// Models write Markdown even when asked for Slack's own format, and Slack
// shows Markdown's **bold**, [links](url) and # headings as literal
// characters. This turns the common cases into Slack mrkdwn before a
// reply is posted; code (```blocks``` and `spans`) is left as written.

const CODE = /(```[\s\S]*?```|`[^`\n]*`)/

export function toSlackMrkdwn(markdown: string): string {
  return markdown
    .split(CODE)
    .map((part, i) => (i % 2 === 1 ? part : convertProse(part)))
    .join('')
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
