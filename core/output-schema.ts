// A workflow's output schema: a JSON Schema its result must match. With
// one, the agent is told to end with JSON that matches it; each run's
// reply is checked (core/workflow-runs.ts), and when it doesn't match the
// agent is told what's wrong and asked again, up to MAX_OUTPUT_RETRIES
// times, before the run fails. A run that matches keeps the parsed JSON
// as its `output`, beside the text `result`, for apps, callbacks and the
// next workflow in a chain (which can take one field of it).
//
// Checked with Ajv (JSON Schema draft 2020-12's common keywords, and
// formats such as email, date and uri).
import { Ajv, type ErrorObject, type ValidateFunction } from 'ajv'
import addFormatsModule from 'ajv-formats'

export type JsonSchema = Record<string, unknown>

/** Times a run is asked again for a result that doesn't match. */
export const MAX_OUTPUT_RETRIES = 2
const MAX_SCHEMA_CHARS = 20_000

export class OutputSchemaError extends Error {}

const ajv = new Ajv({ allErrors: true, strict: false })
const addFormats = (addFormatsModule as unknown as { default?: typeof addFormatsModule }).default ?? addFormatsModule
;(addFormats as unknown as (a: Ajv) => void)(ajv)
const compiled = new Map<string, ValidateFunction>()

function validatorFor(schema: JsonSchema): ValidateFunction {
  const key = JSON.stringify(schema)
  let fn = compiled.get(key)
  if (!fn) {
    fn = ajv.compile(schema)
    if (compiled.size > 200) compiled.clear()
    compiled.set(key, fn)
  }
  return fn
}

/** A schema as saved: a JSON object (or its text) that Ajv can compile,
 * describing an object or an array. Throws OutputSchemaError saying
 * what's wrong. */
export function checkOutputSchema(input: unknown): JsonSchema {
  let schema = input
  if (typeof input === 'string') {
    try {
      schema = JSON.parse(input)
    } catch (err) {
      throw new OutputSchemaError(`The output schema isn't valid JSON: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) throw new OutputSchemaError('The output schema must be a JSON object, e.g. { "type": "object", "properties": { … } }.')
  const s = schema as JsonSchema
  if (JSON.stringify(s).length > MAX_SCHEMA_CHARS) throw new OutputSchemaError(`The output schema is too long (at most ${MAX_SCHEMA_CHARS.toLocaleString('en-US')} characters).`)
  if (s.type !== 'object' && s.type !== 'array') throw new OutputSchemaError('The output schema\'s "type" must be "object" or "array": the result is one JSON value with named fields, or a list.')
  try {
    validatorFor(s)
  } catch (err) {
    throw new OutputSchemaError(`The output schema isn't a valid JSON Schema: ${err instanceof Error ? err.message : String(err)}`)
  }
  return s
}

/** The JSON in a reply: the whole reply, else its last ```json block,
 * else the span from its first { or [ to its last } or ]. */
export function jsonInReply(text: string): { found: true; value: unknown } | { found: false } {
  const attempts: string[] = [text.trim()]
  const fences = [...text.matchAll(/```(?:json)?\s*\n([\s\S]*?)\n?```/g)].map((m) => m[1]!)
  if (fences.length) attempts.push(fences[fences.length - 1]!.trim())
  const start = text.search(/[{[]/)
  const end = Math.max(text.lastIndexOf('}'), text.lastIndexOf(']'))
  if (start >= 0 && end > start) attempts.push(text.slice(start, end + 1))
  for (const candidate of attempts) {
    try {
      return { found: true, value: JSON.parse(candidate) }
    } catch {}
  }
  return { found: false }
}

function errorLine(e: ErrorObject): string {
  const where = e.instancePath ? e.instancePath.replace(/^\//, '').replace(/\//g, '.') : 'the result'
  const extra = e.keyword === 'additionalProperties' ? ` (${String((e.params as { additionalProperty?: string }).additionalProperty)})`
    : e.keyword === 'enum' ? `: ${((e.params as { allowedValues?: unknown[] }).allowedValues ?? []).map((v) => JSON.stringify(v)).join(', ')}`
    : ''
  return `${where} ${e.message ?? 'is not valid'}${extra}`
}

/** A reply checked against a schema: its JSON when it matches, else
 * what's wrong, a line each (at most 10). */
export function checkOutput(schema: JsonSchema, text: string): { ok: true; value: unknown } | { ok: false; errors: string[] } {
  const json = jsonInReply(text)
  if (!json.found) return { ok: false, errors: ['The reply has no JSON in it.'] }
  const validate = validatorFor(schema)
  if (validate(json.value)) return { ok: true, value: json.value }
  return { ok: false, errors: (validate.errors ?? []).slice(0, 10).map(errorLine) }
}

/** What the agent is told, with the rest of its instructions. */
export function outputSchemaInstructions(schema: JsonSchema): string {
  return `End with your result as JSON that matches this JSON Schema, and nothing after it (a short note before it is fine):\n\n\`\`\`json\n${JSON.stringify(schema, null, 2)}\n\`\`\``
}

/** What the agent is told when its result didn't match. */
export function outputRetryMessage(errors: string[]): string {
  return `Your result doesn't match the workflow's output schema:\n${errors.map((e) => `- ${e}`).join('\n')}\n\nReply again with the corrected result as JSON matching the schema. Use what you already found; don't redo work or repeat any action that sends, posts or changes something.`
}
