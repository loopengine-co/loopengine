// The workspace's time zone: what "9:00" means in a schedule, a
// template's start time and the console's date fields. Set from the
// console's Settings (LOOPENGINE_TIME_ZONE, an IANA name such as
// "America/New_York"); unset, it's the server's own, which on a hosted
// workspace is UTC.
//
// Times are worked out with Intl alone, no time zone data of our own:
// a wall-clock time is turned into an instant by guessing its offset
// and correcting it twice, which settles on the right answer either side
// of a daylight-saving change. A time the clocks skip (02:30 on the
// morning they spring forward) lands an hour later; a time that happens
// twice (the hour they fall back) is the first of the two.

export const TIME_ZONE_ENV = 'LOOPENGINE_TIME_ZONE'

export interface WallTime {
  year: number
  /** 1–12 */
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

const formatters = new Map<string, Intl.DateTimeFormat>()

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      weekday: 'short',
    })
    formatters.set(timeZone, f)
  }
  return f
}

export function isValidTimeZone(timeZone: unknown): timeZone is string {
  if (typeof timeZone !== 'string' || !timeZone.trim()) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone })
    return true
  } catch {
    return false
  }
}

/** The server's own time zone. */
export function serverTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
}

/** The workspace's time zone: LOOPENGINE_TIME_ZONE when it's a real one,
 * else the server's. */
export function workspaceTimeZone(): string {
  const configured = process.env[TIME_ZONE_ENV]?.trim()
  return configured && isValidTimeZone(configured) ? configured : serverTimeZone()
}

/** Every time zone this server knows, for the console's picker. */
export function listTimeZones(): string[] {
  const supported = (Intl as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.('timeZone') ?? []
  return supported.includes('UTC') ? supported : ['UTC', ...supported]
}

const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }

/** The wall-clock time (and weekday, 0 = Sunday) at `ms` in `timeZone`. */
export function wallTimeAt(ms: number, timeZone: string): WallTime & { weekday: number } {
  const parts: Record<string, string> = {}
  for (const p of formatter(timeZone).formatToParts(new Date(ms))) parts[p.type] = p.value
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekday: WEEKDAY_INDEX[parts.weekday] ?? 0,
  }
}

function asUtcMs(t: WallTime): number {
  return Date.UTC(t.year, t.month - 1, t.day, t.hour, t.minute, t.second)
}

/** How far ahead of UTC `timeZone` is at `ms`, in ms. */
function offsetAt(ms: number, timeZone: string): number {
  return asUtcMs(wallTimeAt(Math.floor(ms / 1000) * 1000, timeZone)) - Math.floor(ms / 1000) * 1000
}

/** The instant a wall-clock time in `timeZone` happens. Fields may
 * overflow (day 32, hour 25), as with Date.UTC. */
export function instantOf(t: WallTime, timeZone: string): number {
  const naive = asUtcMs(t)
  const first = naive - offsetAt(naive, timeZone)
  const second = naive - offsetAt(first, timeZone)
  // Either side of a change the two guesses differ; the earlier one is
  // right for a repeated hour, the later one for a skipped hour.
  if (first === second) return first
  return offsetAt(Math.min(first, second), timeZone) === naive - Math.min(first, second) ? Math.min(first, second) : Math.max(first, second)
}

const LOCAL_TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?$/

/** An ISO 8601 timestamp as ms. One with a "Z" or an offset is exact;
 * one without ("2026-11-02T09:00") is a wall-clock time in `timeZone`.
 * NaN when it isn't a timestamp. */
export function parseTimestamp(value: string, timeZone: string): number {
  const local = LOCAL_TIMESTAMP.exec(value.trim())
  if (!local) return Date.parse(value)
  const [, y, mo, d, h, mi, s] = local
  const t = { year: Number(y), month: Number(mo), day: Number(d), hour: Number(h), minute: Number(mi), second: Number(s ?? 0) }
  if (t.month < 1 || t.month > 12 || t.day < 1 || t.day > 31 || t.hour > 23 || t.minute > 59 || t.second > 59) return Number.NaN
  return instantOf(t, timeZone)
}

const TIME_OF_DAY = /^([01]?\d|2[0-3]):([0-5]\d)$/

/** "09:00" as [hours, minutes], or undefined when it isn't a time. */
export function parseTimeOfDay(value: string): [number, number] | undefined {
  const match = TIME_OF_DAY.exec(value.trim())
  return match ? [Number(match[1]), Number(match[2])] : undefined
}

/** The next time it's `at` ("09:00") in `timeZone`, strictly after
 * `nowMs`, on `weekday` (0 = Sunday) when given. */
export function nextTimeOfDay(at: [number, number], nowMs: number, timeZone: string, weekday?: number): number {
  const today = wallTimeAt(nowMs, timeZone)
  const ahead = weekday === undefined ? 0 : (weekday - today.weekday + 7) % 7
  const step = weekday === undefined ? 1 : 7
  for (let days = ahead; ; days += step) {
    const ms = instantOf({ year: today.year, month: today.month, day: today.day + days, hour: at[0], minute: at[1], second: 0 }, timeZone)
    if (ms > nowMs) return ms
  }
}

/** `ms` moved by whole calendar days in `timeZone`, keeping its time of
 * day across a daylight-saving change. */
export function addCalendarDays(ms: number, days: number, timeZone: string): number {
  const t = wallTimeAt(ms, timeZone)
  return instantOf({ ...t, day: t.day + days }, timeZone)
}

/** `ms` as "2026-11-02 09:00" in `timeZone`, for tool results the model
 * reads back to a person. */
export function formatWallTime(ms: number, timeZone: string): string {
  const t = wallTimeAt(ms, timeZone)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${t.year}-${pad(t.month)}-${pad(t.day)} ${pad(t.hour)}:${pad(t.minute)}`
}
