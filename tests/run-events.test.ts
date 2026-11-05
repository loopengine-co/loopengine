import { afterEach, describe, expect, it, vi } from 'vitest'
import { reportRun, setRunObserver, usedTool, type RunEvent } from '#core/run-events.js'

afterEach(() => setRunObserver(undefined))

describe('run events', () => {
  it('does nothing without an observer', () => {
    expect(() => reportRun({ agent: 'a', source: 'workflow', id: 'r1', usedTool: true })).not.toThrow()
  })

  it('tells the observer about each job, with the time', () => {
    const seen: RunEvent[] = []
    setRunObserver((e) => seen.push(e))
    reportRun({ agent: 'support', source: 'message', id: 't1', caller: 'api', usedTool: false })
    expect(seen).toEqual([{ agent: 'support', source: 'message', id: 't1', caller: 'api', usedTool: false, at: expect.any(String) }])
  })

  it("never lets a broken observer fail the job", () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    setRunObserver(() => { throw new Error('boom') })
    expect(() => reportRun({ agent: 'a', source: 'slack', id: 't', usedTool: true })).not.toThrow()
  })

  it('spots a tool call in a turn', () => {
    expect(usedTool([{ role: 'assistant', content: [{ type: 'text', text: 'Hi!' }] }])).toBe(false)
    expect(usedTool([{ role: 'assistant', content: [{ type: 'tool_use', id: 'x', name: 'lookup', input: {} }] }])).toBe(true)
  })
})
