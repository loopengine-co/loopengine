// Resolves AgentConfig.httpNotifier — see that field's own doc comment
// (agent-config.ts) for the precedence rules this exists to serve, and
// for why `channel` is a discriminated union rather than always meaning
// "webhook." Switches on `httpNotifier.channel` below to build the right
// sender — see AgentConfig.HttpNotifierConfig's own doc comment for
// which class backs which channel; every one of them lives under
// ./http-notify-triggers/, one file each.
import { type Approver, type Scope } from 'actauth'
import { WebhookNotifier, postLifecycleWebhook } from './http-notify-triggers/webhook.js'
import { SlackNotifier } from './http-notify-triggers/slack.js'
import { LarkNotifier } from './http-notify-triggers/lark.js'
import { TelegramNotifier } from './http-notify-triggers/telegram.js'
import { EmailNotifier } from './http-notify-triggers/email.js'
import { DatabaseApprover } from './http-notify-triggers/database.js'
import { RedisQueueApprover } from './http-notify-triggers/redis.js'
import type { AgentConfig, HttpNotifierConfig, QuestionHandler } from './agent-config.js'
import { agentDirFor, createAgentEnv } from './agent-env.js'
import { notifierConfigFromFile, readActiveConnections, readNotifierFile, type NotifierFile, type NotifierFileChannel } from './notifier-file.js'
import { recordThread } from './messaging/threads.js'

interface ResolvedHttpNotifier {
  approver?: Approver
  questionHandler?: QuestionHandler
  onRunStart?: NonNullable<AgentConfig['onRunStart']>
  onRunFinish?: NonNullable<AgentConfig['onRunFinish']>
}

const EMPTY: ResolvedHttpNotifier = {}

// Keyed by the AgentConfig object itself, not its httpNotifier field
// alone — resolveHttpNotifier is called on every runAgent()/resumeAgent()
// call (see run-agent.ts's buildTurnContext), so without this a fresh
// sender would be constructed per turn for no reason; a config object is
// created once per agent module and reused for its whole process
// lifetime, the same assumption discoverAgents' own memoized
// createModelCall already relies on.
const cache = new WeakMap<AgentConfig, ResolvedHttpNotifier>()

/** Chat channels (Slack/Lark) have no signed-payload equivalent to react
 * to for a lifecycle event — nothing to resolve, so just a plain,
 * human-readable announcement string. Shared between the two since the
 * message itself doesn't need to be platform-specific, only how it's
 * sent does. */
function formatChatLifecycleMessage(event: 'run_start' | 'run_finish', context: Record<string, unknown>): string {
  if (event === 'run_start') {
    const trigger = context.trigger === 'resolution' ? 'resumed' : 'started'
    return `${context.agent} ${trigger}${context.sessionId ? ` (session ${context.sessionId})` : ''}`
  }
  const stopReason = typeof context.stopReason === 'string' ? ` (${context.stopReason})` : ''
  return `${context.agent} finished${stopReason}: ${context.text ?? ''}`
}

function formatEmailLifecycleSubject(event: 'run_start' | 'run_finish', context: Record<string, unknown>): string {
  return event === 'run_start' ? `${context.agent} started` : `${context.agent} finished`
}

/** Where an agent's durable approvals/questions go, for the console:
 * `code` (AgentConfig.httpNotifier), `file` (agents/<name>/messaging.yml),
 * or `none`. A file whose secret isn't set yet is reported, not used. */
export function describeNotifier(config: AgentConfig): {
  source: 'code' | 'file' | 'none'
  channel?: HttpNotifierConfig['channel']
  events?: string[]
  file?: NotifierFile
  missingSecret?: string
  error?: string
  /** The saved connections that send (the webhook, then the primary
   * messaging app), and which are held back by a missing secret. */
  active?: Array<{ channel: NotifierFileChannel; missingSecret?: string }>
} {
  if (config.httpNotifier) return { source: 'code', channel: config.httpNotifier.channel, events: [...config.httpNotifier.events] }
  const dir = agentDirFor(config)
  let file: NotifierFile | undefined
  try {
    file = readNotifierFile(dir)
  } catch (err) {
    return { source: 'none', error: `The messaging settings are invalid: ${err instanceof Error ? err.message : String(err)}` }
  }
  if (!file) return { source: 'none' }
  const env = createAgentEnv(config.name, dir)
  const active = readActiveConnections(dir).map((c) => {
    const { missingSecret } = notifierConfigFromFile(c, env, config.name)
    return missingSecret ? { channel: c.channel, missingSecret } : { channel: c.channel }
  })
  const { missingSecret } = notifierConfigFromFile(file, env, config.name)
  // Sending when any active connection has its secret.
  const sending = active.some((a) => !a.missingSecret)
  return { source: sending ? 'file' : 'none', channel: file.channel, events: file.events, file, missingSecret, active }
}

