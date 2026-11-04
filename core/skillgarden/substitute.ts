/** Replaces `$ARGUMENTS` with the raw args string, and `$1`/`$2`/... with
 * whitespace-split positional args — the same placeholder convention
 * skill authors already expect from Claude Code's own Skill tool.
 *
 * A `$N` is filled only when that argument was given: with two args, `$1`
 * and `$2` are, while `$3` and a dollar amount like `$50` stay as
 * written; with none, nothing positional changes. `$$1` is a literal
 * "$1", for a skill that takes args and mentions one. One pass, so an
 * argument's own text is never filled in again. */
export function substituteArguments(body: string, args?: string): string {
  const argString = args ?? ''
  const positional = argString.split(/\s+/).filter(Boolean)
  return body.replace(/\$(\$(?=\d)|ARGUMENTS|\d+)/g, (match, token: string) => {
    if (token === '$') return '$'
    if (token === 'ARGUMENTS') return argString
    const index = Number(token)
    return index >= 1 && index <= positional.length ? positional[index - 1]! : match
  })
}

/** Replaces `$name` placeholders (lowercase, e.g. `$order_number`) with
 * named parameters. A name in `declared` that wasn't given becomes empty
 * text; any other `$word` is left as it is, so `$ARGUMENTS`, `$1` and
 * dollar amounts are untouched. Names it fills are added to `used`. */
export function substituteParameters(body: string, params: Record<string, string>, options: { declared?: string[]; used?: Set<string> } = {}): string {
  const declared = new Set(options.declared ?? [])
  return body.replace(/\$([a-z_][a-z0-9_]*)/g, (match, name: string) => {
    if (Object.prototype.hasOwnProperty.call(params, name)) {
      options.used?.add(name)
      return params[name]!
    }
    return declared.has(name) ? '' : match
  })
}
