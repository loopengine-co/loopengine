// Setting up an agent's Slack app from the console: the channel picker
// and the app manifest it shows.

export interface SlackChannel {
  id: string
  name: string
  isPrivate: boolean
  isMember: boolean
}

/** Channels the bot can see — needs the channels:read (and, for private
 * channels, groups:read) scope. */
export async function listSlackChannels(botToken: string): Promise<SlackChannel[]> {
  const channels: SlackChannel[] = []
  let cursor = ''
  for (let page = 0; page < 10; page++) {
    const params = new URLSearchParams({ types: 'public_channel,private_channel', exclude_archived: 'true', limit: '200' })
    if (cursor) params.set('cursor', cursor)
    const res = await fetch(`https://slack.com/api/conversations.list?${params}`, { headers: { Authorization: `Bearer ${botToken}` } })
    const body = (await res.json()) as {
      ok: boolean
      error?: string
      channels?: { id: string; name: string; is_private?: boolean; is_member?: boolean }[]
      response_metadata?: { next_cursor?: string }
    }
    if (!body.ok) {
      const reasons: Record<string, string> = {
        missing_scope: 'The bot token is missing the channels:read scope; reinstall the app from the manifest',
        invalid_auth: 'Slack rejected the bot token; copy the Bot User OAuth Token (xoxb-...) again',
        not_authed: 'Enter the bot token first',
        token_revoked: 'This bot token was revoked; reinstall the app and copy the new one',
      }
      throw new Error(reasons[body.error ?? ''] ?? `Slack said: ${body.error}`)
    }
    for (const c of body.channels ?? []) channels.push({ id: c.id, name: c.name, isPrivate: Boolean(c.is_private), isMember: Boolean(c.is_member) })
    cursor = body.response_metadata?.next_cursor ?? ''
    if (!cursor) break
  }
  return channels.sort((a, b) => Number(b.isMember) - Number(a.isMember) || a.name.localeCompare(b.name))
}

/** A Slack app manifest for one agent's notifier: a bot that can post,
 * read the channel list and read replies in its requests' threads, with
 * interactivity pointed at this server and events at <that URL>/events
 * (core/messaging/). Paste it into api.slack.com/apps →
 * Create New App → From a manifest. */
export function slackAppManifest(options: { agentName: string; interactivityUrl: string }): Record<string, unknown> {
  const name = `LoopEngine ${options.agentName}`.slice(0, 35)
  return {
    display_information: { name, description: `Approval requests and questions from the ${options.agentName} agent` },
    features: { bot_user: { display_name: name, always_online: true } },
    oauth_config: { scopes: { bot: ['chat:write', 'channels:read', 'groups:read', 'channels:history', 'groups:history'] } },
    settings: {
      event_subscriptions: { request_url: `${options.interactivityUrl}/events`, bot_events: ['message.channels', 'message.groups'] },
      interactivity: { is_enabled: true, request_url: options.interactivityUrl },
      org_deploy_enabled: false,
      socket_mode_enabled: false,
      token_rotation_enabled: false,
    },
  }
}