/** AgentConfig.httpNotifier when the agent sets one in code; otherwise
 * its agents/<name>/messaging.yml (see core/notifier-file.ts), re-read on
 * every call so a console edit applies to the very next turn. */
export function resolveHttpNotifier(config: AgentConfig): ResolvedHttpNotifier {
  const httpNotifier = config.httpNotifier
  if (!httpNotifier) return resolveFromFile(config)

  const cached = cache.get(config)
  if (cached) return cached

  const resolved = buildResolved(httpNotifier, agentDirFor(config))
  cache.set(config, resolved)
  return resolved
}

// The webhook (when set up) and the primary messaging app, each built on
// its own and then combined; one held back by a missing secret is left
// out.
function resolveFromFile(config: AgentConfig): ResolvedHttpNotifier {
  const dir = agentDirFor(config)
  let files: NotifierFile[]
  try {
    files = readActiveConnections(dir)
  } catch (err) {
    console.error(`[loopengine] ignoring the messaging settings in agents/${config.name}/:`, err instanceof Error ? err.message : err)
    return EMPTY
  }
  const env = createAgentEnv(config.name, dir)
  const resolved = files.flatMap((file) => {
    const { config: httpNotifier } = notifierConfigFromFile(file, env, config.name)
    return httpNotifier ? [buildResolved(httpNotifier, dir)] : []
  })
  return combineResolved(resolved)
}

type DurableTarget = { requestDurableApproval(tool: string, args: Record<string, unknown>, scope: Scope, reason: string, pendingId?: string): { pendingId: string } }
type DurableQuestionTarget = { notifyPendingQuestion(question: string, options: string[] | undefined, agent: string, sessionId: string | undefined, pendingId?: string): { pendingId: string } }

/** Several notifiers as one: each request goes to every one of them under
 * the first one's request id, so a decision through any of them resolves
 * the same request; run started/finished go to all. One notifier is
 * returned as it is. */
function combineResolved(list: ResolvedHttpNotifier[]): ResolvedHttpNotifier {
  if (list.length <= 1) return list[0] ?? EMPTY
  const approvers = list.map((r) => r.approver).filter((a): a is Approver => Boolean(a)) as unknown as DurableTarget[]
  const questioners = list.map((r) => r.questionHandler).filter((q): q is QuestionHandler => Boolean(q)) as unknown as DurableQuestionTarget[]
  const starts = list.map((r) => r.onRunStart).filter((f): f is NonNullable<typeof f> => Boolean(f))
  const finishes = list.map((r) => r.onRunFinish).filter((f): f is NonNullable<typeof f> => Boolean(f))
  const fanOutApprover: DurableTarget = {
    requestDurableApproval(tool, args, scope, reason) {
      const { pendingId } = approvers[0].requestDurableApproval(tool, args, scope, reason)
      for (const other of approvers.slice(1)) other.requestDurableApproval(tool, args, scope, reason, pendingId)
      return { pendingId }
    },
  }
  const fanOutQuestions: DurableQuestionTarget = {
    notifyPendingQuestion(question, options, agent, sessionId) {
      const { pendingId } = questioners[0].notifyPendingQuestion(question, options, agent, sessionId)
      for (const other of questioners.slice(1)) other.notifyPendingQuestion(question, options, agent, sessionId, pendingId)
      return { pendingId }
    },
  }
  return {
    approver: approvers.length === 0 ? undefined : ((approvers.length === 1 ? approvers[0] : fanOutApprover) as unknown as Approver),
    questionHandler: questioners.length === 0 ? undefined : ((questioners.length === 1 ? questioners[0] : fanOutQuestions) as unknown as QuestionHandler),
    onRunStart: starts.length ? (context) => { for (const f of starts) f(context) } : undefined,
    onRunFinish: finishes.length ? (context) => { for (const f of finishes) f(context) } : undefined,
  }
}

/** `agentDir`: where a Slack request's thread is recorded, so replies in
 * it reach the agent (core/messaging/). */
