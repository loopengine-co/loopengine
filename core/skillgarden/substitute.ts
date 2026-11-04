/** Replaces `$ARGUMENTS` with the raw args string, and `$1`/`$2`/... with
 * whitespace-split positional args — the same placeholder convention
 * skill authors already expect from Claude Code's own Skill tool. */
export function substituteArguments(body: string, args?: string): string {
  const argString = args ?? ''
  let result = body.replaceAll('$ARGUMENTS', argString)

  const positional = argString.split(/\s+/).filter(Boolean)
  result = result.replace(/\$(\d+)/g, (_match, indexStr: string) => {
    const index = Number(indexStr)
    return positional[index - 1] ?? ''
  })

  return result
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
