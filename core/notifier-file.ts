// agents/<name>/messaging.yml — where an agent's "ask" approvals and
// questions go when nobody is watching a live chat, and whether it
// answers replies there, set from the console's Messaging tab instead of
// in code. Only consulted when the agent's own AgentConfig.httpNotifier
// is unset; code always wins.
//
// The file holds at most one connection per app, set up independently
// from the tab's own section for each. A webhook always sends once it's
// set up. Of the messaging apps (Telegram, Slack, Lark, email), only the
// primary one does: requests, announcements and Slack's replies go
// through it, and the others stay saved but idle until made primary. So
// a request can go to the webhook and the primary app both, under one
// request id.
//
//   primary: slack
//   connections:
//     - app: slack
//       channelId: C0123456
//       events: [approval, question]
//       conversations: true
//     - app: telegram
//       chatId: "-1001234567890"
//       events: [approval, question]
//
// A file without `primary:` (written before there was one) uses its
// first messaging app; `primary:` left empty means none is. An older
// agents/<name>/notifier.yml (one connection, `channel:` for `app:`) is
// still read; saving from the console replaces it with messaging.yml.
//
// The file holds only non-secret settings. The one secret each channel
// needs (a webhook signing secret, a Slack or Telegram bot token, a Lark app secret, an email provider's API key)
// lives in the agent's own env (agents/<name>/.env by default, through
// core/secret-store.ts) under a fixed name, so it's never written into a
// file that might get committed.
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'
import type { AgentEnv, HttpNotifierConfig, HttpNotifierEvent } from '#core/agent-config.js'
import { EMAIL_PROVIDERS, createProviderSendEmail, parseAddress, parseRecipients, type EmailProvider } from '#core/email-senders.js'

export type NotifierFileChannel = 'webhook' | 'telegram' | 'slack' | 'lark' | 'email'

export interface NotifierFile {
  channel: NotifierFileChannel
  events: HttpNotifierEvent[]
  /** webhook: where to POST. */
  url?: string
  /** slack: channel to post into. */
  channelId?: string
  /** lark: app id and chat to post into. telegram: the chat to post
   * into (a numeric id like -1001234567890, or @channelname). */
  appId?: string
  chatId?: string
  /** email: who receives requests (comma-separated), who they come from
   * ("LoopEngine <approvals@example.com>"), and the provider that sends
   * them. */
  to?: string
  from?: string
  provider?: EmailProvider
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
  telegram: 'LOOPENGINE_NOTIFIER_TELEGRAM_BOT_TOKEN',
  slack: 'LOOPENGINE_NOTIFIER_SLACK_BOT_TOKEN',
  lark: 'LOOPENGINE_NOTIFIER_LARK_APP_SECRET',
  email: 'LOOPENGINE_NOTIFIER_EMAIL_API_KEY',
}

/** Optional: a Slack app's signing secret, per agent. Set, it turns on
 * Approve/Deny buttons in Slack, handled by the server itself at
 * POST /hooks/slack/<agent>; unset, messages carry only the decision link. */
export const NOTIFIER_SLACK_SIGNING_SECRET_VAR = 'LOOPENGINE_NOTIFIER_SLACK_SIGNING_SECRET'

/** In the order the Messaging tab lists them: the messaging apps, then
 * the webhook. */
export const NOTIFIER_CHANNELS: NotifierFileChannel[] = ['slack', 'telegram', 'lark', 'email', 'webhook']

/** The apps that take turns as primary. The webhook isn't one: it always
 * sends once set up. */
