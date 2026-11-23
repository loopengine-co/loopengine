import { describe, expect, it } from 'vitest'
import { homeOverview, type WorkflowOverviewRow, type WorkflowsOverview } from '../web/workflows-overview.js'

const row = (agent: string, id: string, starts: string[]): WorkflowOverviewRow => ({ agent, agentLabel: agent, id, title: id, starts, live: true, runsThisWeek: 0, failedThisWeek: 0, waiting: 0, approved: 0, refused: 0 })
const overview: WorkflowsOverview = {
  workflows: [row('sales', 'outreach-draft', ['Run now']), row('growth', 'lead-scan', ['Mondays at 09:00']), row('support', 'faq-reply', ['1 webhook'])],
  summary: { workflows: 3, runsThisWeek: 0, failedThisWeek: 0, waiting: 0 },
}
const job = (over: Record<string, unknown>) => ({ id: 'j', title: 'T', kind: 'recurring' as const, measure: 'm', state: 'active' as const, agent: { name: 'growth', isNew: false }, doers: [], ...over })

describe('homeOverview', () => {
  it('puts each workflow under its job, a chained one right after the one that starts it, and lists the rest apart', () => {
    const d = homeOverview(overview, [
      {
        id: 'g-1', goal: 'Grow users to 100', brief: { measure: 'signed-up users' },
        jobs: [
          job({ id: 'j-1', doers: [{ type: 'workflow', agent: 'sales', workflowId: 'outreach-draft', title: 'Outreach draft', at: '' }, { type: 'workflow', agent: 'growth', workflowId: 'lead-scan', title: 'Lead scan', at: '' }], chain: [{ id: 's', after: { agent: 'growth', workflowId: 'lead-scan' }, when: { kind: 'always' }, run: { agent: 'sales', workflowId: 'outreach-draft' }, with: {} }] }),
          job({ id: 'j-2', state: 'suggested' }),
          job({ id: 'j-3', state: 'discarded', addedAt: 'x' }),
        ],
      },
      { id: 'g-my-jobs', goal: '', standalone: true, jobs: [job({ id: 'j-4', kind: 'once', state: 'suggested', doers: [{ type: 'workflow', agent: 'old', workflowId: 'gone-one', title: 'x', at: '' }] })] },
    ] as never)
    expect(d.goals).toHaveLength(1)
    expect(d.goals[0]).toMatchObject({ goal: 'Grow users to 100', measure: 'signed-up users' })
    expect(d.goals[0]!.jobs.map((j) => j.id)).toEqual(['j-1'])
    expect(d.goals[0]!.jobs[0]!.flows.map((f) => [f.id, f.then, f.starts])).toEqual([['lead-scan', false, ['Mondays at 09:00']], ['outreach-draft', true, ['Run now']]])
    expect(d.jobs.map((j) => j.id)).toEqual(['j-4'])
    expect(d.jobs[0]!.flows[0]).toMatchObject({ id: 'gone-one', gone: true })
    expect(d.loose.map((r) => r.id)).toEqual(['faq-reply'])
  })
})
