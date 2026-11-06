// Backs the console's Messaging tab: where an agent's durable
// approvals/questions go (core/http-notifier.ts's describeNotifier plus
// the deployment-wide default webhook), whether it answers replies there,
// editing its agents/<name>/messaging.yml, a test send and recent
// deliveries — and the decisions still waiting, shown in Permissions. Plain functions over loopengine's own modules
// so adapters/http.ts (and the scaffolded copy create-loopengine ships)
// only needs thin route handlers.
import { randomBytes } from 'node:crypto'
import type { AgentConfig } from '../core/agent-config.js'
import { agentDirFor, createAgentEnv } from '../core/agent-env.js'
import type { CheckpointStore } from '../core/durable-approvals.js'
import { decidePath } from '../core/approval-links.js'
import { describeNotifier } from '../core/http-notifier.js'
import { sendTestSlackMessage } from '../core/http-notify-triggers/slack.js'
import { postLifecycleWebhook, sendTestWebhook, type DeliveryResult } from '../core/http-notify-triggers/webhook.js'
import { SlackNotifier } from '../core/http-notify-triggers/slack.js'
import { LarkNotifier } from '../core/http-notify-triggers/lark.js'
import { TelegramNotifier, sendTestTelegramMessage } from '../core/http-notify-triggers/telegram.js'
import type { HttpNotifierConfig } from '../core/agent-config.js'
import { listDeliveries } from '../core/notifier-deliveries.js'
import { NOTIFIER_CHANNELS, NOTIFIER_SECRET_VARS, PRIMARY_CHANNELS, NOTIFIER_SLACK_SIGNING_SECRET_VAR, NOTIFIER_TELEGRAM_WEBHOOK_SECRET_VAR, NotifierFileError, notifierConfigFromFile, readActiveConnections, readMessagingConnections, readNotifierFile, removeMessagingConnection, removeNotifierFile, setPrimaryConnection, writeNotifierFile, type MessagingApprover, type MessagingConnections, type NotifierFile, type NotifierFileChannel } from '../core/notifier-file.js'
import { listSlackChannelMembers, listSlackChannels, slackAppManifest, type SlackChannel, type SlackMember } from '../core/messaging/connectors/slack/index.js'
import { telegramBotUsername, telegramPeople, setTelegramWebhook, telegramWebhookInfo, type TelegramPerson } from '../core/messaging/connectors/telegram/index.js'
import { setAgentEnvVar } from './env-admin.js'

/** The deployment-wide default webhook (LOOPENGINE_DEFAULT_WEBHOOK_URL /
 * _SECRET), which applies to the plain /messages route when an agent has
 * no notifier of its own. */
export interface DefaultWebhook {
  webhookUrl: string
  webhookSecret: string
}

export function describeAgentNotifier(config: AgentConfig, defaultWebhook?: DefaultWebhook) {
  const described = describeNotifier(config)
  const env = createAgentEnv(config.name, agentDirFor(config))
  const secretsSet = Object.fromEntries(
    (Object.keys(NOTIFIER_SECRET_VARS) as NotifierFileChannel[]).map((channel) => [channel, env.get(NOTIFIER_SECRET_VARS[channel]) !== undefined]),
  )
  const source = described.source === 'none' && defaultWebhook ? 'default' : described.source
  // Every saved connection, one per app, for the tab's section for each;
  // only `primary` is used. An unreadable file shows as none here (the
  // error itself comes through `described`).
  let saved: MessagingConnections = { connections: [] }
  try {
    saved = readMessagingConnections(agentDirFor(config))
  } catch {}
  return {
    ...described,
    source,
    channels: NOTIFIER_CHANNELS,
    // Only these take turns as primary; a webhook always sends.
    primaryChannels: PRIMARY_CHANNELS,
    connections: saved.connections,
    primary: saved.primary ?? null,
    defaultWebhookUrl: defaultWebhook?.webhookUrl ?? null,
    publicUrl: process.env.LOOPENGINE_PUBLIC_URL ?? null,
    // LOOPENGINE_PLAN ('free' on LoopEngine Cloud's free plan): the
    // console locks Conversations on free. null when self-hosted.
    plan: process.env.LOOPENGINE_PLAN ?? null,
    secretVars: NOTIFIER_SECRET_VARS,
    secretsSet,
    slack: {
      signingSecretVar: NOTIFIER_SLACK_SIGNING_SECRET_VAR,
      signingSecretSet: env.get(NOTIFIER_SLACK_SIGNING_SECRET_VAR) !== undefined,
      // Where the Slack app's Interactivity Request URL should point.
      interactivityPath: `/hooks/slack/${encodeURIComponent(config.name)}`,
      // Where replies in a request's thread arrive (core/messaging/).
      eventsPath: `/hooks/slack/${encodeURIComponent(config.name)}/events`,
      // The console swaps __INTERACTIVITY_URL__ for the link address +
      // interactivityPath as you type.
      manifestTemplate: slackAppManifest({ agentName: config.name, interactivityUrl: '__INTERACTIVITY_URL__' }),
    },
    telegram: {
      // Set once the bot's webhook points here (setupAgentTelegramWebhook).
      webhookSet: env.get(NOTIFIER_TELEGRAM_WEBHOOK_SECRET_VAR) !== undefined,
      webhookPath: `/hooks/telegram/${encodeURIComponent(config.name)}`,
    },
    deliveries: listDeliveries(config.name),
  }
}

