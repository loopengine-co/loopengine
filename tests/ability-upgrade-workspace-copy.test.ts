import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { installAbility, upgradeAbility } from '../bin/ability-manager.js'

// A private ability is copied into the workspace (abilities/<name>) and
// each agent installs that copy as file:<folder>. Updating the copy
// replaces it in place, so the agent's Upgrade must fetch the copy again
// (not the bare name from public npm, which the official-ability check
// refuses) and can't refetch the old version as its merge base.
const AGENT_NAME = 'ability-upgrade-workspace-copy-agent'
const AGENT_DIR = join(process.cwd(), 'agents', AGENT_NAME)
let copyDir: string

function writeVersion(version: string, toolBody: string, skillBody: string): void {
  rmSync(copyDir, { recursive: true, force: true })
  mkdirSync(join(copyDir, 'tools'), { recursive: true })
  mkdirSync(join(copyDir, 'skills', 'copy-skill'), { recursive: true })
  mkdirSync(join(copyDir, 'actauth'), { recursive: true })
  writeFileSync(join(copyDir, 'tools', 'copy_tool.ts'), `export const copyTool = { name: 'copy_tool', execute: async () => '${toolBody}' }\n`)
  writeFileSync(join(copyDir, 'skills', 'copy-skill', 'SKILL.md'), `---\nname: copy-skill\ndescription: "A skill"\n---\n\n${skillBody}\n`)
  writeFileSync(join(copyDir, 'actauth', 'rules.yml'), `- name: copy-tool-allowed\n  scope: "*/*"\n  tool: copy_tool\n  decision: allow\n`)
  writeFileSync(join(copyDir, 'package.json'), JSON.stringify({ name: 'lp-private-copy', version, private: true }))
  writeFileSync(join(copyDir, 'loopengine.ability.json'), JSON.stringify({ loopengineVersion: '*', tools: ['tools/copy_tool.ts'], skills: ['skills/copy-skill'], actauth: 'actauth/rules.yml' }))
}

beforeEach(() => {
  delete process.env.LOOPENGINE_ALLOW_UNOFFICIAL_ABILITIES
  copyDir = join(mkdtempSync(join(tmpdir(), 'loopengine-ws-copy-')), 'lp-private-copy')
})

afterEach(() => {
  rmSync(AGENT_DIR, { recursive: true, force: true })
  rmSync(join(copyDir, '..'), { recursive: true, force: true })
})

describe('upgrading an agent from an updated workspace copy', () => {
  it('fetches the copy again and takes its new files', async () => {
    writeVersion('1.0.0', 'v1', 'Skill v1')
    await installAbility(AGENT_NAME, `file:${copyDir}`)
    writeVersion('1.0.1', 'v2', 'Skill v2')

    const { files } = await upgradeAbility(AGENT_NAME, 'lp-private-copy')

    expect(files).toContainEqual({ path: 'tools/copy_tool.ts', status: 'updated' })
    expect(files).toContainEqual({ path: 'skills/copy-skill/SKILL.md', status: 'updated' })
    expect(readFileSync(join(AGENT_DIR, 'tools', 'copy_tool.ts'), 'utf8')).toContain("'v2'")
    const provenance = JSON.parse(readFileSync(join(AGENT_DIR, '.loopengine-abilities.json'), 'utf8'))
    expect(provenance['lp-private-copy'].version).toBe('1.0.1')
    expect(provenance['lp-private-copy'].spec).toBe(`file:${copyDir}`)
  })

  it('leaves a file edited since install alone and reports it', async () => {
    writeVersion('1.0.0', 'v1', 'Skill v1')
    await installAbility(AGENT_NAME, `file:${copyDir}`)
    writeFileSync(join(AGENT_DIR, 'tools', 'copy_tool.ts'), `export const copyTool = { name: 'copy_tool', execute: async () => 'mine' }\n`)
    writeVersion('1.0.1', 'v2', 'Skill v2')

    const { files } = await upgradeAbility(AGENT_NAME, 'lp-private-copy')

    expect(files).toContainEqual({ path: 'tools/copy_tool.ts', status: 'conflict' })
    expect(files).toContainEqual({ path: 'skills/copy-skill/SKILL.md', status: 'updated' })
    expect(readFileSync(join(AGENT_DIR, 'tools', 'copy_tool.ts'), 'utf8')).toContain("'mine'")
  })
})
