// agents/<name>/notifier.yml — where an agent's "ask" approvals and
// questions go when nobody is watching a live chat, set from the console
// (Permissions → "Where approval requests and questions are sent") instead of in code. Only consulted when the
// agent's own AgentConfig.httpNotifier is unset; code always wins.
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

export function notifierFilePath(dir: string): string {
  return join(dir, 'notifier.yml')
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

/** undefined when the agent has no notifier.yml. */
export function readNotifierFile(dir: string): NotifierFile | undefined {
  const path = notifierFilePath(dir)
  if (!existsSync(path)) return undefined
  return validateNotifierFile(parseYaml(readFileSync(path, 'utf8')))
}

export function writeNotifierFile(dir: string, input: unknown): NotifierFile {
  const file = validateNotifierFile(input)
  const header =
    '# Where this agent sends approval requests and questions when it is called over HTTP.\n' +
    `# Edited from the console (Permissions tab). The secret lives in this agent's env as ${NOTIFIER_SECRET_VARS[file.channel]}.\n`
  writeFileSync(notifierFilePath(dir), header + stringifyYaml(file))
  return file
}

export function removeNotifierFile(dir: string): void {
  rmSync(notifierFilePath(dir), { force: true })
}

/** The HttpNotifierConfig a notifier.yml describes, with its secret read
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
          config: { botToken: secret, channelId: file.channelId!, publicUrl: file.publicUrl, buttons: Boolean(env.get(NOTIFIER_SLACK_SIGNING_SECRET_VAR)) },
          events: file.events,
        },
      }
    case 'lark':
      // No card buttons: nothing built in handles Lark's card callbacks yet,
      // so a console-configured Lark notifier relies on the decision link.
      return { config: { channel: 'lark', config: { appId: file.appId!, appSecret: secret, chatId: file.chatId!, publicUrl: file.publicUrl, buttons: false }, events: file.events } }
  }
}