/** The agent's saved connection for one app, primary or not. */
function savedConnection(config: AgentConfig, channel: NotifierFileChannel): NotifierFile | undefined {
  try {
    return readMessagingConnections(agentDirFor(config)).connections.find((c) => c.channel === channel)
  } catch {
    return undefined
  }
}

/** Saves one app's connection in agents/<name>/messaging.yml from its
 * section of the Messaging tab (the first one saved becomes primary;
 * `primary: true` in the body makes this one primary) and, when the form
 * includes one, its secret into the agent's own env. Throws
 * NotifierFileError for an invalid form. */
export async function saveAgentNotifier(config: AgentConfig, body: Record<string, unknown>): Promise<void> {
  // The form doesn't carry the approvers (they have their own section),
  // so saving it keeps them.
  const existing = typeof body.channel === 'string' ? savedConnection(config, body.channel as NotifierFileChannel) : undefined
  if (existing?.approvers && body.approvers === undefined) body = { ...body, approvers: existing.approvers }
  const file = writeNotifierFile(agentDirFor(config), body, { makePrimary: body.primary === true })
  if (typeof body.secret === 'string' && body.secret.trim()) {
    await setAgentEnvVar(config.name, NOTIFIER_SECRET_VARS[file.channel], body.secret.trim())
  }
  if (file.channel === 'slack' && typeof body.signingSecret === 'string' && body.signingSecret.trim()) {
    await setAgentEnvVar(config.name, NOTIFIER_SLACK_SIGNING_SECRET_VAR, body.signingSecret.trim())
  }
}

/** The bot token and signing secret behind an agent's Slack notifier —
 * from AgentConfig.httpNotifier when it's Slack, else from the agent's
 * env (the console-saved ones). The signing secret always comes from the
 * agent env. */
export function slackCredentialsFor(config: AgentConfig): { botToken?: string; signingSecret?: string } {
  const env = createAgentEnv(config.name, agentDirFor(config))
  const botToken = config.httpNotifier?.channel === 'slack' ? config.httpNotifier.config.botToken : env.get(NOTIFIER_SECRET_VARS.slack)
  return { botToken, signingSecret: env.get(NOTIFIER_SLACK_SIGNING_SECRET_VAR) }
}

/** The apps people can talk to an agent in (core/messaging/). */
export type TwoWayApp = 'slack' | 'telegram'

const APP_NAMES: Record<TwoWayApp, string> = { slack: 'Slack', telegram: 'Telegram' }

/** Whether replies in an app's request threads are answered: on unless
 * that app's section of the Messaging tab turned Conversations off. An
 * agent whose notifier is set in code answers in that app only. */
export function conversationsOn(config: AgentConfig, app: TwoWayApp): boolean {
  if (config.httpNotifier) return config.httpNotifier.channel === app
  const file = savedConnection(config, app)
  return Boolean(file) && file!.conversations !== false
}

export function slackConversationsOn(config: AgentConfig): boolean {
  return conversationsOn(config, 'slack')
}

/** Whether a DM to the agent's bot in `app`, or a mention of it, starts a
 * job (core/messaging/jobs.ts). Off unless turned on in that app's
 * section; never for a notifier set in code. */
export function jobsOn(config: AgentConfig, app: TwoWayApp): boolean {
  if (config.httpNotifier) return false
  return savedConnection(config, app)?.jobs === true
}

/** The people who can decide this agent's requests from `app`: from that
 * app's connection in messaging.yml; none when the notifier is set in
 * code. */
export function agentApprovers(config: AgentConfig, app: TwoWayApp = 'slack'): MessagingApprover[] {
  if (config.httpNotifier) return []
  return savedConnection(config, app)?.approvers ?? []
}

