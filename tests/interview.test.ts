import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Message, ModelCall, ModelResponse } from '#core/run-agent.js'
import { FileSchedulerStore, listScheduledTasks, setSchedulerStore } from '#core/scheduler.js'
import { INTERVIEWER_PROMPT, agentNameFrom, rankCandidates, runInterviewTurn, validateCandidate, type AgentCandidate, type InterviewTools } from '#core/system-agents/interviewer.js'

vi.mock('#web/actauth-admin.js', () => ({ setDefaultDecision: vi.fn() }))
const { setDefaultDecision } = await import('#web/actauth-admin.js')
const admin = await import('#web/interview-admin.js')

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'interview-'))
  admin.setInterviewProject(dir)
  setSchedulerStore(new FileSchedulerStore(join(dir, '.scheduler')))
  vi.mocked(setDefaultDecision).mockClear()
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const raw = (over: Record<string, unknown> = {}) => ({
  title: 'Support replies with refunds',
  summary: 'Reads each new ticket, looks up the order, drafts a reply.',
  trigger: { kind: 'event', description: 'each new ticket' },
  hoursPerWeek: 4,
  fit: 7,
  risk: 'medium',
  asksFirst: ['sending a reply', 'refunds'],
  needs: [{ kind: 'ability', name: 'lp-em-freescout', description: 'FreeScout' }, { kind: 'messaging', name: 'Slack', description: 'Slack' }],
  agent: { name: 'Support Replies!', systemPrompt: 'You handle support tickets. Draft, then ask before sending.', exampleMessage: 'A customer was charged twice.' },
  ...over,
})

const tools: InterviewTools = {
  listInstalledAbilities: async () => [{ agent: 'example-agent', name: 'lp-em-freescout' }],
  searchPublicAbilities: async (q) => [{ name: `lp-${q}` }],
  listConnections: async () => ({ modelProvidersWithKey: ['openai'] }),
}

/** A model that plays back a script of responses, recording what it was sent. */
function scripted(responses: ModelResponse['content'][]) {
  const seen: { messages: Message[]; system: string; tools: string[] }[] = []
  const call: ModelCall = async (messages, system, toolList) => {
    seen.push({ messages: [...messages], system, tools: toolList.map((t) => t.name) })
    return { stop_reason: 'end_turn', content: responses.shift() ?? [{ type: 'text', text: '(no more)' }] }
  }
  return { call, seen }
}

describe('the interviewer', () => {
  it('cleans up a candidate, and refuses one missing what a card or an agent needs', () => {
    const c = validateCandidate(raw({ fit: 12, hoursPerWeek: -3, risk: 'extreme', trigger: { kind: 'schedule', description: 'every morning', every: '24h' } }))!
    expect(c.agent.name).toBe('support-replies')
    expect(c.fit).toBe(8)
    expect(c.hoursPerWeek).toBe(0)
    expect(c.risk).toBe('medium')
    expect(c.trigger).toEqual({ kind: 'schedule', description: 'every morning', every: '24h' })
    expect(validateCandidate(raw({ title: '' }))).toBeUndefined()
    expect(validateCandidate(raw({ agent: { name: 'x' } }))).toBeUndefined()
    expect(validateCandidate(raw({ trigger: { kind: 'whenever' } }))).toBeUndefined()
  })

  it('ranks by time back times fit, lower risk first on a tie, at most three', () => {
    const c = (title: string, hoursPerWeek: number, fit: number, risk: AgentCandidate['risk']) => validateCandidate(raw({ title, hoursPerWeek, fit, risk }))!
    const ranked = rankCandidates([c('a', 1, 8, 'low'), c('b', 4, 4, 'high'), c('c', 4, 4, 'low'), c('d', 10, 1, 'low')])
    // c and b both score 16 (c is lower risk), d 10, a 8: a is left out.
    expect(ranked.map((x) => x.title)).toEqual(['c', 'b', 'd'])
  })

  it('makes agent names the scaffold accepts', () => {
    expect(agentNameFrom('Weekly Sales Report (Slack)')).toBe('weekly-sales-report-slack')
    expect(agentNameFrom('***')).toBe('my-agent')
  })

  it('runs a turn through its tools: stage, ability search, candidates, then a reply', async () => {
    const { call, seen } = scripted([
      [{ type: 'tool_use', id: 't1', name: 'set_stage', input: { stage: 'details' } }, { type: 'tool_use', id: 't2', name: 'search_public_abilities', input: { query: 'freescout' } }],
      [{ type: 'tool_use', id: 't3', name: 'save_candidates', input: { candidates: [raw(), raw({ title: 'Daily report', hoursPerWeek: 1, fit: 8, trigger: { kind: 'schedule', description: 'every morning', every: '24h' } }), { title: 'broken' }] } }],
      [{ type: 'text', text: 'Here are two agents worth building.' }],
    ])
    const turn = await runInterviewTurn(call, [], 'That is all, thanks.', tools)
    expect(turn.reply).toBe('Here are two agents worth building.')
    expect(turn.stage).toBe('details')
    expect(turn.candidates?.map((c) => c.title)).toEqual(['Support replies with refunds', 'Daily report'])
    expect(seen[0].system).toBe(INTERVIEWER_PROMPT)
    expect(seen[0].tools).toEqual(['set_stage', 'list_installed_abilities', 'search_public_abilities', 'list_connections', 'save_candidates'])
    // The tool results went back to the model.
    expect(JSON.stringify(seen[1].messages.at(-1))).toContain('lp-freescout')
    expect(turn.newMessages[0]).toEqual({ role: 'user', content: 'That is all, thanks.' })
  })

  it('has no tool that reads, creates or runs anything outside the interview', () => {
    expect(INTERVIEWER_PROMPT).toContain("can't create or run anything")
    expect(INTERVIEWER_PROMPT).toContain('Never ask for passwords, API keys')
  })
})