function buildResolved(httpNotifier: HttpNotifierConfig, agentDir: string): ResolvedHttpNotifier {
  const events = new Set(httpNotifier.events)
  let resolved: ResolvedHttpNotifier

  switch (httpNotifier.channel) {
    case 'webhook': {
      const { webhookUrl, webhookSecret, publicUrl } = httpNotifier.config
      // One shared instance for both concerns, same "it's channel-
      // specific, not concern-specific" reasoning every other channel's
      // own file already has — see WebhookNotifier's own doc comment.
      const webhook = new WebhookNotifier({ webhookUrl, signingSecret: webhookSecret, publicUrl })
      resolved = {
        approver: events.has('approval') ? webhook : undefined,
        questionHandler: events.has('question') ? webhook : undefined,
        onRunStart: events.has('run_start') ? (context) => postLifecycleWebhook(webhookUrl, webhookSecret, 'run_start', context) : undefined,
        onRunFinish: events.has('run_finish') ? (context) => postLifecycleWebhook(webhookUrl, webhookSecret, 'run_finish', context) : undefined,
      }
      break
    }
    case 'slack': {
      const { botToken, channelId, publicUrl, buttons, replyHint } = httpNotifier.config
      // One shared instance for every concern this httpNotifier actually
      // covers — same "it's Slack-specific, not approval/question/
      // lifecycle-specific" reasoning SlackNotifier's own doc
      // comment works out; cheap to construct (holds two strings, does no
      // I/O itself) so there's no reason to build one per event kind.
      const slack = new SlackNotifier({ botToken, channelId, publicUrl, buttons, replyHint, onThread: ({ channel, ts, pendingId, kind }) => recordThread(agentDir, { app: 'slack', conversation: channel, ts, pendingId, kind }),
      })
      resolved = {
        approver: events.has('approval') ? slack : undefined,
        questionHandler: events.has('question') ? slack : undefined,
        onRunStart: events.has('run_start') ? (context) => slack.postMessage(formatChatLifecycleMessage('run_start', context)) : undefined,
        onRunFinish: events.has('run_finish') ? (context) => slack.postMessage(formatChatLifecycleMessage('run_finish', context)) : undefined,
      }
      break
    }
    case 'lark': {
      const { appId, appSecret, chatId, publicUrl, buttons } = httpNotifier.config
      const lark = new LarkNotifier({ appId, appSecret, chatId, publicUrl, buttons })
      resolved = {
        approver: events.has('approval') ? lark : undefined,
        questionHandler: events.has('question') ? lark : undefined,
        onRunStart: events.has('run_start') ? (context) => lark.postMessage(formatChatLifecycleMessage('run_start', context)) : undefined,
        onRunFinish: events.has('run_finish') ? (context) => lark.postMessage(formatChatLifecycleMessage('run_finish', context)) : undefined,
      }
      break
    }
    case 'telegram': {
      const { botToken, chatId, publicUrl } = httpNotifier.config
      const telegram = new TelegramNotifier({ botToken, chatId, publicUrl })
      return {
        approver: events.has('approval') ? telegram : undefined,
        questionHandler: events.has('question') ? telegram : undefined,
        onRunStart: events.has('run_start') ? (context) => telegram.postMessage(formatChatLifecycleMessage('run_start', context)) : undefined,
        onRunFinish: events.has('run_finish') ? (context) => telegram.postMessage(formatChatLifecycleMessage('run_finish', context)) : undefined,
      }
    }
    case 'email': {
      const { to, sendEmail, resolveBaseUrl, answerBaseUrl, signingSecret, linkTtlMs, publicUrl } = httpNotifier.config
      const email = new EmailNotifier({ to, sendEmail, resolveBaseUrl, answerBaseUrl, signingSecret, linkTtlMs, publicUrl })
      resolved = {
        approver: events.has('approval') ? email : undefined,
        questionHandler: events.has('question') ? email : undefined,
        onRunStart: events.has('run_start')
          ? (context) => email.sendAnnouncement(formatEmailLifecycleSubject('run_start', context), formatChatLifecycleMessage('run_start', context), 'run_start')
          : undefined,
        onRunFinish: events.has('run_finish')
          ? (context) => email.sendAnnouncement(formatEmailLifecycleSubject('run_finish', context), formatChatLifecycleMessage('run_finish', context), 'run_finish')
          : undefined,
      }
      break
    }
    case 'database': {
      // Approval-only by construction (AgentConfig.ApprovalOnlyHttpNotifierEvent) —
      // no questionHandler/lifecycle sender exists for this channel at
      // all, see DatabaseApprover's own doc comment for why.
      resolved = { approver: events.has('approval') ? new DatabaseApprover(httpNotifier.config.repository) : undefined }
      break
    }
    case 'redis': {
      resolved = {
        approver: events.has('approval')
          ? new RedisQueueApprover({ redis: httpNotifier.config.redis, queueKey: httpNotifier.config.queueKey })
          : undefined,
      }
      break
    }
  }

  return resolved
}
