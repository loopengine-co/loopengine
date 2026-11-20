import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { agentsFor, readPeople, recordVisit, removePerson, setPersonAgents } from '#core/workspace-people.js'

const project = () => mkdtempSync(join(tmpdir(), 'le-people-'))

describe('workspace people', () => {
  it('notes visits by email, writing again only for a new role or after an hour', () => {
    const dir = project()
    const at = new Date('2026-11-20T10:00:00Z')
    recordVisit(dir, 'Jane@Example.com', 'approver', at)
    expect(readPeople(dir)).toEqual([{ email: 'jane@example.com', role: 'approver', seen: at.toISOString() }])
    recordVisit(dir, 'jane@example.com', 'approver', new Date('2026-11-20T10:30:00Z'))
    expect(readPeople(dir)[0].seen).toBe(at.toISOString())
    recordVisit(dir, 'jane@example.com', 'viewer', new Date('2026-11-20T10:31:00Z'))
    expect(readPeople(dir)[0]).toMatchObject({ role: 'viewer', seen: '2026-11-20T10:31:00.000Z' })
  })

  it('limits an approver or viewer to their agents, and never anyone with the full console', () => {
    const dir = project()
    expect(agentsFor(dir, 'approver', 'sam@example.com')).toBeUndefined()
    setPersonAgents(dir, 'sam@example.com', ['cs-agent', 'cs-agent'])
    expect(agentsFor(dir, 'approver', 'SAM@example.com')).toEqual(['cs-agent'])
    expect(agentsFor(dir, 'viewer', 'sam@example.com')).toEqual(['cs-agent'])
    expect(agentsFor(dir, 'editor', 'sam@example.com')).toBeUndefined()
    expect(agentsFor(dir, 'approver', undefined)).toBeUndefined()
    // A visit keeps the list; "every agent" clears it.
    recordVisit(dir, 'sam@example.com', 'approver')
    expect(agentsFor(dir, 'approver', 'sam@example.com')).toEqual(['cs-agent'])
    setPersonAgents(dir, 'sam@example.com', undefined)
    expect(agentsFor(dir, 'approver', 'sam@example.com')).toBeUndefined()
    expect(readPeople(dir)[0].role).toBe('approver')
    removePerson(dir, 'sam@example.com')
    expect(readPeople(dir)).toEqual([])
    expect(JSON.parse(readFileSync(join(dir, '.loopengine', 'people.json'), 'utf8'))).toEqual({ people: [] })
  })
})
