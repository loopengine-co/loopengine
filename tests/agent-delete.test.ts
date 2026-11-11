import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FileSchedulerStore, createScheduledTask, listScheduledTasks, setSchedulerStore } from '#core/scheduler.js'
import { FileTriggerStore, createTrigger, listTriggers, setTriggerStore } from '#core/workflow-triggers.js'
import type { Workflow } from '#core/workflows.js'
import { getEntry, registerAgent, unregisterAgent } from '#core/agent-registry.js'
import { WorkflowError, forgetAgent } from '#web/workflow-admin.js'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'loopengine-agent-delete-'))
  setSchedulerStore(new FileSchedulerStore(dir))
  setTriggerStore(new FileTriggerStore(dir))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const workflow: Workflow = { id: 'daily', title: 'Daily', description: 'Daily report', startMessage: 'Report.', trigger: 'Every day', parameters: {}, steps: 'Steps.' }

describe('deleting an agent', () => {
  it("removes its folder, schedules and webhooks, and leaves other agents' alone", async () => {
    const agentDir = join(dir, 'agents', 'helper')
    mkdirSync(join(agentDir, 'skills'), { recursive: true })
    writeFileSync(join(agentDir, 'index.ts'), 'export const config = {}\n')
    await createScheduledTask({ agent: 'helper', message: 'Report.', schedule: { every: '1d' } })
    await createScheduledTask({ agent: 'other', message: 'Report.', schedule: { every: '1d' } })
    await createTrigger('helper', workflow, {})
    await createTrigger('other', workflow, {})

    expect(await forgetAgent('helper', agentDir)).toEqual({ schedules: 1, webhooks: 1 })
    expect(existsSync(agentDir)).toBe(false)
    expect(await listScheduledTasks({ agent: 'helper' })).toEqual([])
    expect(await listTriggers('helper')).toEqual([])
    expect(await listScheduledTasks({ agent: 'other' })).toHaveLength(1)
    expect(await listTriggers('other')).toHaveLength(1)
  })

  it('refuses an agent written as a single file, touching nothing', async () => {
    await createScheduledTask({ agent: 'coded', message: 'Report.', schedule: { every: '1d' } })
    await expect(forgetAgent('coded', join(dir, 'agents', 'coded'))).rejects.toThrow(WorkflowError)
    expect(await listScheduledTasks({ agent: 'coded' })).toHaveLength(1)
  })

  it('takes it out of the live registry', () => {
    const name = 'agent-delete-test-fixture-agent'
    registerAgent({ config: { name, systemPrompt: 'fixture' }, createModelCall: () => { throw new Error('not called') } })
    expect(unregisterAgent(name)).toBe(true)
    expect(getEntry(name)).toBeUndefined()
    expect(unregisterAgent(name)).toBe(false)
  })
})
