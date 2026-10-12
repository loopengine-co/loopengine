import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FileSchedulerStore, createScheduledTask, getScheduledTask, listScheduledTasks, setSchedulerStore } from '#core/scheduler.js'
import { createScheduleTools } from '#core/system-tools/index.js'
import { runAgent, type Message, type ModelCall, type ModelResponse } from '#core/run-agent.js'
import type { AgentConfig, ToolDefinition } from '#core/agent-config.js'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'loopengine-schedule-tools-'))
  setSchedulerStore(new FileSchedulerStore(dir))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
  delete process.env.LOOPENGINE_SCHEDULER_MAX_PER_AGENT
})

const ctx = {} as Parameters<ToolDefinition['execute']>[1]
function tools(agent: string) {
  const byName = Object.fromEntries(createScheduleTools(agent).map((t) => [t.name, t]))
  return (name: string, input: Record<string, unknown>) => byName[name]!.execute(input, ctx).then((r) => JSON.parse(String(r)))
}

describe('built-in scheduling tools', () => {
  it('schedule for the calling agent only, and treat another agent’s task as missing', async () => {
    const alice = tools('alice')
    const created = await alice('system_schedule_task', { message: 'check the queue', schedule: { every: '1h' }, task_name: 'queue' })
    expect((await getScheduledTask(created.task_id))?.agent).toBe('alice')
    const bobs = await createScheduledTask({ agent: 'bob', message: 'bob only', schedule: { every: '1h' } })

    const listed = await alice('system_list_scheduled_tasks', {})
    expect(listed.map((t: { task_id: string }) => t.task_id)).toEqual([created.task_id])
    await expect(alice('system_check_scheduled_task', { task_id: bobs.task_id })).rejects.toThrow(/no scheduled task/)
    await expect(alice('system_cancel_scheduled_task', { task_id: bobs.task_id })).rejects.toThrow(/no scheduled task/)
    expect((await getScheduledTask(bobs.task_id))?.status).toBe('scheduled')

    expect(await alice('system_cancel_scheduled_task', { task_id: created.task_id })).toMatchObject({ status: 'cancelled' })
    expect(await alice('system_check_scheduled_task', { task_id: created.task_id })).toMatchObject({ status: 'cancelled', agent: 'alice' })
  })

  it('cap active tasks per agent, counting only that agent’s', async () => {
    process.env.LOOPENGINE_SCHEDULER_MAX_PER_AGENT = '2'
    const alice = tools('alice')
    await createScheduledTask({ agent: 'bob', message: 'x', schedule: { every: '1h' } })
    const first = await alice('system_schedule_task', { message: 'one', schedule: { every: '1h' } })
    await alice('system_schedule_task', { message: 'two', schedule: { every: '1h' } })
    await expect(alice('system_schedule_task', { message: 'three', schedule: { every: '1h' } })).rejects.toThrow(/limit is 2/)
    await alice('system_cancel_scheduled_task', { task_id: first.task_id })
    await alice('system_schedule_task', { message: 'three', schedule: { every: '1h' } })
    expect(await listScheduledTasks({ agent: 'alice' })).toHaveLength(3)
  })

  it('pass schedule validation errors back to the model', async () => {
    await expect(tools('alice')('system_schedule_task', { message: 'x', schedule: { every: '5s' } })).rejects.toThrow(/too short/)
  })
})

describe('scheduling tools in runAgent', () => {
  const config = (overrides: Partial<AgentConfig> = {}): AgentConfig => ({
    name: 'sched-fixture',
    systemPrompt: 'test',
    tools: [],
    rules: [],
    defaultDecision: 'deny',
    skillsDirs: [],
    ...overrides,
  })
  const text = (t: string): ModelResponse => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: t }] })

  it('are always allowed, even under defaultDecision deny', async () => {
    let call = 0
    const modelCall: ModelCall = vi.fn(async () =>
      ++call === 1
        ? { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 't1', name: 'system_schedule_task', input: { message: 'ping', schedule: { every: '1d' } } }] }
        : text('scheduled'),
    )
    const result = await runAgent(config(), modelCall, 'remind me daily')
    expect(result.text).toBe('scheduled')
    expect(await listScheduledTasks({ agent: 'sched-fixture' })).toHaveLength(1)
    const second = (modelCall as ReturnType<typeof vi.fn>).mock.calls[1][0] as Message[]
    expect(JSON.stringify(second)).toContain('next_run_at')
  })

  it('are left out with selfScheduling: false', async () => {
    const modelCall: ModelCall = vi.fn(async () => text('ok'))
    await runAgent(config({ selfScheduling: false }), modelCall, 'hi')
    const names = (modelCall as ReturnType<typeof vi.fn>).mock.calls[0][2].map((t: { name: string }) => t.name)
    expect(names).not.toContain('system_schedule_task')
    expect(names).toContain('system_ask_user')
  })
})
