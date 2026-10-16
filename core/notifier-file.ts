// agents/<name>/messaging.yml — where an agent's "ask" approvals and
// questions go when nobody is watching a live chat, and whether it
// answers replies there, set from the console's Messaging tab instead of
// in code. Only consulted when the agent's own AgentConfig.httpNotifier
// is unset; code always wins.
//
// The file holds a list of connections, though only the first is used
// for now:
//
//   connections:
//     - app: slack
//       channelId: C0123456
//       events: [approval, question]
//       conversations: true
//
// An older agents/<name>/notifier.yml (one connection, `channel:` for
// `app:`) is still read; saving from the console replaces it with
// messaging.yml.
//
// The file holds only non-secret settings. The one secret each channel
// needs (a webhook signing secret, a Slack bot token, a Lark app secret)
// lives in the agent's own env (agents/<name>/.env by default, through
// core/secret-store.ts) under a fixed name, so it's never written into a
// file that might get committed.
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'
import type { AgentEnv, HttpNotifierConfig, HttpNotifierEvent } from '#core/agent-config.js'

export type NotifierFileChannel = 'webhook' | 'slack' | 'lark'

export interface NotifierFile {
  channel: NotifierFileChannel
  events: HttpNotifierEvent[]
  /** webhook: where to POST. */
  url?: string
  /** slack: channel to post into. */
  channelId?: string
  /** lark: app id and chat to post into. */
  appId?: string
  chatId?: string
  /** Where this server is reachable, for the links in each message —
   * remembered from the console's own address when saving.
   * LOOPENGINE_PUBLIC_URL, when set, wins over it. */
  publicUrl?: string
  /** slack: answer replies in a request's thread (core/messaging/).
   * Unset counts as on. */
  conversations?: boolean
  /** slack: the people who can decide a request by replying in its
   * thread, and whose button clicks count once any are listed. */
  approvers?: MessagingApprover[]
  /** slack: tools whose approval by reply needs a Confirm click. */
  confirmTools?: string[]
}

export interface MessagingApprover {
  /** The app's id for the person (Slack: U0123ABC). */
  user: string
  /** Their name when they were added, for the console. */
  name?: string
}

/** The env var each channel's secret is read from, per agent. */
export const NOTIFIER_SECRET_VARS: Record<NotifierFileChannel, string> = {
  webhook: 'LOOPENGINE_NOTIFIER_WEBHOOK_SECRET',
  slack: 'LOOPENGINE_NOTIFIER_SLACK_BOT_TOKEN',
  lark: 'LOOPENGINE_NOTIFIER_LARK_APP_SECRET',
}

/** Optional: a Slack app's signing secret, per agent. Set, it turns on
 * Approve/Deny buttons in Slack, handled by the server itself at
 * POST /hooks/slack/<agent>; unset, messages carry only the decision link. */
export const NOTIFIER_SLACK_SIGNING_SECRET_VAR = 'LOOPENGINE_NOTIFIER_SLACK_SIGNING_SECRET'

const CHANNELS: NotifierFileChannel[] = ['webhook', 'slack', 'lark']
const EVENTS: HttpNotifierEvent[] = ['approval', 'question', 'run_start', 'run_finish']

export class NotifierFileError extends Error {}

/** The older single-connection file, still read when messaging.yml is absent. */
export function notifierFilePath(dir: string): string {
  return join(dir, 'notifier.yml')
}

export function messagingFilePath(dir: string): string {
  return join(dir, 'messaging.yml')
}

