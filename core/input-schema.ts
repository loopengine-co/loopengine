// A workflow's input schema: each input's type and limits, beside its
// description and whether it's required (core/workflows.ts's parameters).
// A run's values are checked against it before anything runs, and kept as
// text, the same as before: a number as "20", yes/no as "true", a list or
// an object as its JSON. An input with no type is text, as every input
// was before types.
//
//   type      string (the default), number, integer, boolean, object, array
//   format    for a string: email, date (2026-11-25), date-time, uri
//   enum      the values allowed
//   pattern   for a string: a regular expression it must match
//   minimum, maximum            for a number
//   minLength, maxLength        for a string
//   default   used when a run doesn't give it
//
// inputSchemaOf gives the whole thing as one JSON Schema, for apps.
import { Ajv, type ErrorObject, type ValidateFunction } from 'ajv'
import addFormatsModule from 'ajv-formats'

export const INPUT_TYPES = ['string', 'number', 'integer', 'boolean', 'object', 'array'] as const
export type InputType = (typeof INPUT_TYPES)[number]
export const INPUT_FORMATS = ['email', 'date', 'date-time', 'uri'] as const
export type InputFormat = (typeof INPUT_FORMATS)[number]

/** An input's type and limits: all optional. */
export interface InputSpec {
  type?: InputType
  format?: InputFormat
  enum?: (string | number)[]
  pattern?: string
  minimum?: number
  maximum?: number
  minLength?: number
  maxLength?: number
  default?: string | number | boolean | Record<string, unknown> | unknown[]
}

export class InputSpecError extends Error {}

const SPEC_KEYS = ['type', 'format', 'enum', 'pattern', 'minimum', 'maximum', 'minLength', 'maxLength', 'default'] as const

const ajv = new Ajv({ allErrors: true, strict: false })
const addFormats = (addFormatsModule as unknown as { default?: typeof addFormatsModule }).default ?? addFormatsModule
;(addFormats as unknown as (a: Ajv) => void)(ajv)
const compiled = new Map<string, ValidateFunction>()
function validatorFor(schema: object): ValidateFunction {
  const key = JSON.stringify(schema)
  let fn = compiled.get(key)
  if (!fn) {
    fn = ajv.compile(schema)
    if (compiled.size > 500) compiled.clear()
    compiled.set(key, fn)
  }
  return fn
}

/** An input's JSON Schema: its spec and description. */
function schemaOf(spec: InputSpec, description?: string): Record<string, unknown> {
  // Only the type and limits: a parameter also has its own description
  // and "required", which mean something else in a JSON Schema.
  const { default: _d, ...rest } = specOf(spec)
  return { type: spec.type ?? 'string', ...rest, ...(description ? { description } : {}) }
}

/** An input's spec as saved: only the keys above, each of the right kind,
 * and a default that is itself a valid value. Throws InputSpecError
 * naming the input. */
export function checkInputSpec(name: string, raw: Record<string, unknown>): InputSpec {
  const bad = (what: string) => new InputSpecError(`Input "${name}": ${what}`)
  const spec: InputSpec = {}
  if (raw.type !== undefined && raw.type !== '') {
    if (!INPUT_TYPES.includes(raw.type as InputType)) throw bad(`its type must be one of ${INPUT_TYPES.join(', ')}.`)
    if (raw.type !== 'string') spec.type = raw.type as InputType
  }
  const type = spec.type ?? 'string'
  if (raw.format !== undefined && raw.format !== '') {
    if (type !== 'string' || !INPUT_FORMATS.includes(raw.format as InputFormat)) throw bad(`a format is for text only: ${INPUT_FORMATS.join(', ')}.`)
    spec.format = raw.format as InputFormat
  }
  if (raw.enum !== undefined) {
    const list = Array.isArray(raw.enum) ? raw.enum : []
    if (!list.length || list.some((v) => typeof v !== 'string' && typeof v !== 'number')) throw bad('its allowed values must be a list of text or numbers.')
    if (list.length) spec.enum = [...new Set(list as (string | number)[])].slice(0, 50)
  }
  if (raw.pattern !== undefined && raw.pattern !== '') {
    if (typeof raw.pattern !== 'string') throw bad('its pattern must be text.')
    try {
      new RegExp(raw.pattern, 'u')
    } catch {
      throw bad(`its pattern isn't a valid regular expression.`)
    }
    spec.pattern = raw.pattern
  }
  for (const key of ['minimum', 'maximum', 'minLength', 'maxLength'] as const) {
    if (raw[key] === undefined || raw[key] === '') continue
    const n = Number(raw[key])
    if (!Number.isFinite(n)) throw bad(`its ${key} must be a number.`)
    spec[key] = n
  }
  if (raw.default !== undefined && raw.default !== '') {
    const value = checkInputValue(name, spec, raw.default)
    if (!value.ok) throw bad(`its default isn't valid: ${value.error}`)
    spec.default = value.value as InputSpec['default']
  }
  try {
    validatorFor(schemaOf(spec))
  } catch (err) {
    throw bad(`its limits don't make a valid schema: ${err instanceof Error ? err.message : String(err)}`)
  }
  return spec
}

