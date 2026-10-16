// What a messaging app has to provide for an agent to talk with people
// there (core/messaging/engine.ts). The engine owns everything about
// requests, decisions and safety; a connector only turns the app's own
// payloads into these shapes and posts back. One per app, under
// ./connectors/ — Slack today, Telegram and Lark next.
//
// Verifying an incoming request and parsing it stay with the connector's
// own module (each app signs and shapes its payloads differently), and
// the route that receives them stays in adapters/http.ts.

/** A person's new message, in any app. */
export interface InboundMessage {
  /** Which connector it came through: 'slack', 'telegram', ... */
  app: string
  /** The app's id for this delivery, to drop redeliveries. */
  eventId: string
  /** Where it was posted: a channel, group or DM id. */
  conversation: string
  /** The app's id for the person. */
  user: string
  text: string
  /** The message's own id in the app. */
  ts: string
  /** Set for a reply in a thread: the thread's first message id. */
  threadTs?: string
}

/** One message of a thread, as the connector reads it back. */
export interface ThreadMessage {
  user?: string
  /** Posted by a bot (this agent's included) rather than a person. */
  fromBot: boolean
  text: string
  ts: string
}

/** A connector bound to one agent's credentials. */
export interface MessagingConnector {
  app: string
  /** The app's name as people know it: 'Slack'. */
  name: string
  /** How to refer to a person in a message (Slack: <@U123>). */
  mention(user: string): string
  /** The thread's messages, oldest first, its first message included. */
  fetchThread(conversation: string, threadTs: string): Promise<ThreadMessage[]>
  postInThread(conversation: string, threadTs: string, text: string): Promise<void>
  /** Replaces the request message itself (and its buttons) with the
   * outcome, so nobody acts on a decision already made. Optional. */
  replaceMessage?(conversation: string, ts: string, text: string): Promise<void>
}
