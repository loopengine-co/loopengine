// Backs the console's Permissions tab ("Where approval requests and questions are sent"): where an agent's
// durable approvals/questions go (core/http-notifier.ts's describeNotifier
// plus the deployment-wide default webhook), editing its
// agents/<name>/notifier.yml, a test send, recent deliveries, and the
// decisions still waiting. Plain functions over loopengine's own modules
// so adapters/http.ts (and the scaffolded copy create-loopengine ships)
// only needs thin route handlers.
import type { AgentConfig } from '../core/agent-config.js'
import { agentDirFor, createAgentEnv } from '../core/agent-env.js'
import type { CheckpointStore } from '../core/durable-approvals.js'
import { decidePath } from '../core/approval-links.js'
import { describeNotifier } from '../core/http-notifier.js'
import { sendTestSlackMessage } from '../core/http-notify-triggers/slack.js'
import { postLifecycleWebhook, sendTestWebhook, type DeliveryResult } from '../core/http-notify-triggers/webhook.js'
import { SlackNotifier } from '../core/http-notify-triggers/slack.js'
import { LarkNotifier } from '../core/http-notify-triggers/lark.js'
import type { HttpNotifierConfig } from '../core/agent-config.js'
import { listDeliveries } from '../core/notifier-deliveries.js'
import { NOTIFIER_SECRET_VARS, NOTIFIER_SLACK_SIGNING_SECRET_VAR, notifierConfigFromFile, readNotifierFile, removeNotifierFile, writeNotifierFile, type NotifierFileChannel } from '../core/notifier-file.js'
import { listSlackChannels, slackAppManifest, type SlackChannel } from '../core/messaging/connectors/slack/index.js'
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
  return {
    ...described,
    source,
    defaultWebhookUrl: defaultWebhook?.webhookUrl ?? null,
    publicUrl: process.env.LOOPENGINE_PUBLIC_URL ?? null,
    secretVars: NOTIFIER_SECRET_VARS,
    secretsSet,
    slack: {
      signingSecretVar: NOTIFIER_SLACK_SIGNING_SECRET_VAR,
      signingSecretSet: env.get(NOTIFIER_SLACK_SIGNING_SECRET_VAR) !== undefined,
      // Where the Slack app's Interactivity Request URL should point.
      interactivityPath: `/hooks/slack/${encodeURIComponent(config.name)}`,
      // The console swaps __INTERACTIVITY_URL__ for the link address +
      // interactivityPath as you type.
      manifestTemplate: slackAppManifest({ agentName: config.name, interactivityUrl: '__INTERACTIVITY_URL__' }),
    },
    deliveries: listDeliveries(config.name),
  }
}

/** Writes agents/<name>/notifier.yml from the console form and, when the
 * form includes one, the channel's secret into the agent's own env.
 * Throws NotifierFileError for an invalid form. */
export async function saveAgentNotifier(config: AgentConfig, body: Record<string, unknown>): Promise<void> {
  const file = writeNotifierFile(agentDirFor(config), body)
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

/** Channels for the console's picker, with the token being typed in or,
 * when none is given, the one already saved. */
export async function listAgentSlackChannels(config: AgentConfig, botToken?: string): Promise<SlackChannel[]> {
  const token = botToken?.trim() || slackCredentialsFor(config).botToken
  if (!token) throw new Error('Enter the bot token first')
  return listSlackChannels(token)
}

/** Removes notifier.yml; the stored secret is left alone, so turning the
 * notifier back on doesn't need it re-entered. */
export function removeAgentNotifier(config: AgentConfig): void {
  removeNotifierFile(agentDirFor(config))
}

/** The notifier settings that apply to an agent: its code httpNotifier,
 * else its notifier.yml (once its secret is set), else the
 * deployment-wide default webhook. */
function activeNotifierTarget(config: AgentConfig, defaultWebhook?: DefaultWebhook): HttpNotifierConfig | undefined {
  if (config.httpNotifier) return config.httpNotifier
  const dir = agentDirFor(config)
  const file = readNotifierFile(dir)
  if (file) {
    const { config: fromFile } = notifierConfigFromFile(file, createAgentEnv(config.name, dir))
    if (fromFile) return fromFile
  }
  return defaultWebhook ? { channel: 'webhook', config: { webhookUrl: defaultWebhook.webhookUrl, webhookSecret: defaultWebhook.webhookSecret }, events: ['run_finish'] } : undefined
}

/** Posts a plain announcement through the agent's notifier — a scheduled
 * task's result, for one — regardless of which events it subscribed to.
 * A webhook gets a signed `run_finish` payload with `data` merged in;
 * Slack and Lark get `text`. Does nothing when no notifier applies. */
export function announceToNotifier(config: AgentConfig, text: string, data: Record<string, unknown>, defaultWebhook?: DefaultWebhook): boolean {
  let target: HttpNotifierConfig | undefined
  try {
    target = activeNotifierTarget(config, defaultWebhook)
  } catch {
    return false
  }
  if (!target) return false
  switch (target.channel) {
    case 'webhook':
      postLifecycleWebhook(target.config.webhookUrl, target.config.webhookSecret, 'run_finish', { agent: config.name, text, ...data })
      return true
    case 'slack':
      new SlackNotifier({ botToken: target.config.botToken, channelId: target.config.channelId }).postMessage(text)
      return true
    case 'lark':
      new LarkNotifier({ appId: target.config.appId, appSecret: target.config.appSecret, chatId: target.config.chatId }).postMessage(text)
      return true
    default:
      return false
  }
}

/** Sends a test through whichever notifier applies to this agent —
 * webhook or Slack; reports what the receiver answered. */
export async function testAgentNotifier(config: AgentConfig, defaultWebhook?: DefaultWebhook): Promise<DeliveryResult & { channel?: string }> {
  let target = config.httpNotifier
  if (!target) {
    const dir = agentDirFor(config)
    const file = readNotifierFile(dir)
    if (file) {
      const { config: fromFile, missingSecret } = notifierConfigFromFile(file, createAgentEnv(config.name, dir))
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
