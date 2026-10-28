// The public API — everything a consumer building on loopengine needs to
// define and run their own agent. `agents/*.ts`, `core/agent-registry.ts`,
// `adapters/*.ts`, and the Dockerfile are this repo's own reference app
// built on top of this surface, not part of it — see the README section
// "Using loopengine as a library" for the boundary and why.
export { runAgent } from '#core/run-agent.js'
export { storageSigners } from '#core/storage-signers/index.js'
export type { SignRequest, StorageSigner } from '#core/storage-signers/types.js'
export type {
  Message,
  ModelCall,
  ModelContentBlock,
  ModelResponse,
  RunAgentOptions,
  RunAgentResult,
} from '#core/run-agent.js'

export type { AgentConfig, AgentModelConfig, ToolSchema, ToolDefinition, ToolContext, AgentEnv } from '#core/agent-config.js'
export { createAgentEnv, agentDirFor, envScopeOf, type EnvScope } from '#core/agent-env.js'
export { FileSecretStore, setSecretStore, getSecretStore, type SecretStore } from '#core/secret-store.js'
export { signProxyIdentity, verifyProxyIdentity, TRUSTED_PROXY_IDENTITY_HEADER, type ProxyIdentity } from '#core/trusted-proxy.js'
export { setUsageSink, recordUsage, type UsageEvent, type UsageSink } from '#core/usage.js'
export { readNotifierFile, writeNotifierFile, removeNotifierFile, validateNotifierFile, notifierConfigFromFile, NotifierFileError, NOTIFIER_SECRET_VARS, type NotifierFile, type MessagingApprover } from '#core/notifier-file.js'
export { listDeliveries, recordDelivery, type NotifierDelivery } from '#core/notifier-deliveries.js'
export { describeNotifier } from '#core/http-notifier.js'
export { Scheduler, ScheduleError, FileSchedulerStore, getSchedulerStore, setSchedulerStore, createScheduledTask, listScheduledTasks, getScheduledTask, cancelScheduledTask, pauseScheduledTask, resumeScheduledTask, runScheduledTaskNow, deleteScheduledTask, nextScheduledWakeAt, importLegacyScheduledTasks, parseEvery, describeSchedule, type ScheduledTask, type ScheduledTaskRun, type ScheduledTaskStatus, type Schedule, type SchedulerStore, type FireTask, type CreateScheduledTaskInput } from '#core/scheduler.js'
export { NOTIFIER_SLACK_SIGNING_SECRET_VAR } from '#core/notifier-file.js'
export { firstSighting, handleInboundMessage, handleMessagingAction, settleThreadChoice, isPlainApproval, type MessagingDeps, type MessagingDecision, type DecisionOutcome } from '#core/messaging/engine.js'
export { formatArgs, formatChange, labelFor } from '#core/messaging/format-args.js'
export { decideReply, proposeEdit, describeChange, type ReplyDecision, type DecisionRequest } from '#core/messaging/decide.js'
export { recordThread, findThread, findThreadByPending, type ThreadLink } from '#core/messaging/threads.js'
export type { InboundMessage, MessagingConnector, ThreadMessage, MessagingChoice, MessagingAction } from '#core/messaging/connector.js'
export { parseSlackEvent, createSlackConnector, verifySlackRequest, parseSlackInteraction, openSlackAnswerModal, replyInSlack, replyPrivatelyInSlack, slackOutcomeText, listSlackChannels, listSlackChannelMembers, slackAppManifest, toSlackMrkdwn, slackArgs, slackEscape, type SlackEvent, type SlackInteraction, type SlackChannel } from '#core/messaging/connectors/slack/index.js'
export { createDecisionToken, verifyDecisionToken, decidePath, decideLinkMaker, decisionLinkTtlMs, type DecisionKind } from '#core/approval-links.js'
export { renderDecidePage, renderDecideGonePage, renderDecideInvalidPage, type DecidePageItem } from './web/decide-page.js'
export { sendTestWebhook } from '#core/http-notify-triggers/webhook.js'
export { describeAgentNotifier, saveAgentNotifier, removeAgentNotifier, testAgentNotifier, listAgentPending, slackCredentialsFor, slackConversationsOn, slackClickAllowed, agentApprovers, setAgentApprovers, listAgentSlackMembers, listAgentSlackChannels, announceToNotifier, type DefaultWebhook } from './web/notifier-admin.js'

// The full typed lifecycle a running turn can emit (see loop-events.ts's
// own header comment) — exported directly, not just transitively via
// RunAgentOptions.onEvent above, so a consumer building their own UI
// (client.ts below, or their own thing entirely) can name LoopEvent and
// its variants without reaching into '#run-agent.js' for something that
// isn't really about running an agent, it's about observing one.
export type * from './core/loop-events.js'

