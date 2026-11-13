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
export { setRunObserver, reportRun, usedTool, type RunEvent, type RunEventSource, type RunObserver } from '#core/run-events.js'
export { readNotifierFile, writeNotifierFile, removeNotifierFile, validateNotifierFile, notifierConfigFromFile, NotifierFileError, NOTIFIER_SECRET_VARS, type NotifierFile, type MessagingApprover } from '#core/notifier-file.js'
export { listDeliveries, recordDelivery, type NotifierDelivery } from '#core/notifier-deliveries.js'
export { describeNotifier } from '#core/http-notifier.js'
export { Scheduler, ScheduleError, FileSchedulerStore, getSchedulerStore, setSchedulerStore, createScheduledTask, listScheduledTasks, getScheduledTask, cancelScheduledTask, pauseScheduledTask, resumeScheduledTask, runScheduledTaskNow, setScheduledTaskNotify, deleteScheduledTask, nextScheduledWakeAt, moveScheduledTasksToTimeZone, importLegacyScheduledTasks, parseEvery, describeSchedule, type ScheduledTask, type ScheduledTaskRun, type ScheduledTaskStatus, type Schedule, type SchedulerStore, type FireTask, type CreateScheduledTaskInput } from '#core/scheduler.js'
export { NOTIFIER_SLACK_SIGNING_SECRET_VAR } from '#core/notifier-file.js'
export { firstSighting, handleInboundMessage, handleMessagingAction, settleThreadChoice, isPlainApproval, outcomeText, type MessagingDeps, type MessagingDecision, type DecisionOutcome } from '#core/messaging/engine.js'
export { handleJobMessage, isJobMessage, settleJobThread, jobSessionId, findJobFor, type JobDeps, type JobTurn } from '#core/messaging/jobs.js'
export { formatArgs, formatChange, labelFor } from '#core/messaging/format-args.js'
export { decideReply, proposeEdit, describeChange, type ReplyDecision, type DecisionRequest } from '#core/messaging/decide.js'
export { recordThread, findThread, findThreadByPending, recordJobThread, findJobThread, findJobThreadBySession, type ThreadLink, type JobThread } from '#core/messaging/threads.js'
export type { InboundMessage, MessagingConnector, ThreadMessage, MessagingChoice, MessagingAction } from '#core/messaging/connector.js'
export { parseSlackEvent, createSlackConnector, verifySlackRequest, parseSlackInteraction, openSlackAnswerModal, replyInSlack, replyPrivatelyInSlack, slackOutcomeText, listSlackChannels, listSlackChannelMembers, slackAppManifest, toSlackMrkdwn, slackArgs, slackEscape, type SlackEvent, type SlackInteraction, type SlackChannel } from '#core/messaging/connectors/slack/index.js'
export { createDecisionToken, verifyDecisionToken, decidePath, decideLinkMaker, decisionLinkTtlMs, type DecisionKind } from '#core/approval-links.js'
export { renderDecidePage, renderDecideGonePage, renderDecideInvalidPage, type DecidePageItem } from './web/decide-page.js'
export { sendTestWebhook, publicBaseUrl } from '#core/http-notify-triggers/webhook.js'
export { describeAgentNotifier, saveAgentNotifier, removeAgentNotifier, setAgentPrimaryNotifier, testAgentNotifier, listAgentPending, slackCredentialsFor, slackConversationsOn, slackClickAllowed, agentApprovers, setAgentApprovers, listAgentSlackMembers, listAgentSlackChannels, announceToNotifier, type DefaultWebhook } from './web/notifier-admin.js'
export { clickAllowed, conversationsOn, jobsOn, jobAllowed, connectionPublicUrl, telegramCredentialsFor, telegramHomeChat, listAgentTelegramPeople, setupAgentTelegramWebhook, agentTelegramWebhookInfo, type TwoWayApp } from './web/notifier-admin.js'
export {
  createTelegramConnector, parseTelegramUpdate, verifyTelegramRequest, telegramCallbackData, answerTelegramClick, editTelegramMessage, telegramBotUsername,
  setTelegramWebhook, telegramWebhookInfo, callTelegram, recordTelegramMessage, readTelegramThread, telegramRootOf, telegramPeople, toTelegramHtml, telegramEscape, telegramArgs,
  type TelegramUpdate, type TelegramButton, type TelegramPerson,
} from '#core/messaging/connectors/telegram/index.js'

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
  substituteParameters,
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
export { createXaiModelCall } from './core/model-calls/xai-model-call.js'
export type { XaiModelCallOptions } from './core/model-calls/xai-model-call.js'
export { createMetaModelCall } from './core/model-calls/meta-model-call.js'
export type { MetaModelCallOptions } from './core/model-calls/meta-model-call.js'

