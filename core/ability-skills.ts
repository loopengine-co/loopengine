// An ability's skill, attached to the first result of its tools in a
// conversation. A skill only listed in the system prompt is opened when
// the model thinks to; this makes sure what an ability ships about how
// its tools' answers are read (an order's statuses, a store's rules)
// arrives with the first answer, and only when the ability is used.
//
// Which skills go with a tool, from the agent's ability records
// (agents/<name>/.loopengine-abilities.json), MCP apps included:
// - an ability with one skill: it goes with every tool of the ability;
// - with several: each goes with the tools its text names;
// - a tool none of them names gets a one-line pointer to them instead.
// A skill over SKILL_ATTACH_MAX_CHARS gets the pointer too.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Message } from './run-agent.js'

export const SKILL_ATTACH_MAX_CHARS = 12_000

export interface ToolSkills {
  /** Tool -> the skills attached with its first result. */
  attach: Map<string, string[]>
  /** Tool -> skills only pointed to. */
  point: Map<string, string[]>
}

interface AbilityRecord {
  tools?: unknown
  skills?: unknown
  mcp?: { tools?: Array<{ name?: unknown }> }
}

const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string' && v.length > 0) : [])

function namesTool(text: string, tool: string): boolean {
  return new RegExp(`(?<![A-Za-z0-9_])${tool.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z0-9_])`).test(text)
}

/** Works out which skills go with which tools. `skillText` returns a
 * skill's body, or undefined for one the agent doesn't have. */
export function toolSkillsFor(agentDir: string, skillText: (name: string) => string | undefined): ToolSkills {
  const result: ToolSkills = { attach: new Map(), point: new Map() }
  const file = join(agentDir, '.loopengine-abilities.json')
  if (!existsSync(file)) return result
  let records: Record<string, AbilityRecord>
  try {
    records = JSON.parse(readFileSync(file, 'utf8')) as Record<string, AbilityRecord>
  } catch {
    return result
  }
  const add = (map: Map<string, string[]>, tool: string, skill: string) => {
    const list = map.get(tool) ?? []
    if (!list.includes(skill)) map.set(tool, [...list, skill])
  }
  for (const record of Object.values(records)) {
    const tools = [...strings(record?.tools), ...strings(record?.mcp?.tools?.map((t) => t?.name))]
    const skills = strings(record?.skills).flatMap((name) => {
      const text = skillText(name)
      return text === undefined ? [] : [{ name, text }]
    })
    if (!tools.length || !skills.length) continue
    for (const tool of tools) {
      const fitting = skills.length === 1 ? skills : skills.filter((s) => namesTool(s.text, tool))
      if (!fitting.length) {
        for (const s of skills) add(result.point, tool, s.name)
        continue
      }
      for (const s of fitting) add(s.text.length > SKILL_ATTACH_MAX_CHARS ? result.point : result.attach, tool, s.name)
    }
  }
  return result
}

const ATTACHED = /\[skill attached: ([^\]\n]+)\]/g

/** Skills this conversation already has: opened with the Skill tool, or
 * attached to an earlier result. */
export function skillsInHistory(messages: Message[]): Set<string> {
  const seen = new Set<string>()
  for (const message of messages) {
    if (!Array.isArray(message.content)) continue
    for (const block of message.content as Array<{ type?: string; name?: string; input?: { skill?: unknown }; content?: unknown }>) {
      if (block.type === 'tool_use' && block.name === 'Skill' && typeof block.input?.skill === 'string') seen.add(block.input.skill)
      if (block.type === 'tool_result' && typeof block.content === 'string') for (const m of block.content.matchAll(ATTACHED)) seen.add(m[1])
    }
  }
  return seen
}

/** What to add to a tool's result: the skills that go with it and the
 * conversation doesn't have yet, then pointers to the others. Marks
 * what it adds in `seen`. Empty when there's nothing new. */
export function skillsForResult(tool: string, toolSkills: ToolSkills, seen: Set<string>, skillText: (name: string) => string | undefined): { text: string; attached: string[] } {
  const attached: string[] = []
  const parts: string[] = []
  for (const name of toolSkills.attach.get(tool) ?? []) {
    if (seen.has(name)) continue
    const body = skillText(name)
    if (body === undefined) continue
    seen.add(name)
    attached.push(name)
    parts.push(`[skill attached: ${name}]\nThe "${name}" skill comes with ${tool}. Read the result above with it:\n\n${body.trim()}`)
  }
  const pointers = (toolSkills.point.get(tool) ?? []).filter((name) => !seen.has(name) && !attached.includes(name))
  // Pointed to once: a pointer isn't a load, but repeating it on every
  // call is noise.
  const fresh = pointers.filter((name) => !seen.has(`pointer:${name}`))
  if (fresh.length) {
    for (const name of fresh) seen.add(`pointer:${name}`)
    parts.push(`Related skills: ${fresh.join(', ')}. Open the one that fits with the Skill tool before relying on this result.`)
  }
  return { text: parts.length ? `\n\n${parts.join('\n\n')}` : '', attached }
}
