// A model reproducing a long, opaque, high-entropy string (a cloud
// storage signed URL's own Signature query param can run to ~300 base64
// characters) in its own generated output is prone to single-character
// transcription slips — no semantic pattern to anchor on, unlike normal
// prose. That's harmless when it only breaks a link the model itself
// writes into its final chat reply (cosmetic — see web/playground.ts's
// own client-side correctKnownUrls for that case), but the exact same
// slip can also land inside a *tool call's own arguments* — a model
// passing an earlier tool's result URL into a later tool call (e.g.
// handing image URLs from one ability to a zip-archiving ability's own
// `files` argument) — where it's not cosmetic at all: the later tool
// actually fetches that broken URL and fails.
//
// collectKnownUrls/correctKnownUrls fix that at the one place both
// failure modes share: run-agent.ts's own tool-dispatch loop, which has
// already seen every tool result in this session (via `messages`) by
// the time it's about to hand a new tool_use block's `input` to
// gate.evaluate()/execute(). A URL a model just wrote into a tool call's
// arguments gets snapped back to the last known-good one sharing the
// same base (the object path — descriptive, not random, so far less
// likely to get mistyped) whenever they differ, the same
// correct-the-query-not-the-path heuristic web/playground.ts's own copy
// already uses. Two independent, non-shared implementations by
// necessity — that one runs in a browser, parsing a chat reply's
// markdown text; this one runs in Node, walking structured tool_use
// input — not the same runtime, not the same data shape, nothing real
// to share between them.

import type { Message, ModelContentBlock } from './run-agent.js'

const URL_PATTERN = /^https?:\/\//

/** Recursively walks an arbitrary JSON value collecting every string
 * that looks like a signed URL — has a "?" (nothing to correct in a
 * bare URL with no query to corrupt). Last one seen for a given base
 * wins: a re-signed URL for the same object is just as valid a
 * correction target as the first one seen. */
function recordKnownUrls(value: unknown, knownUrlsByBase: Map<string, string>): void {
  if (typeof value === 'string') {
    if (URL_PATTERN.test(value)) {
      const qIndex = value.indexOf('?')
      if (qIndex !== -1) knownUrlsByBase.set(value.slice(0, qIndex), value)
    }
  } else if (Array.isArray(value)) {
    for (const item of value) recordKnownUrls(item, knownUrlsByBase)
  } else if (value && typeof value === 'object') {
    for (const key of Object.keys(value)) recordKnownUrls((value as Record<string, unknown>)[key], knownUrlsByBase)
  }
}

/** Seeds a fresh known-URL map from a session's full message history —
 * every tool_result block's own content, parsed as JSON where possible
 * (plain-text tool results just contribute nothing, not an error). Call
 * once at the top of a run; toollane:result handling in run-agent.ts
 * itself keeps it updated live as new results come in during the run,
 * same map, not a fresh one each turn. */
export function collectKnownUrls(messages: Message[]): Map<string, string> {
  const knownUrlsByBase = new Map<string, string>()
  for (const message of messages) {
    if (!Array.isArray(message.content)) continue
    for (const block of message.content) {
      if (block.type !== 'tool_result' || typeof block.content !== 'string') continue
      try {
        recordKnownUrls(JSON.parse(block.content), knownUrlsByBase)
      } catch {
        // Not JSON — nothing to correct against.
      }
    }
  }
  return knownUrlsByBase
}

/** Same JSON.parse-then-walk as collectKnownUrls above, for a single
 * fresh tool result (toollane:result's own summary) — called right
 * after each call resolves so a later call in the same run sees it
 * immediately, without waiting for the next collectKnownUrls seed
 * (there isn't one; the same map lives for the whole run). */
export function recordKnownUrlsFromResult(summary: string, knownUrlsByBase: Map<string, string>): void {
  try {
    recordKnownUrls(JSON.parse(summary), knownUrlsByBase)
  } catch {
    // Not JSON — nothing to correct against.
  }
}

/** Recursively rebuilds a tool_use block's own `input`, snapping any
 * string that looks like a signed URL back to the known-good one for
 * its base whenever they differ. Returns the same reference when
 * nothing needed correcting (the overwhelmingly common case) rather
 * than always cloning, so call sites can skip a write-back when the
 * value is unchanged. */
export function correctKnownUrls<T>(value: T, knownUrlsByBase: Map<string, string>): T {
  if (typeof value === 'string') {
    if (!URL_PATTERN.test(value)) return value
    const qIndex = value.indexOf('?')
    if (qIndex === -1) return value
    const known = knownUrlsByBase.get(value.slice(0, qIndex))
    return (known !== undefined && known !== value ? known : value) as unknown as T
  }
  if (Array.isArray(value)) {
    let changed = false
    const next = value.map((item) => {
      const corrected = correctKnownUrls(item, knownUrlsByBase)
      if (corrected !== item) changed = true
      return corrected
    })
    return (changed ? next : value) as unknown as T
  }
  if (value && typeof value === 'object') {
    let changed = false
    const next: Record<string, unknown> = {}
    for (const key of Object.keys(value as Record<string, unknown>)) {
      const corrected = correctKnownUrls((value as Record<string, unknown>)[key], knownUrlsByBase)
      if (corrected !== (value as Record<string, unknown>)[key]) changed = true
      next[key] = corrected
    }
    return (changed ? next : value) as unknown as T
  }
  return value
}

/** Applies correctKnownUrls to a tool_use block's own `input` in place —
 * the one call site run-agent.ts actually needs, right before a block's
 * input is used for anything (gate.evaluate, logging, execute alike all
 * need to agree on the same, corrected value). No-ops for a block with
 * no input (a tool that takes no arguments). */
export function correctToolUseInput(block: ModelContentBlock, knownUrlsByBase: Map<string, string>): void {
  if (!block.input) return
  block.input = correctKnownUrls(block.input, knownUrlsByBase)
}