/** Throws NotifierFileError naming the first problem. */
export function validateNotifierFile(input: unknown): NotifierFile {
  if (!input || typeof input !== 'object') throw new NotifierFileError('notifier settings must be an object')
  const raw = input as Record<string, unknown>
  const channel = raw.channel as NotifierFileChannel
  if (!CHANNELS.includes(channel)) throw new NotifierFileError(`channel must be one of: ${CHANNELS.join(', ')}`)
  const events = Array.isArray(raw.events) ? (raw.events as unknown[]) : []
  if (!events.length || events.some((e) => !EVENTS.includes(e as HttpNotifierEvent))) {
    throw new NotifierFileError(`events must be a non-empty list of: ${EVENTS.join(', ')}`)
  }
  const str = (key: string): string | undefined => (typeof raw[key] === 'string' && (raw[key] as string).trim() ? (raw[key] as string).trim() : undefined)
  const file: NotifierFile = { channel, events: events as HttpNotifierEvent[] }
  if (raw.conversations !== undefined) {
    if (typeof raw.conversations !== 'boolean') throw new NotifierFileError('conversations must be true or false')
    if (channel === 'slack') file.conversations = raw.conversations
  }
  if (raw.approvers !== undefined && channel === 'slack') {
    if (!Array.isArray(raw.approvers)) throw new NotifierFileError('approvers must be a list')
    const approvers: MessagingApprover[] = []
    for (const a of raw.approvers as unknown[]) {
      const entry = a as { user?: unknown; name?: unknown } | null
      if (!entry || typeof entry.user !== 'string' || !/^[A-Z0-9]{2,32}$/.test(entry.user)) throw new NotifierFileError('each approver needs a Slack user id, like U0123ABC')
      if (approvers.some((x) => x.user === entry.user)) continue
      approvers.push({ user: entry.user, ...(typeof entry.name === 'string' && entry.name.trim() ? { name: entry.name.trim().slice(0, 80) } : {}) })
    }
    if (approvers.length) file.approvers = approvers
  }
  if (raw.confirmTools !== undefined && channel === 'slack') {
    if (!Array.isArray(raw.confirmTools) || raw.confirmTools.some((t) => typeof t !== 'string' || !t.trim())) throw new NotifierFileError('confirmTools must be a list of tool names')
    const tools = [...new Set((raw.confirmTools as string[]).map((t) => t.trim()))]
    if (tools.length) file.confirmTools = tools
  }
  const publicUrl = str('publicUrl')
  if (publicUrl) {
    if (!/^https?:\/\/[^/]+/.test(publicUrl)) throw new NotifierFileError('publicUrl must be an http(s) URL')
    file.publicUrl = publicUrl.replace(/\/+$/, '')
  }
  if (channel === 'webhook') {
    const url = str('url')
    if (!url || !/^https?:\/\//.test(url)) throw new NotifierFileError('url must be an http(s) URL')
    file.url = url
  } else if (channel === 'slack') {
    const channelId = str('channelId')
    if (!channelId) throw new NotifierFileError('channelId is required for slack')
    file.channelId = channelId
  } else {
    const appId = str('appId')
    const chatId = str('chatId')
    if (!appId || !chatId) throw new NotifierFileError('appId and chatId are required for lark')
    file.appId = appId
    file.chatId = chatId
  }
  return file
}

/** The agent's connection: messaging.yml's first, else the older
 * notifier.yml's; undefined when it has neither. */
export function readNotifierFile(dir: string): NotifierFile | undefined {
  const messagingPath = messagingFilePath(dir)
  if (existsSync(messagingPath)) {
    const parsed = parseYaml(readFileSync(messagingPath, 'utf8')) as { connections?: unknown } | null
    if (parsed?.connections !== undefined && !Array.isArray(parsed.connections)) throw new NotifierFileError('connections must be a list')
    const first = (parsed?.connections as unknown[] | undefined)?.[0]
    if (first === undefined) return undefined
    if (!first || typeof first !== 'object') throw new NotifierFileError('each connection must be an object')
    const { app, ...rest } = first as Record<string, unknown>
    return validateNotifierFile({ channel: app, ...rest })
  }
  const path = notifierFilePath(dir)
  if (!existsSync(path)) return undefined
  return validateNotifierFile(parseYaml(readFileSync(path, 'utf8')))
}

/** Writes messaging.yml (and drops an older notifier.yml it replaces). */
export function writeNotifierFile(dir: string, input: unknown): NotifierFile {
  const file = validateNotifierFile(input)
  const { channel, ...rest } = file
  const header =
    '# Where this agent sends approval requests and questions when it is called over HTTP,\n' +
    '# and whether it answers replies there. Edited from the console (Messaging tab).\n' +
    `# The secret lives in this agent's env as ${NOTIFIER_SECRET_VARS[channel]}.\n`
  writeFileSync(messagingFilePath(dir), header + stringifyYaml({ connections: [{ app: channel, ...rest }] }))
  rmSync(notifierFilePath(dir), { force: true })
  return file
}

export function removeNotifierFile(dir: string): void {
  rmSync(messagingFilePath(dir), { force: true })
  rmSync(notifierFilePath(dir), { force: true })
}

/** The HttpNotifierConfig a connection describes, with its secret read
 * from `env` — or which secret is missing, so nothing is sent unsigned
 * or unauthenticated. */
export function notifierConfigFromFile(file: NotifierFile, env: AgentEnv): { config?: HttpNotifierConfig; missingSecret?: string } {
  const secretVar = NOTIFIER_SECRET_VARS[file.channel]
  const secret = env.get(secretVar)
  if (!secret) return { missingSecret: secretVar }
  switch (file.channel) {
    case 'webhook':
      return { config: { channel: 'webhook', config: { webhookUrl: file.url!, webhookSecret: secret, publicUrl: file.publicUrl }, events: file.events } }
    case 'slack':
      // Buttons only once the agent has a signing secret, i.e. the Slack
      // app's interactivity points at /hooks/slack/<agent>; otherwise the
      // decision link does the job.
      return {
        config: {
          channel: 'slack',
          config: {
            botToken: secret,
            channelId: file.channelId!,
            publicUrl: file.publicUrl,
            buttons: Boolean(env.get(NOTIFIER_SLACK_SIGNING_SECRET_VAR)),
            // Says replies in the thread are answered, when they are.
            replyHint: Boolean(env.get(NOTIFIER_SLACK_SIGNING_SECRET_VAR)) && file.conversations !== false && process.env.LOOPENGINE_PLAN !== 'free',
          },
          events: file.events,
        },
      }
    case 'lark':
      // No card buttons: nothing built in handles Lark's card callbacks yet,
      // so a console-configured Lark notifier relies on the decision link.
      return { config: { channel: 'lark', config: { appId: file.appId!, appSecret: secret, chatId: file.chatId!, publicUrl: file.publicUrl, buttons: false }, events: file.events } }
  }
}
