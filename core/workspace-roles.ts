// Who may do what in a workspace. A hosted workspace gets each person's
// role from the router's signed identity (core/trusted-proxy.ts), as the
// control plane set it for them; a self-hosted one has a single admin
// (Basic Auth, or no sign-in), who is the owner.
//
//   owner, admin  everything in the workspace
//   editor        everything in the workspace (inviting people and API keys
//                 are in the dashboard, for owners and admins)
//   approver      the Inbox only: see cases, answer questions, approve or
//                 deny
//   viewer        the Inbox only, read-only
//
// An API key's role is "api": a program with full access. A role this
// version doesn't know is treated as viewer, the least it can do.

export type WorkspaceRole = 'owner' | 'admin' | 'editor' | 'approver' | 'viewer' | 'api'

const KNOWN: WorkspaceRole[] = ['owner', 'admin', 'editor', 'approver', 'viewer', 'api']

export function workspaceRole(raw: string | undefined): WorkspaceRole {
  if (raw === undefined) return 'owner'
  return KNOWN.includes(raw as WorkspaceRole) ? (raw as WorkspaceRole) : 'viewer'
}

/** May answer questions and approve or deny tool calls. */
export function canDecide(role: WorkspaceRole): boolean {
  return role !== 'viewer'
}

/** Sees only the Inbox. */
export function inboxOnly(role: WorkspaceRole): boolean {
  return role === 'approver' || role === 'viewer'
}

/** The agents a caller may see, or undefined for every agent: only an
 * approver or viewer is ever limited, to the agents their signed identity
 * lists (chosen in the host's dashboard). */
export function agentsFor(role: WorkspaceRole, agents: unknown): string[] | undefined {
  if (!inboxOnly(role) || !Array.isArray(agents)) return undefined
  return agents.filter((a): a is string => typeof a === 'string')
}

/** A role's name for people. */
export function roleLabel(role: WorkspaceRole): string {
  return role === 'api' ? 'API key' : role.charAt(0).toUpperCase() + role.slice(1)
}

/** What an Inbox-only role may reach: the Inbox and its data, deciding
 * (refused later for a viewer), and the console's sign-in line. */
export function inboxOnlyAllows(method: string, pathname: string): boolean {
  if (pathname === '/inbox' || pathname.startsWith('/inbox/')) return true
  if (method === 'GET' && /^\/cases\/[^/]+$/.test(pathname)) return true
  if (method === 'POST' && /^\/pending-(approvals\/[^/]+\/resolve|questions\/[^/]+\/answer)$/.test(pathname)) return true
  if (method === 'GET' && (pathname === '/config/settings' || pathname === '/healthz')) return true
  return false
}