export const PRIMARY_CHANNELS: NotifierFileChannel[] = ['telegram', 'slack', 'lark', 'email']
const canBePrimary = (channel: unknown): boolean => PRIMARY_CHANNELS.includes(channel as NotifierFileChannel)
const CHANNELS = NOTIFIER_CHANNELS
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
  } else if (channel === 'telegram') {
    // Strings even when numeric: YAML would read -1001234567890 as a
    // number, so it's quoted when written and accepted either way.
    const chatId = typeof raw.chatId === 'number' ? String(raw.chatId) : str('chatId')
    if (!chatId || !/^(-?[0-9]{1,20}|@[A-Za-z0-9_]{4,64})$/.test(chatId)) throw new NotifierFileError('chatId must be a Telegram chat id, like -1001234567890, or @channelname')
    file.chatId = chatId
  } else if (channel === 'lark') {
    const appId = str('appId')
    const chatId = str('chatId')
    if (!appId || !chatId) throw new NotifierFileError('appId and chatId are required for lark')
    file.appId = appId
    file.chatId = chatId
  } else {
    const to = str('to')
    const recipients = to ? parseRecipients(to) : undefined
    if (!recipients) throw new NotifierFileError('to must be one or more email addresses, separated by commas')
    const from = str('from')
    if (!from || !parseAddress(from)) throw new NotifierFileError('from must be an email address, like "LoopEngine <approvals@example.com>"')
    const provider = str('provider') as EmailProvider | undefined
    if (!provider || !EMAIL_PROVIDERS.includes(provider)) throw new NotifierFileError(`provider must be one of: ${EMAIL_PROVIDERS.join(', ')}`)
    file.to = recipients.join(', ')
    file.from = from
    file.provider = provider
  }
  return file
}

export interface MessagingConnections {
  /** At most one per app, in the order saved. */
  connections: NotifierFile[]
  /** The messaging app in use, if any (never the webhook). */
  primary?: NotifierFileChannel
}

/** Every saved connection and which messaging app is primary:
 * messaging.yml's, else the older notifier.yml's one connection. */
export function readMessagingConnections(dir: string): MessagingConnections {
  const messagingPath = messagingFilePath(dir)
  if (existsSync(messagingPath)) {
    const parsed = parseYaml(readFileSync(messagingPath, 'utf8')) as { connections?: unknown; primary?: unknown } | null
    if (parsed?.connections !== undefined && !Array.isArray(parsed.connections)) throw new NotifierFileError('connections must be a list')
    const connections: NotifierFile[] = []
    for (const entry of (parsed?.connections as unknown[] | undefined) ?? []) {
      if (!entry || typeof entry !== 'object') throw new NotifierFileError('each connection must be an object')
      const { app, ...rest } = entry as Record<string, unknown>
      const file = validateNotifierFile({ channel: app, ...rest })
      if (!connections.some((c) => c.channel === file.channel)) connections.push(file)
    }
    // No `primary:` at all is a file from before there was one: its first
    // messaging app was the one used, so it still is.
    const hasPrimaryKey = parsed !== null && typeof parsed === 'object' && 'primary' in parsed
    const named = hasPrimaryKey ? parsed!.primary : connections.find((c) => canBePrimary(c.channel))?.channel
    const primary = canBePrimary(named) ? connections.find((c) => c.channel === named)?.channel : undefined
    return primary ? { connections, primary } : { connections }
  }
  const path = notifierFilePath(dir)
  if (!existsSync(path)) return { connections: [] }
  const file = validateNotifierFile(parseYaml(readFileSync(path, 'utf8')))
  return canBePrimary(file.channel) ? { connections: [file], primary: file.channel } : { connections: [file] }
}

/** The connections that send: the webhook when one is set up, then the
 * primary messaging app. */
export function readActiveConnections(dir: string): NotifierFile[] {
  const { connections, primary } = readMessagingConnections(dir)
  const webhook = connections.find((c) => c.channel === 'webhook')
  const app = connections.find((c) => c.channel === primary)
  return [...(webhook ? [webhook] : []), ...(app ? [app] : [])]
}

/** The agent's main connection: the primary messaging app, else the
 * webhook; undefined when neither is set up. It's the one the console
 * reports, and the one Slack's replies and approvers go by. Use
 * readActiveConnections for everything that sends. */
export function readNotifierFile(dir: string): NotifierFile | undefined {
  const { connections, primary } = readMessagingConnections(dir)
  return connections.find((c) => c.channel === primary) ?? connections.find((c) => c.channel === 'webhook')
}

