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
import { sendTestWebhook, type DeliveryResult } from '../core/http-notify-triggers/webhook.js'
import { listDeliveries } from '../core/notifier-deliveries.js'
import { NOTIFIER_SECRET_VARS, notifierConfigFromFile, readNotifierFile, removeNotifierFile, writeNotifierFile, type NotifierFileChannel } from '../core/notifier-file.js'
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
}

/** Removes notifier.yml; the stored secret is left alone, so turning the
 * notifier back on doesn't need it re-entered. */
export function removeAgentNotifier(config: AgentConfig): void {
  removeNotifierFile(agentDirFor(config))
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