describe('saved interviews', () => {
  it('starts with the opening, keeps answers and replies, and lists newest first', async () => {
    const iv = admin.startInterview()
    expect(iv.display[0].role).toBe('assistant')
    const { call } = scripted([[{ type: 'tool_use', id: 's', name: 'set_stage', input: { stage: 'tools' } }], [{ type: 'text', text: 'Which tools do you use?' }]])
    const after = await admin.answerInterview(iv.id, '  I run a small shop.  ', call, tools)
    expect(after.display.slice(1)).toEqual([{ role: 'user', text: 'I run a small shop.' }, { role: 'assistant', text: 'Which tools do you use?' }])
    expect(after.stage).toBe('tools')
    expect(admin.getInterview(iv.id).transcript.length).toBe(4)
    expect(admin.listInterviews()[0]).not.toHaveProperty('transcript')
    await expect(admin.answerInterview(iv.id, '  ', call, tools)).rejects.toThrow(/Write an answer/)
    expect(() => admin.getInterview('../../etc')).toThrow(/No such interview/)
    admin.deleteInterview(iv.id)
    expect(admin.listInterviews()).toEqual([])
  })

  it('finishing early ranks what it has without showing the instruction as an answer', async () => {
    const iv = admin.startInterview()
    const { call, seen } = scripted([[{ type: 'tool_use', id: 's', name: 'save_candidates', input: { candidates: [raw()] } }], [{ type: 'text', text: 'Here is one.' }]])
    const done = await admin.finishInterview(iv.id, call, tools)
    expect(done.stage).toBe('done')
    expect(done.candidates).toHaveLength(1)
    expect(done.display.map((m) => m.role)).toEqual(['assistant', 'assistant'])
    expect(String(seen[0].messages.at(-1)?.content)).toContain('chose to finish now')
  })
})

describe('Create this agent', () => {
  async function interviewWith(candidate: Record<string, unknown>) {
    const iv = admin.startInterview()
    const { call } = scripted([[{ type: 'tool_use', id: 's', name: 'save_candidates', input: { candidates: [candidate] } }], [{ type: 'text', text: 'ok' }]])
    return admin.finishInterview(iv.id, call, tools)
  }

  it('previews a free name, the ask-first permissions and what is left to set up', async () => {
    const iv = await interviewWith(raw())
    const preview = admin.previewCandidate(iv.id, 0, { agentExists: (n) => n === 'support-replies' })
    expect(preview.name).toBe('support-replies-2')
    expect(preview.permissions).toMatch(/asks you first.*sending a reply, refunds/)
    expect(preview.checklist).toEqual([
      { label: 'Install the lp-em-freescout ability', href: '/agents/config?agent=support-replies-2&tab=abilities' },
      { label: 'Connect Slack so it can ask you before acting', href: '/agents/config?agent=support-replies-2&tab=messaging' },
    ])
  })

  it('creates the agent, makes unmatched tools ask, and adds a paused schedule for a timed one', async () => {
    const iv = await interviewWith(raw({ title: 'Daily report', trigger: { kind: 'schedule', description: 'every morning', every: '24h' }, agent: { name: 'daily-report', systemPrompt: 'You report.', scheduleMessage: 'Send the daily report.' } }))
    const made: string[] = []
    const created = await admin.createFromCandidate(iv.id, 0, { agentExists: (n) => made.includes(n), createAgent: async (name) => void made.push(name) })
    expect(created.name).toBe('daily-report')
    expect(made).toEqual(['daily-report'])
    expect(setDefaultDecision).toHaveBeenCalledWith('daily-report', 'ask')
    const tasks = await listScheduledTasks({ agent: 'daily-report' })
    expect(tasks.map((t) => [t.status, t.message, t.schedule])).toEqual([['paused', 'Send the daily report.', expect.objectContaining({ every: '24h' })]])
    expect(created.checklist.at(-1)?.label).toMatch(/turn its schedule on/)
    expect(admin.getInterview(iv.id).created).toEqual({ '0': 'daily-report' })
    await expect(admin.createFromCandidate(iv.id, 0, { agentExists: (n) => made.includes(n), createAgent: async () => {} })).rejects.toThrow(/Already created as daily-report/)
  })

  it('keeps the agent when its schedule is invalid, and says so', async () => {
    const iv = await interviewWith(raw({ trigger: { kind: 'schedule', description: 'sometimes', every: 'often' } }))
    const created = await admin.createFromCandidate(iv.id, 0, { agentExists: () => false, createAgent: async () => {} })
    expect(created.scheduleError).toMatch(/not a valid interval/)
    expect(existsSync(join(dir, '.interviews'))).toBe(true)
  })
})
