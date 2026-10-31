// Backs the console's ability details: what an ability can do (its tools,
// what each one does and its permission, and its skills), for one found
// on npm or in a private source, or one already installed in an agent.
import { rmSync } from 'node:fs'
import { dirname } from 'node:path'
import { fetchAbilityDirAsync } from '../bin/ability-manager.js'
import { readAbilityDetails, type AbilityDetails, type Decision } from '../core/ability-details.js'
import { readActauthConfig } from './actauth-admin.js'

export interface AbilityDetailsView extends AbilityDetails {
  tools: Array<AbilityDetails['tools'][number] & { agentDecision?: Decision }>
  /** Set when the permissions shown are this agent's own. */
  agent?: string
}

const TTL_MS = 10 * 60 * 1000
const cache = new Map<string, { at: number; details: AbilityDetails }>()

/** What the ability at `spec` can do. A local folder (file:) is read in
 * place, fresh each time; anything else is fetched like an install would
 * (a private source's token included) and cached for ten minutes. With
 * `agent`, each tool also carries that agent's current decision: its
 * first rule for the tool, else its default. */
export async function abilityDetails(spec: string, options: { agent?: string; fetchDir?: (spec: string) => Promise<string> } = {}): Promise<AbilityDetailsView> {
  let details: AbilityDetails
  if (spec.startsWith('file:')) {
    details = readAbilityDetails(spec.slice('file:'.length))
  } else {
    const cached = cache.get(spec)
    if (cached && Date.now() - cached.at < TTL_MS) {
      details = cached.details
    } else {
      const dir = await (options.fetchDir ?? fetchAbilityDirAsync)(spec)
      try {
        details = readAbilityDetails(dir)
      } finally {
        rmSync(dirname(dir), { recursive: true, force: true })
      }
      cache.set(spec, { at: Date.now(), details })
    }
  }
  if (!options.agent) return details
  const { rules, defaultDecision } = readActauthConfig(options.agent)
  return {
    ...details,
    agent: options.agent,
    tools: details.tools.map((tool) => ({ ...tool, agentDecision: (rules.find((r) => r.tool === tool.name)?.decision ?? defaultDecision) as Decision })),
  }
}