/** The spec keys a parameter has, read from a saved workflow: any that
 * don't check out are dropped (logged), so a bad edit to the file can't
 * stop its runs. */
export function inputSpecFrom(name: string, raw: Record<string, unknown>): InputSpec {
  const given = Object.fromEntries(SPEC_KEYS.filter((k) => raw[k] !== undefined).map((k) => [k, raw[k]]))
  if (!Object.keys(given).length) return {}
  try {
    return checkInputSpec(name, given)
  } catch (err) {
    console.error(`[loopengine] ignoring input "${name}"'s type: ${err instanceof Error ? err.message : String(err)}`)
    return {}
  }
}

function errorText(e: ErrorObject): string {
  if (e.keyword === 'enum') return `must be one of ${((e.params as { allowedValues?: unknown[] }).allowedValues ?? []).map((v) => JSON.stringify(v)).join(', ')}`
  return e.message ?? 'is not valid'
}

/** A value given for an input, checked against its spec: the typed value
 * and the text the run keeps, or what's wrong. Text that reads as the
 * type is taken ("20" for a number, "yes" for yes/no, JSON for a list). */
export function checkInputValue(name: string, spec: InputSpec, given: unknown): { ok: true; value: unknown; text: string } | { ok: false; error: string } {
  const type = spec.type ?? 'string'
  let value: unknown = given
  const isText = typeof given === 'string'
  if (type === 'string') {
    if (typeof given === 'number' || typeof given === 'boolean') value = String(given)
    else if (!isText) return { ok: false, error: `"${name}" must be text` }
  } else if (type === 'number' || type === 'integer') {
    if (isText) value = given.trim() === '' ? NaN : Number(given.trim())
    if (typeof value !== 'number' || !Number.isFinite(value)) return { ok: false, error: `"${name}" must be a ${type === 'integer' ? 'whole number' : 'number'}` }
  } else if (type === 'boolean') {
    if (isText) {
      const t = given.trim().toLowerCase()
      value = ['true', 'yes', '1'].includes(t) ? true : ['false', 'no', '0'].includes(t) ? false : given
    }
    if (typeof value !== 'boolean') return { ok: false, error: `"${name}" must be yes or no (true or false)` }
  } else {
    if (isText) {
      try {
        value = JSON.parse(given)
      } catch {
        return { ok: false, error: `"${name}" must be ${type === 'array' ? 'a list' : 'an object'} as JSON` }
      }
    }
    if (type === 'array' ? !Array.isArray(value) : !value || typeof value !== 'object' || Array.isArray(value)) return { ok: false, error: `"${name}" must be ${type === 'array' ? 'a list' : 'an object'}` }
  }
  const validate = validatorFor(schemaOf(spec))
  if (!validate(value)) return { ok: false, error: `"${name}" ${errorText(validate.errors![0]!)}` }
  return { ok: true, value, text: typeof value === 'string' ? value : JSON.stringify(value) }
}

/** A workflow's inputs as one JSON Schema, for apps that start it. */
export function inputSchemaOf(parameters: Record<string, InputSpec & { description: string; required: boolean }>): Record<string, unknown> {
  const properties = Object.fromEntries(Object.entries(parameters).map(([name, p]) => {
    const { description, required: _r, ...spec } = p
    return [name, { ...schemaOf(spec, description), ...(spec.default !== undefined ? { default: spec.default } : {}) }]
  }))
  const required = Object.entries(parameters).filter(([, p]) => p.required).map(([name]) => name)
  return { type: 'object', properties, ...(required.length ? { required } : {}), additionalProperties: false }
}

/** The spec part of a parameter, without its description and required. */
export function specOf(p: InputSpec & { description?: string; required?: boolean }): InputSpec {
  return Object.fromEntries(SPEC_KEYS.filter((k) => p[k] !== undefined).map((k) => [k, p[k]])) as InputSpec
}
