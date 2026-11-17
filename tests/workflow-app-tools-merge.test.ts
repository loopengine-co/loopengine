import { describe, expect, it } from 'vitest'
import { prepareMcpAbilities } from '#web/workflow-admin.js'
import type { WorkflowPlan } from '#core/system-agents/workflow-planner.js'

describe("an app the agent already has, used by several steps", () => {
  it("keeps the tools other steps turn on when its app steps are prepared", async () => {
    const plan = {
      name: 'Dispute evidence', summary: 's', skill: { description: 'd', body: 'b' }, rules: [], gaps: [],
      steps: [
        { title: 'Read the API details', kind: 'tool', tool: 'stripe_api_details' },
        { title: 'Submit the evidence', kind: 'approval', tool: 'submit_dispute', mcp: 'stripe' },
      ],
      // The first step was resolved to one of the agent's Stripe tools.
      apps: [{ id: 'stripe', title: 'Stripe', tools: ['stripe_api_details'] }],
      mcpServers: [{ id: 'stripe', title: 'Stripe', url: 'https://mcp.stripe.com', description: '', verified: true, source: 'saved', ability: 'mcp-stripe', keyEnv: 'STRIPE_KEY', keySet: true }],
    } as unknown as WorkflowPlan
    const existing = { spec: 'file:/ws/abilities/mcp-stripe', tools: ['stripe_api_details', 'submit_dispute'].map((t) => ({ remote: t, name: t })) }
    await prepareMcpAbilities(plan, { existingFor: () => existing } as never)
    expect(plan.apps).toEqual([{ id: 'stripe', title: 'Stripe', tools: ['stripe_api_details', 'submit_dispute'] }])
  })
})
