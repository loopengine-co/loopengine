// Setting up an agent's Slack app from the console: the channel picker,
// the people picker for approvers, and the app manifest it shows.

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

export interface SlackMember {
  id: string
  /** Display name, else real name, else the Slack handle. */
  name: string
}

/** The people in a channel (bots and deactivated accounts left out),
 * for picking approvers. Needs channels:read or groups:read, and
 * users:read for their names. */
export async function listSlackChannelMembers(botToken: string, channel: string): Promise<SlackMember[]> {
  const ids: string[] = []
  let cursor = ''
  for (let page = 0; page < 5; page++) {
    const params = new URLSearchParams({ channel, limit: '200' })
    if (cursor) params.set('cursor', cursor)
    const res = await fetch(`https://slack.com/api/conversations.members?${params}`, { headers: { Authorization: `Bearer ${botToken}` } })
    const body = (await res.json()) as { ok: boolean; error?: string; members?: string[]; response_metadata?: { next_cursor?: string } }
    if (!body.ok) throw new Error(slackSetupError(body.error))
    ids.push(...(body.members ?? []))
    cursor = body.response_metadata?.next_cursor ?? ''
    if (!cursor) break
  }
  const members: SlackMember[] = []
  for (let i = 0; i < ids.length && i < 300; i += 20) {
    const batch = await Promise.all(
      ids.slice(i, i + 20).map(async (id) => {
        const res = await fetch(`https://slack.com/api/users.info?${new URLSearchParams({ user: id })}`, { headers: { Authorization: `Bearer ${botToken}` } })
        return (await res.json()) as { ok: boolean; error?: string; user?: { id: string; name?: string; deleted?: boolean; is_bot?: boolean; real_name?: string; profile?: { display_name?: string; real_name?: string } } }
      }),
    )
    for (const body of batch) {
      if (!body.ok) throw new Error(slackSetupError(body.error))
      const u = body.user
      if (!u || u.deleted || u.is_bot || u.id === 'USLACKBOT') continue
      members.push({ id: u.id, name: u.profile?.display_name || u.real_name || u.profile?.real_name || u.name || u.id })
    }
  }
  return members.sort((a, b) => a.name.localeCompare(b.name))
}

function slackSetupError(error: string | undefined): string {
  const reasons: Record<string, string> = {
    missing_scope: 'The Slack app is missing a scope (users:read lists people by name); paste the manifest from this tab into the app again and reinstall it',
    invalid_auth: 'Slack rejected the bot token; copy the Bot User OAuth Token (xoxb-...) again',
    not_authed: 'Enter the bot token first',
    channel_not_found: 'Slack can\'t find the channel; pick it again and save, and invite the bot to it',
    not_in_channel: 'Invite the bot to the channel first: /invite @its-name',
  }
  return reasons[error ?? ''] ?? `Slack said: ${error}`
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
    oauth_config: { scopes: { bot: ['chat:write', 'channels:read', 'groups:read', 'channels:history', 'groups:history', 'users:read'] } },
    settings: {
      event_subscriptions: { request_url: `${options.interactivityUrl}/events`, bot_events: ['message.channels', 'message.groups'] },
      interactivity: { is_enabled: true, request_url: options.interactivityUrl },
      org_deploy_enabled: false,
      socket_mode_enabled: false,
      token_rotation_enabled: false,
    },
  }
}