// The framework-agnostic browser client for adapters/http.ts's own wire
// protocol (see client.ts's own header comment) — this, not a deep
// subpath import, is how a consumer's React/Vue/etc. chat UI is meant to
// reach it: this package has no "exports" map, so every other module here
// is re-exported through this single entry point too, and client.ts is no
// exception.
export {
  streamMessage,
  streamMessageWithCallbacks,
  sendMessage,
  approveCall,
  denyCall,
  answerQuestion,
  getSessionHistory,
} from './core/client.js'
export type {
  RequestOptions,
  SendMessageResult,
  PendingApprovalResult,
  PendingQuestionResult,
  PendingResult,
  MessageResult,
  StreamMessageCallbacks,
} from './core/client.js'

export { FileSessionStore, RedisSessionStore, createSessionStore } from './core/session-store.js'
export type { SessionStore, SessionResult, RedisSessionStoreOptions } from './core/session-store.js'

export { SessionKnit, FileStorage, MemoryStorage, reconstructChain } from './core/sessionknit.js'
export type { Storage, SessionEntry, ResumeResult, SessionKnitOptions, ReconstructResult } from './core/sessionknit.js'

export {
  SkillGarden,
  parseSkillFile,
  discoverSkillFiles,
  estimateTokens as estimateSkillIndexTokens,
  buildBudgetedIndex,
  substituteArguments,
  matchesActivationPaths,
} from './core/skillgarden/index.js'
export type {
  SkillGardenOptions,
  SkillFrontmatter,
  SkillIndexEntry,
  LoadedSkill,
  DiscoveredSkillFile,
  BuildIndexOptions,
  BudgetedIndex,
} from './core/skillgarden/index.js'

export { VectorIndex, embed, cosineSimilarity } from './core/vector-index.js'
export type { Document, ScoredDocument } from './core/vector-index.js'

export { createAnthropicModelCall } from './core/model-calls/anthropic-model-call.js'
export type { AnthropicModelCallOptions } from './core/model-calls/anthropic-model-call.js'

export { createOpenAIModelCall } from './core/model-calls/openai-model-call.js'
export type { OpenAIModelCallOptions } from './core/model-calls/openai-model-call.js'

export { createDeepSeekModelCall } from './core/model-calls/deepseek-model-call.js'
export type { DeepSeekModelCallOptions } from './core/model-calls/deepseek-model-call.js'

export { createKimiModelCall } from './core/model-calls/kimi-model-call.js'
export type { KimiModelCallOptions } from './core/model-calls/kimi-model-call.js'

export { createGlmModelCall } from './core/model-calls/glm-model-call.js'
export type { GlmModelCallOptions } from './core/model-calls/glm-model-call.js'

export { createGeminiModelCall } from './core/model-calls/gemini-model-call.js'
export type { GeminiModelCallOptions } from './core/model-calls/gemini-model-call.js'

export { discoverAgents, loadAgentModule, synthesizeCreateModelCall } from './core/discover-agents.js'
export type { AgentModule } from './core/discover-agents.js'

export { agentAsTool } from './core/agent-as-tool.js'

// Everything below backs the Admin UI (agents-config/list/global-config
// pages, playground) that this repo's own adapters/http.ts wires up —
// re-exported here, same "one entry point, no deep subpath imports"
// convention as everything above, so a project scaffolded by
// create-loopengine can build the same admin surface on top of its own
// copy of adapters/http.ts (which, like agent-registry.ts, is meant to be
// owned/edited, not imported — see this file's own header comment).

export { resumeAgent, loadRules, loadDefaultTools, loadSubagentAsTools, systemTools, systemSkillsDir } from './core/run-agent.js'

export { Compactor, TruncatingSummarizer } from './core/compaction.js'
export type { Summarizer, RecoverResult, RecoverAction } from './core/compaction.js'
export { LLMSummarizer } from './core/llm-summarizer.js'
export type { LLMSummarizerOptions } from './core/llm-summarizer.js'

export { createCheckpointStore } from './core/durable-approvals.js'
export type { TurnCheckpoint, CheckpointStore, OutstandingItem } from './core/durable-approvals.js'

export {
  addGatewayTool,
  agentDir,
  inferAgentNameFromToolUrl,
  disconnectComposioAccount,
  describeGatewayTools,
  listComposioConnections,
  listComposioTools,
  loadGatewayToolsFromDir,
  removeGatewayTool,
  removeGatewayToolSlug,
  GatewayToolExistsError,
  GatewayToolNotFoundError,
} from './core/gateway-tools.js'
export type { GatewayToolEntry, GatewayToolDecision } from './core/gateway-tools.js'

export { connectComposioSource } from './core/mcpplug.js'
export type { ToolSource, ComposioSourceOptions } from './core/mcpplug.js'

export { ToolLane, buildLanes, runLanes } from './core/toollane.js'
export type { ToolLaneOptions, SafetyClassifier, ToolCall, Lane, LaneResult } from './core/toollane.js'

export { WebhookNotifier } from './core/http-notify-triggers/webhook.js'