export { discoverAgents, loadAgentModule, synthesizeCreateModelCall } from './core/discover-agents.js'
export { abilityDependencies, installMissingAbilityDependencies, installMissingPackages } from './core/ability-dependencies.js'
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
  createFromTemplateObject,
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
export { workflowPageHtml } from './web/workflow-page.js'
export {
  WorkflowError,
  checkWorkflowForAgent,
  checkWorkflowRequirements,
  createWorkflow,
  forgetWorkflow,
  forgetAgent,
  type ForgottenAgent,
  migrateAgentWorkflows,
  getPlanJob,
  listAgentWorkflows,
  noteForExistingAgent,
  planWorkflow,
  resolveConnections,
  prepareWorkflowRun,
  updateWorkflow,
  startPlanJob,
  type AgentWorkflowView,
  type CreatedWorkflow,
  type PlanJob,
  type PlannedWorkflow,
  type WorkflowAgentInfo,
  type WorkflowAppStatus,
  type WorkflowCheck,
  type WorkflowPlanDeps,
  type WorkflowRequirement,
  type WorkflowConflict,
  type WorkflowCreateDeps,
  type WorkflowMcpDeps,
  type WorkflowMcpCreateDeps,
  resolveMcpServers,
  prepareMcpAbilities,
} from './web/workflow-admin.js'
export { WORKFLOW_PLANNER_PROMPT, planParameters, planWorkflowWithModel, validateWorkflowPlan, workflowTemplate, type WorkflowPlan, type WorkflowPlannerTools, type WorkflowStep } from './core/system-agents/workflow-planner.js'
export { WORKFLOW_EXAMPLES, workflowExample, type WorkflowExample } from './core/system-agents/workflow-examples.js'
export { WORKFLOW_EXAMPLE_MESSAGES, type WorkflowExampleMessage } from './core/system-agents/workflow-example-messages.js'
export { createTrigger, updateTrigger, rotateTrigger, listTriggers, findTriggerByToken, publicTrigger, checkTriggerSettings, verifySenderSignature, parsePayload, valueAt, deliveryId, passesFilter, paramsFromPayload, recordDelivery as recordTriggerDelivery, FileTriggerStore, getTriggerStore, setTriggerStore, TriggerError, type WorkflowTrigger, type PublicTrigger, type TriggerSettings, type TriggerVerify, type TriggerFilter, type TriggerSender, type SignatureAlgorithm, type TriggerDelivery, type TriggerOutcome, type TriggerStore } from './core/workflow-triggers.js'
export { checkCallbackUrl, callbackSecret, signCallback, deliverCallback, runCallbackPayload, isPrivateAddress, CallbackUrlError, type CallbackDelivery, type RunCallbackEvent } from './core/run-callbacks.js'
export { WorkflowRunner, FileRunStore, getRunStore, setRunStore, listRuns, getRun, isUnderWay, RunError, type WorkflowRun, type WorkflowRunStatus, type RunStore, type ExecuteRun, type RunOutcome, type StartRunInput } from './core/workflow-runs.js'
export { readWorkflows, readWorkflow, setWorkflowFields, clearWorkflowFields, validateParams, workflowRunMessage, workflowPreviewMessage, migrateWorkflowsFile, WorkflowParamsError, type Workflow, type WorkflowFields, type WorkflowParameter } from './core/workflows.js'
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
  configureAgentMcpTools,
  AbilityManifestError,
  AbilityVersionError,
  AbilityCollisionError,
  AbilityAlreadyInstalledError,
  AbilityNotInstalledError,
} from './bin/ability-manager.js'
export type { InstalledAbilityRecord, AbilityEnvDecl, UpgradeFileResult, McpToolChoice } from './bin/ability-manager.js'
export {
  APP_CATALOG,
  AppToolsError,
  appCatalog,
  appServer,
  appTools,
  catalogServer,
  connectedApps,
  isAppAbility,
  loadAppIcons,
  refreshAppTools,
  setAppDefault,
  type AgentAppTools,
  type AppCatalogEntry,
  type AppTool,
  type AppView,
  type ConnectedApp,
} from './core/mcp-apps.js'