function approverList(app: TwoWayApp, approvers: MessagingApprover[]): string {
  return approvers.map((a) => (app === 'slack' ? `<@${a.user}>` : a.name ?? a.user)).join(', ')
}

/** Whether a person's button click counts: anyone's does while the
 * agent has no approvers in that app (as before approvers existed), only
 * theirs once it has some. `message` says who can, for a refused click. */
export function clickAllowed(config: AgentConfig, app: TwoWayApp, user: string | undefined): { allowed: boolean; message?: string } {
  const approvers = agentApprovers(config, app)
  if (!approvers.length || (user && approvers.some((a) => a.user === user))) return { allowed: true }
  return { allowed: false, message: `Only approvers can decide this: ${approverList(app, approvers)}.` }
}

export function slackClickAllowed(config: AgentConfig, user: string | undefined): { allowed: boolean; message?: string } {
  return clickAllowed(config, 'slack', user)
}

/** Whether a person may start a job from a message, or continue one: an
 * approver, once the app has any; with none, anyone in the agent's own
 * channel or chat, but nobody by DM. */
export function jobAllowed(config: AgentConfig, app: TwoWayApp, message: { user: string; conversation: string; direct?: boolean }): { allowed: boolean; message?: string } {
  const approvers = agentApprovers(config, app)
  if (approvers.length) {
    if (approvers.some((a) => a.user === message.user)) return { allowed: true }
    return { allowed: false, message: `Only approvers can give me jobs here: ${approverList(app, approvers)}.` }
  }
  const file = savedConnection(config, app)
  const home = app === 'slack' ? file?.channelId : file?.chatId
  if (!message.direct && home && home === message.conversation) return { allowed: true }
  return { allowed: false, message: `Jobs by direct message need approvers: in LoopEngine, open this agent's Messaging tab, then ${APP_NAMES[app]} → Approvers, and add yourself.` }
}

/** Replaces the approver list on the agent's saved connection for `app`,
 * primary or not. Throws NotifierFileError when there's no connection
 * for that app to add them to. */
export function setAgentApprovers(config: AgentConfig, approvers: unknown, app: TwoWayApp = 'slack'): MessagingApprover[] {
  const file = savedConnection(config, app)
  if (!file) throw new NotifierFileError(`Save a ${APP_NAMES[app]} connection first`)
  return writeNotifierFile(agentDirFor(config), { ...file, approvers: Array.isArray(approvers) ? approvers : [] }).approvers ?? []
}

/** The bot token behind an agent's Telegram notifier and the secret its
 * webhook was set up with, like slackCredentialsFor. */
export function telegramCredentialsFor(config: AgentConfig): { botToken?: string; webhookSecret?: string } {
  const env = createAgentEnv(config.name, agentDirFor(config))
  const botToken = config.httpNotifier?.channel === 'telegram' ? config.httpNotifier.config.botToken : env.get(NOTIFIER_SECRET_VARS.telegram)
  return { botToken, webhookSecret: env.get(NOTIFIER_TELEGRAM_WEBHOOK_SECRET_VAR) }
}

/** The address remembered for links when the app's connection was saved. */
export function connectionPublicUrl(config: AgentConfig, app: TwoWayApp): string | undefined {
  return savedConnection(config, app)?.publicUrl
}

/** The Telegram chat the agent posts requests in, if any. */
export function telegramHomeChat(config: AgentConfig): string | undefined {
  return config.httpNotifier?.channel === 'telegram' ? config.httpNotifier.config.chatId : savedConnection(config, 'telegram')?.chatId
}

/** People who have written to the agent's Telegram bot, newest first,
 * for picking approvers: the Bot API can't list a chat's members. */
export function listAgentTelegramPeople(config: AgentConfig): TelegramPerson[] {
  return telegramPeople(agentDirFor(config))
}

/** Points the agent's Telegram bot at POST /hooks/telegram/<agent> on
 * `baseUrl` (LOOPENGINE_PUBLIC_URL wins), with a secret made once and
 * kept in the agent's env. From then on requests get buttons and replies
 * reach the agent. */