// answerQuestion above (core/client.ts) is the HTTP client-side helper —
// this is the server-side function that actually resolves a pending
// question in-process, aliased to avoid colliding with that name.
export { listQuestions, answerQuestion as resolvePendingQuestion, findQuestion, createAskUserTool, createScheduleTools } from './core/system-tools/index.js'
export type { PendingQuestion } from './core/system-tools/index.js'

export { editAgentFile, AgentEditNotSupportedError, AgentFileNotFoundError } from './web/agent-file-admin.js'
export type { AgentEditableFields, AgentEditResult } from './web/agent-file-admin.js'

export {
  createHttpTool,
  updateHttpTool,
  readHttpToolSpec,
  listEditableHttpToolNames,
  HttpToolNameError,
  HttpToolExistsError,
  HttpToolIndexShapeError,
  HttpToolNotFoundError,
  HttpToolNotEditableError,
} from './web/http-tool-admin.js'
export type { HttpToolSpec, HttpToolField } from './web/http-tool-admin.js'

export { agentsConfigPageHtml } from './web/agents-config-page.js'
export { agentsListPageHtml } from './web/agents-list-page.js'
export { interviewPageHtml } from './web/interview-page.js'
export {
  InterviewError,
  answerInterview,
  createFromCandidate,
  createAgentFromCandidate,
  describeCandidate,
  deleteInterview,
  finishInterview,
  getInterview,
  interviewTools,
  listInterviews,
  pickAgentModel,
  pickInterviewModel,
  previewCandidate,
  startInterview,
  setInterviewProject,
  setupChecklist,
  type Interview,
  type InterviewAgentSource,
  type CandidatePreview,
  type CreatedAgent,
  type ChecklistItem,
  type CreateDeps,
} from './web/interview-admin.js'
export { runInterviewTurn, rankCandidates, validateCandidate, INTERVIEWER_PROMPT, type AgentCandidate, type InterviewStage } from './core/system-agents/interviewer.js'
export { templatesPageHtml } from './web/templates-page.js'
export {
  TemplateError,
  createFromTemplate,
  describeTemplateSchedule,
  listTemplates,
  previewTemplate,
  templateChecklist,
  type CreatedTemplateAgent,
  type LegacyTemplateCreateDeps,
  type TemplateChecklistItem,
  type TemplateCreateDeps,
  type TemplatePreview,
  type TemplateSummary,
} from './web/templates-admin.js'
export {
  STARTER_TEMPLATES,
  starterTemplate,
  templateScheduleStart,
  type StarterTemplate,
  type TemplateRule,
  type TemplateSchedule,
  type TemplateSetup,
  type TemplateSkill,
} from './core/system-agents/templates.js'
export { globalConfigPageHtml } from './web/global-config-page.js'
export { playgroundHtml } from './web/playground.js'

export { readSkill, writeSkill, deleteSkill, SkillInvalidIdError, SkillNotFoundError } from './web/skills-admin.js'
export type { SkillContent } from './web/skills-admin.js'

export { listDeclaredEnvVars, setEnvVar, unsetEnvVar, setAgentEnvVar, unsetAgentEnvVar, agentScopedEnvVarName, EnvVarNameError } from './web/env-admin.js'
export type { DeclaredEnvVar } from './web/env-admin.js'

export {
  readActauthConfig,
  addActauthRule,
  updateActauthRule,
  removeActauthRule,
  setDefaultDecision,
  ActauthRuleExistsError,
  ActauthRuleNotFoundError,
} from './web/actauth-admin.js'
export type { ActauthRuleInput, ActauthConfigView } from './web/actauth-admin.js'

export {
  installAbility,
  upgradeAbility,
  removeAbility,
  listInstalledAbilities,
  backfillDependencies,
  AbilityManifestError,
  AbilityVersionError,
  AbilityCollisionError,
  AbilityAlreadyInstalledError,
  AbilityNotInstalledError,
} from './bin/ability-manager.js'
export type { InstalledAbilityRecord, AbilityEnvDecl, UpgradeFileResult } from './bin/ability-manager.js'

export { searchPublicAbilities, fetchLatestAbilityVersion } from './web/abilities-admin.js'
export type { PublicAbilitySearchResult } from './web/abilities-admin.js'

export { describeModelProviders, describeGateways, setModelProviderKey, clearModelProviderKey, ModelKeyError } from './web/global-config.js'
export { loopengineVersion } from './core/version.js'
export { describeUpgrade, runUpgrade, UpgradeError } from './web/upgrade-admin.js'
export type { ModelProviderInfo, AgentModelUsage, ModelsView, GatewayProviderInfo, GatewaysView } from './web/global-config.js'

export { createTrackedApprover, listApprovals, decideApproval, findApproval } from './web/web-approver.js'

export { scaffoldAgent, scaffoldSubagent, AgentNameError, AgentExistsError, AgentNotFoundError, AgentModelError } from './bin/cli.js'
export type { AgentTemplateOptions } from './bin/cli.js'