function writeMessagingConnections(dir: string, { connections, primary }: MessagingConnections): void {
  if (!connections.length) {
    removeNotifierFile(dir)
    return
  }
  const header =
    '# Where this agent sends approval requests and questions when it is called over HTTP,\n' +
    '# and whether it answers replies there. Edited from the console (Messaging tab).\n' +
    '# A webhook always sends; of the messaging apps, only the primary one does.\n' +
    '# Each secret lives in this agent\'s env: ' + connections.map((c) => NOTIFIER_SECRET_VARS[c.channel]).join(', ') + '.\n'
  const body = { primary: primary ?? null, connections: connections.map(({ channel, ...rest }) => ({ app: channel, ...rest })) }
  writeFileSync(messagingFilePath(dir), header + stringifyYaml(body))
  rmSync(notifierFilePath(dir), { force: true })
}

/** Saves one app's connection, replacing that app's earlier one and
 * keeping the others. The first messaging app saved becomes primary;
 * `makePrimary` makes this one primary too (a webhook never is: it
 * always sends). Writes messaging.yml (and drops an older notifier.yml
 * it replaces). */
export function writeNotifierFile(dir: string, input: unknown, options: { makePrimary?: boolean } = {}): NotifierFile {
  const file = validateNotifierFile(input)
  const current = readMessagingConnections(dir)
  const index = current.connections.findIndex((c) => c.channel === file.channel)
  const connections = [...current.connections]
  if (index === -1) connections.push(file)
  else connections[index] = file
  const primary = canBePrimary(file.channel) && (options.makePrimary || !current.primary) ? file.channel : current.primary
  writeMessagingConnections(dir, { connections, primary })
  return file
}

/** Makes a saved connection the one in use. */
export function setPrimaryConnection(dir: string, channel: string): void {
  if (!canBePrimary(channel)) throw new NotifierFileError(`Only a messaging app (${PRIMARY_CHANNELS.join(', ')}) can be primary; a webhook always sends once set up`)
  const current = readMessagingConnections(dir)
  if (!current.connections.some((c) => c.channel === channel)) throw new NotifierFileError(`Set up ${channel} before making it primary`)
  writeMessagingConnections(dir, { ...current, primary: channel as NotifierFileChannel })
}

/** Removes one app's connection. Removing the primary leaves no
 * messaging app primary, rather than quietly moving requests to another
 * one. */
export function removeMessagingConnection(dir: string, channel: string): void {
  const current = readMessagingConnections(dir)
  writeMessagingConnections(dir, {
    connections: current.connections.filter((c) => c.channel !== channel),
    primary: current.primary === channel ? undefined : current.primary,
  })
}

/** Removes every connection. */
export function removeNotifierFile(dir: string): void {
  rmSync(messagingFilePath(dir), { force: true })
  rmSync(notifierFilePath(dir), { force: true })
}

/** The HttpNotifierConfig a connection describes, with its secret read
 * from `env` — or which secret is missing, so nothing is sent unsigned
 * or unauthenticated. `agentName` labels email deliveries in the
 * console's list. */
export function notifierConfigFromFile(file: NotifierFile, env: AgentEnv, agentName = ''): { config?: HttpNotifierConfig; missingSecret?: string } {
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
    case 'telegram':
      // Links to the decision page, like Lark without buttons.
      return { config: { channel: 'telegram', config: { botToken: secret, chatId: file.chatId!, publicUrl: file.publicUrl }, events: file.events } }
    case 'email':
      // Links to the decision page, like Lark without buttons; the secret
      // is the provider's API key.
      return {
        config: {
          channel: 'email',
          config: {
            to: file.to!,
            sendEmail: createProviderSendEmail({ provider: file.provider!, apiKey: secret, from: file.from!, agent: agentName }),
            publicUrl: file.publicUrl,
          },
          events: file.events,
        },
      }
  }
}
