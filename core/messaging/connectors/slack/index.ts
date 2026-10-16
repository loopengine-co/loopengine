// The Slack connector (core/messaging/connector.ts), one file per part:
// thread replies (./events.ts), buttons and the signing check
// (./interactions.ts), and the console's app setup (./setup.ts).
// Posting requests is still SlackNotifier's job
// (core/http-notify-triggers/slack.ts).
export { createSlackConnector, parseSlackEvent, type SlackEvent } from './events.js'
export {
  SLACK_ANSWER_ACTION_ID,
  SLACK_ANSWER_BLOCK_ID,
  openSlackAnswerModal,
  parseSlackInteraction,
  replyInSlack,
  slackOutcomeText,
  verifySlackRequest,
  type SlackInteraction,
} from './interactions.js'
export { listSlackChannels, slackAppManifest, type SlackChannel } from './setup.js'
