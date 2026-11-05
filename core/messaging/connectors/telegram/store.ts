// What Telegram won't tell us later: the Bot API has no way to read a
// chat's history, so the messages in the agent's threads are kept here as
// they pass through, in agents/<name>/.messaging/telegram.jsonl, along
// with the people seen (for names in replies and the approver picker).
//
// Telegram has no threads either. A "thread" here is a chain of replies:
// its first message's id is the thread id, and each later message that
// replies into it (a person's reply, or the agent's) is recorded with
// that root, so a reply to any message in the chain finds its thread.
import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ThreadMessage } from '../../connector.js'

export interface TelegramEntry {
  chat: string
  /** The message's own id. */
  id: string
  /** The first message of its thread (itself when it starts one). */
  root: string
  /** A person's id; unset for the agent's own messages. */
  user?: string
  fromBot: boolean
  text: string
  /** A person's name and @username, when Telegram sent them. */
  name?: string
  username?: string
  at: string
}

// Past this, the file is cut to its newer half on the next write.
const MAX_BYTES = 4 * 1024 * 1024

function storeFile(agentDir: string): string {
  return join(agentDir, '.messaging', 'telegram.jsonl')
}

function readEntries(agentDir: string): TelegramEntry[] {
  const path = storeFile(agentDir)
  if (!existsSync(path)) return []
  const entries: TelegramEntry[] = []
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (!line) continue
    try {
      entries.push(JSON.parse(line) as TelegramEntry)
    } catch {}
  }
  return entries
}

/** Never throws: a message that can't be kept only loses its context. */
export function recordTelegramMessage(agentDir: string, entry: Omit<TelegramEntry, 'at'>): void {
  try {
    mkdirSync(join(agentDir, '.messaging'), { recursive: true })
    const path = storeFile(agentDir)
    if (existsSync(path) && statSync(path).size > MAX_BYTES) {
      const lines = readFileSync(path, 'utf8').split('\n').filter(Boolean)
      writeFileSync(path, lines.slice(Math.floor(lines.length / 2)).join('\n') + '\n')
    }
    appendFileSync(path, JSON.stringify({ ...entry, text: entry.text.slice(0, 4000), at: new Date().toISOString() }) + '\n')
  } catch (err) {
    console.error('[loopengine] could not keep the Telegram message:', err instanceof Error ? err.message : err)
  }
}

/** The thread a message belongs to: its recorded root, else the message
 * itself. */
export function telegramRootOf(agentDir: string, chat: string, id: string): string {
  return readEntries(agentDir).find((e) => e.chat === chat && e.id === id)?.root ?? id
}

/** A thread's messages, oldest first, at most the latest 100. */
export function readTelegramThread(agentDir: string, chat: string, root: string): ThreadMessage[] {
  return readEntries(agentDir)
    .filter((e) => e.chat === chat && e.root === root)
    .slice(-100)
    .map((e) => ({ ...(e.user ? { user: e.user } : {}), fromBot: e.fromBot, text: e.text, ts: e.id }))
}

export interface TelegramPerson {
  id: string
  name: string
  username?: string
}

/** Everyone who has written to the agent, newest first, optionally in
 * one chat only. */
export function telegramPeople(agentDir: string, chat?: string): TelegramPerson[] {
  const people = new Map<string, TelegramPerson>()
  for (const e of readEntries(agentDir).reverse()) {
    if (!e.user || people.has(e.user) || (chat && e.chat !== chat)) continue
    people.set(e.user, { id: e.user, name: e.name || (e.username ? `@${e.username}` : e.user), ...(e.username ? { username: e.username } : {}) })
  }
  return [...people.values()]
}
