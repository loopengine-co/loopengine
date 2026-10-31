import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readAbilityDetails, readToolDefinitions } from '#core/ability-details.js'
import { abilityDetails } from '#web/ability-details-admin.js'

let dir: string
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'le-details-')) })
afterEach(() => rmSync(dir, { recursive: true, force: true }))

function write(path: string, content: string) {
  mkdirSync(join(dir, path, '..'), { recursive: true })
  writeFileSync(join(dir, path), content)
}

const TOOL = `import type { ToolDefinition } from 'loopengine'
const helper = { name: 'not-a-tool', description: 'a helper object without a schema' }
export const createIssue: ToolDefinition = {
  name: 'github_create_issue',
  description:
    'Open a new issue. ' +
    "By default a person approves this first.",
  input_schema: {
    type: 'object',
    properties: { title: { type: 'string', description: 'A short title.' } },
  },
  execute: async () => ({ ok: true }),
}
`

describe('reading a tool file without running it', () => {
  it("takes the ToolDefinition's name and description, joining concatenated strings, and skips schema properties and helpers", () => {
    expect(readToolDefinitions(TOOL)).toEqual([{ name: 'github_create_issue', description: 'Open a new issue. By default a person approves this first.' }])
  })

  it('reads several definitions in one file, and a template string', () => {
    const two = TOOL + "export const other = { name: 'other_tool', description: `Does the other thing.`, input_schema: { type: 'object' } }\n"
    expect(readToolDefinitions(two).map((t) => t.name)).toEqual(['github_create_issue', 'other_tool'])
  })
})

describe("what an ability can do", () => {
  beforeEach(() => {
    write('package.json', JSON.stringify({ name: 'lp-demo', version: '1.4.0', description: 'A demo ability' }))
    write('loopengine.ability.json', JSON.stringify({
      tools: ['tools/github_create_issue.ts', 'tools/computed.ts'],
      skills: ['skills/demo-skill', 'skills/bare-skill'],
      actauth: 'actauth/rules.yml',
      env: [{ name: 'DEMO_TOKEN', description: 'The API token.', secret: true }, 'DEMO_REGION'],
    }))
    write('tools/github_create_issue.ts', TOOL)
    // A name built at runtime can't be read statically: listed by its file name.
    write('tools/computed.ts', "const n = 'computed'\nexport const t = { name: n + '_tool', description: 'x', input_schema: {} }\n")
    write('actauth/rules.yml', '- name: ask-first\n  scope: "*/*"\n  tool: github_create_issue\n  decision: ask\n')
    write('skills/demo-skill/SKILL.md', '---\nname: demo-skill\ndescription: When and how to use the demo tools.\n---\n\n# Demo\n')
    write('skills/bare-skill/SKILL.md', '# No frontmatter\n')
  })

  it('lists its tools with the permission each ships with, its skills, and the settings it reads', () => {
    expect(readAbilityDetails(dir)).toEqual({
      name: 'lp-demo',
      version: '1.4.0',
      description: 'A demo ability',
      tools: [
        { name: 'github_create_issue', description: 'Open a new issue. By default a person approves this first.', decision: 'ask' },
        { name: 'computed', description: '' },
      ],
      skills: [
        { name: 'demo-skill', description: 'When and how to use the demo tools.' },
        { name: 'bare-skill', description: '' },
      ],
      settings: [{ name: 'DEMO_TOKEN', description: 'The API token.' }, { name: 'DEMO_REGION' }],
    })
  })

  it('reads a local folder in place, and fetches anything else once, cleaning up after itself', async () => {
    expect((await abilityDetails(`file:${dir}`)).name).toBe('lp-demo')

    let fetched = 0
    const copy = mkdtempSync(join(tmpdir(), 'le-details-fetch-'))
    const fetchDir = async () => {
      fetched++
      const pkgDir = join(copy, 'package')
      mkdirSync(pkgDir, { recursive: true })
      for (const f of ['package.json', 'loopengine.ability.json']) writeFileSync(join(pkgDir, f), readFileSync(join(dir, f)))
      return pkgDir
    }
    const first = await abilityDetails('lp-demo-fetched@1.4.0', { fetchDir })
    const second = await abilityDetails('lp-demo-fetched@1.4.0', { fetchDir })
    expect(first.name).toBe('lp-demo')
    expect(second).toEqual(first)
    expect(fetched).toBe(1)
  })

  it('refuses a package that is not an ability', () => {
    rmSync(join(dir, 'loopengine.ability.json'))
    expect(() => readAbilityDetails(dir)).toThrow(/isn't a loopengine ability/)
  })
})