export async function setupAgentTelegramWebhook(config: AgentConfig, baseUrl: string): Promise<{ url: string; botUsername?: string }> {
  const { botToken, webhookSecret } = telegramCredentialsFor(config)
  if (!botToken) throw new Error('Save the Telegram bot token first')
  const base = (process.env.LOOPENGINE_PUBLIC_URL || baseUrl).replace(/\/+$/, '')
  if (!/^https:\/\//.test(base)) throw new Error('Telegram only sends updates to an https address; set LOOPENGINE_PUBLIC_URL to this server\'s https address')
  const secret = webhookSecret ?? randomBytes(24).toString('hex')
  const url = `${base}/hooks/telegram/${encodeURIComponent(config.name)}`
  const set = await setTelegramWebhook(botToken, url, secret)
  if (!set.ok) throw new Error(set.error)
  if (!webhookSecret) await setAgentEnvVar(config.name, NOTIFIER_TELEGRAM_WEBHOOK_SECRET_VAR, secret)
  return { url, ...(set.botUsername ? { botUsername: set.botUsername } : {}) }
}

/** Where the agent's Telegram bot sends its updates now. */
export async function agentTelegramWebhookInfo(config: AgentConfig): Promise<{ url?: string; lastError?: string; lastErrorAt?: string; pending?: number; pointsHere: boolean; botUsername?: string }> {
  const { botToken } = telegramCredentialsFor(config)
  if (!botToken) throw new Error('Save the Telegram bot token first')
  const info = await telegramWebhookInfo(botToken)
  if (!info.ok) throw new Error(info.error)
  const botUsername = await telegramBotUsername(botToken)
  return {
    ...(info.url ? { url: info.url } : {}),
    ...(info.lastError ? { lastError: info.lastError } : {}),
    ...(info.lastErrorAt ? { lastErrorAt: info.lastErrorAt } : {}),
    ...(info.pending ? { pending: info.pending } : {}),
    pointsHere: Boolean(info.url?.endsWith(`/hooks/telegram/${encodeURIComponent(config.name)}`)),
    ...(botUsername ? { botUsername } : {}),
  }
}

/** The people in the agent's Slack channel, for picking approvers. */
export async function listAgentSlackMembers(config: AgentConfig): Promise<SlackMember[]> {
  const { botToken } = slackCredentialsFor(config)
  const channelId = config.httpNotifier?.channel === 'slack' ? config.httpNotifier.config.channelId : savedConnection(config, 'slack')?.channelId
  if (!botToken || !channelId) throw new Error('Save the Slack bot token and channel first')
  return listSlackChannelMembers(botToken, channelId)
}

/** Channels for the console's picker, with the token being typed in or,
 * when none is given, the one already saved. */
export async function listAgentSlackChannels(config: AgentConfig, botToken?: string): Promise<SlackChannel[]> {
  const token = botToken?.trim() || slackCredentialsFor(config).botToken
  if (!token) throw new Error('Enter the bot token first')
  return listSlackChannels(token)
}

/** Removes one app's connection, or every connection when no app is
 * named. Removing the primary leaves none primary. Stored secrets are
 * left alone, so setting an app up again doesn't need them re-entered. */
export function removeAgentNotifier(config: AgentConfig, channel?: string): void {
  if (channel) removeMessagingConnection(agentDirFor(config), channel)
  else removeNotifierFile(agentDirFor(config))
}

/** Makes one saved connection the one in use. Throws NotifierFileError
 * when that app isn't set up. */
export function setAgentPrimaryNotifier(config: AgentConfig, channel: unknown): void {
  if (typeof channel !== 'string' || !NOTIFIER_CHANNELS.includes(channel as NotifierFileChannel)) {
    throw new NotifierFileError(`channel must be one of: ${NOTIFIER_CHANNELS.join(', ')}`)
  }
  setPrimaryConnection(agentDirFor(config), channel)
}

/** The notifiers that apply to an agent: its code httpNotifier; else its
 * messaging.yml's webhook and primary messaging app (each once its
 * secret is set); else the deployment-wide default webhook. */
function activeNotifierTargets(config: AgentConfig, defaultWebhook?: DefaultWebhook): HttpNotifierConfig[] {
  if (config.httpNotifier) return [config.httpNotifier]
  const dir = agentDirFor(config)
  const env = createAgentEnv(config.name, dir)
  const fromFile = readActiveConnections(dir).flatMap((file) => notifierConfigFromFile(file, env, config.name).config ?? [])
  if (fromFile.length) return fromFile
  return defaultWebhook ? [{ channel: 'webhook', config: { webhookUrl: defaultWebhook.webhookUrl, webhookSecret: defaultWebhook.webhookSecret }, events: ['run_finish'] }] : []
}

/** Posts a plain announcement through the agent's notifiers (the webhook
 * and the primary messaging app) — a scheduled task's result, for one —
 * regardless of which events they subscribed to. A webhook gets a signed
 * `run_finish` payload with `data` merged in; the apps get `text`.
 * Returns whether any notifier took it. */
export function announceToNotifier(config: AgentConfig, text: string, data: Record<string, unknown>, defaultWebhook?: DefaultWebhook): boolean {
  let targets: HttpNotifierConfig[]
  try {
    targets = activeNotifierTargets(config, defaultWebhook)
  } catch {
    return false
  }
  let sent = false
  for (const target of targets) {
    switch (target.channel) {
      case 'webhook':
        postLifecycleWebhook(target.config.webhookUrl, target.config.webhookSecret, 'run_finish', { agent: config.name, text, ...data })
        sent = true
        break
      case 'slack':
        new SlackNotifier({ botToken: target.config.botToken, channelId: target.config.channelId }).postMessage(text)
        sent = true
        break
      case 'lark':
        new LarkNotifier({ appId: target.config.appId, appSecret: target.config.appSecret, chatId: target.config.chatId }).postMessage(text)
        sent = true
        break
      case 'telegram':
        new TelegramNotifier({ botToken: target.config.botToken, chatId: target.config.chatId }).postMessage(text)
        sent = true
        break
    }
  }
  return sent
}

/** Sends a test through one app's saved connection when `channel` is
 * given (primary or not, so it can be tried before it's made primary),
 * else through whichever notifier applies to this agent; reports what
 * the receiver answered. */
export async function testAgentNotifier(config: AgentConfig, defaultWebhook?: DefaultWebhook, channel?: string): Promise<DeliveryResult & { channel?: string }> {
  let target = channel ? undefined : config.httpNotifier
  if (channel && !savedConnection(config, channel as NotifierFileChannel)) return { ok: false, channel, error: `Save the ${channel} connection first` }
  if (!target) {
    const dir = agentDirFor(config)
    const file = channel ? savedConnection(config, channel as NotifierFileChannel) : readNotifierFile(dir)
    if (file) {
      const { config: fromFile, missingSecret } = notifierConfigFromFile(file, createAgentEnv(config.name, dir), config.name)
      if (!fromFile) return { ok: false, channel: file.channel, error: `${missingSecret} is not set for this agent` }
      target = fromFile
    }
  }
  if (!target && defaultWebhook) {
    return { channel: 'webhook', ...(await sendTestWebhook(defaultWebhook.webhookUrl, defaultWebhook.webhookSecret, config.name)) }
  }
  if (!target) return { ok: false, error: 'This agent has no notifier set up' }
  if (target.channel === 'webhook') {
    return { channel: 'webhook', ...(await sendTestWebhook(target.config.webhookUrl, target.config.webhookSecret, config.name)) }
  }
  if (target.channel === 'slack') {
    return { channel: 'slack', ...(await sendTestSlackMessage(target.config.botToken, target.config.channelId, `Test from LoopEngine: approvals for ${config.name} will be posted here.`)) }
  }
  if (target.channel === 'telegram') {
    return { channel: 'telegram', ...(await sendTestTelegramMessage(target.config.botToken, target.config.chatId, `Test from LoopEngine: approvals for ${config.name} will be posted here.`)) }
  }
  if (target.channel === 'email') {
    try {
      await target.config.sendEmail(
        target.config.to,
        `Test from LoopEngine: ${config.name}`,
        `<p>This is a test. Approval requests and questions from <b>${config.name}</b> will be emailed here, each with a link to approve, deny or answer.</p>`,
        { kind: 'test' },
      )
      return { channel: 'email', ok: true }
    } catch (err) {
      return { channel: 'email', ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  }
  return { ok: false, channel: target.channel, error: `Send test isn't supported for ${target.channel} yet` }
}

/** Every decision still waiting for this agent, oldest first, each with
 * where to send the answer. */
export async function listAgentPending(store: CheckpointStore, agentName: string) {
  const open = await store.listOpen()
  const pending = []
  for (const checkpoint of open) {
    if (checkpoint.agent !== agentName) continue
    for (const [pendingId, item] of Object.entries(checkpoint.outstanding)) {
      const kind = item.kind ?? 'approval'
      pending.push({
        pendingId,
        kind,
        tool: item.tool,
        args: item.args,
        reason: item.reason,
        sessionId: checkpoint.sessionId,
        tenant: checkpoint.tenant,
        createdAt: checkpoint.createdAt ?? null,
        ...(kind === 'question' ? { answerPath: `/pending-questions/${pendingId}/answer` } : { resolvePath: `/pending-approvals/${pendingId}/resolve` }),
        // A signed link anyone can open to decide (core/approval-links.ts).
        decidePath: decidePath(pendingId, kind),
      })
    }
  }
  return pending
}