export { searchPublicAbilities, fetchLatestAbilityVersion } from './web/abilities-admin.js'
export type { PublicAbilitySearchResult } from './web/abilities-admin.js'

// Private ability sources, the workspace's own abilities and each
// ability's details: the console's Abilities page and agent Abilities tab.
export { AbilitySourceError, abilityOrigin, readAbilitySources, saveAbilitySource, removeAbilitySource, listSourceAbilities, sourceTokenVar, type AbilitySource, type SourceAbility, type AbilityOrigin } from './core/ability-sources.js'
export { describeAbilitySources, listPrivateAbilities, saveAbilitySourceFromConsole, removeAbilitySourceFromConsole } from './web/ability-sources-admin.js'
export { readAbilityDetails, readToolDefinitions, type AbilityDetails } from './core/ability-details.js'
export { loadMcpAbilityTools, mcpAbilityLoadError, closeMcpConnections, resolveMcpManifest, listMcpServerTools, isMcpAuthError, type McpServerManifest, type McpAuth, type InstalledMcpRecord, type McpToolInfo } from './core/mcp-abilities.js'
export { searchMcpServers, getMcpServer, savedMcpServers, ownMcpServer, saveMcpServer, removeSavedMcpServer, McpServerInputError, type McpDirectoryServer } from './core/mcp-directory.js'
export { generateMcpAbility, mcpAbilityNames, McpAbilityGenerationError, type GeneratedMcpAbility, type McpAbilityRequest } from './core/mcp-ability-generator.js'
export { startMcpSignIn, finishMcpSignIn, mcpSignInSupport, mcpOAuthEnvName, parseMcpOAuthState, saveMcpOAuthState, McpSignInError, type McpOAuthState } from './core/mcp-oauth.js'
export { abilityDetails } from './web/ability-details-admin.js'
export { WorkspaceAbilityError, listWorkspaceAbilities, addWorkspaceAbility, removeWorkspaceAbility, workspaceAbilitiesDir, type WorkspaceAbility } from './core/workspace-abilities.js'
export { installWorkspaceAbility, installUploadedAbility, MAX_UPLOAD_BYTES, type AbilityUpload } from './web/workspace-abilities-admin.js'
export { describeModelProviders, describeGateways, setModelProviderKey, clearModelProviderKey, listProviderModels, ModelKeyError, describeTimeZone, setWorkspaceTimeZone, TimeZoneError } from './web/global-config.js'
export { loopengineVersion } from './core/version.js'
export { describeUpgrade, runUpgrade, UpgradeError } from './web/upgrade-admin.js'
export type { ModelProviderInfo, AgentModelUsage, ModelsView, ProviderModelsView, GatewayProviderInfo, GatewaysView, TimeZoneView } from './web/global-config.js'
export { workspaceTimeZone, serverTimeZone, isValidTimeZone, TIME_ZONE_ENV } from '#core/time-zone.js'

export { createTrackedApprover, listApprovals, decideApproval, findApproval } from './web/web-approver.js'

export { scaffoldAgent, scaffoldSubagent, AgentNameError, AgentExistsError, AgentNotFoundError, AgentModelError } from './bin/cli.js'
export type { AgentTemplateOptions } from './bin/cli.js'
