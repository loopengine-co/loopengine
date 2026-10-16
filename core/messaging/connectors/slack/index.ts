// The Slack connector (core/messaging/connector.ts), one file per part:
// thread replies (./events.ts) and their formatting (./format.ts), buttons and the signing check
// (./interactions.ts), and the console's app setup (./setup.ts).
// Posting requests is still SlackNotifier's job
// (core/http-notify-triggers/slack.ts).
export { createSlackConnector, parseSlackEvent, type SlackEvent } from './events.js'
export { toSlackMrkdwn } from './format.js'
export {
  SLACK_ANSWER_ACTION_ID,
  SLACK_ANSWER_BLOCK_ID,
  openSlackAnswerModal,
  parseSlackInteraction,
  replyInSlack,
  replyPrivatelyInSlack,
  slackOutcomeText,
  verifySlackRequest,
  type SlackInteraction,
} from './interactions.js'
export { listSlackChannelMembers, listSlackChannels, slackAppManifest, type SlackChannel, type SlackMember } from './setup.js'
