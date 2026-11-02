import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { APP_CATALOG, appCatalog, appServer, connectedApps } from '../core/mcp-apps.js'
import type { WorkspaceAbility } from '../core/workspace-abilities.js'

function linearAbility(): WorkspaceAbility {
  const dir = mkdtempSync(join(tmpdir(), 'loopengine-app-'))
  mkdirSync(join(dir, 'actauth'))
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'mcp-linear', version: '1.0.0', description: 'Linear: issues (made from its MCP server)' }))
  writeFileSync(join(dir, 'loopengine.ability.json'), JSON.stringify({
    loopengineVersion: '*',
    mcp: { url: 'https://mcp.linear.app/mcp', auth: { type: 'key', env: 'LINEAR_MCP_KEY' }, tools: ['list_issues', 'create_issue'], prefix: 'linear' },
    actauth: 'actauth/rules.yml',
    generatedFrom: { server: 'app.linear/linear', url: 'https://mcp.linear.app/mcp', source: 'registry' },
  }))
  writeFileSync(join(dir, 'actauth', 'rules.yml'), '- name: a\n  scope: "*/*"\n  tool: linear_list_issues\n  decision: allow\n- name: b\n  scope: "*/*"\n  tool: linear_create_issue\n  decision: ask\n')
  return { name: 'mcp-linear', description: 'Linear: issues (made from its MCP server)', spec: `file:${dir}`, source: 'mcp:https://mcp.linear.app/mcp', version: '1.0.0', installedAt: '2026-11-02T00:00:00Z' }
}

describe('Apps', () => {
  it('lists workspace abilities made from an MCP server as connected apps, with their tools, key and agents', () => {
    const other: WorkspaceAbility = { name: 'lp-own', description: '', spec: 'file:/nowhere', source: 'github:acme/lp-own', version: '1.0.0', installedAt: '' }
    const connected = connectedApps([linearAbility(), other], { support: ['mcp-linear'], sales: [] }, () => undefined)
    expect(connected).toEqual([expect.objectContaining({
      id: 'app.linear/linear',
      title: 'Linear',
      ability: 'mcp-linear',
      tools: [{ name: 'linear_list_issues', decision: 'allow' }, { name: 'linear_create_issue', decision: 'ask' }],
      keyEnv: 'LINEAR_MCP_KEY',
      keySet: false,
      agents: ['support'],
    })])
  })

  it('marks catalog apps connected', () => {
    const connected = connectedApps([linearAbility()], {}, () => 'set')
    const view = appCatalog(connected)
    expect(view.find((a) => a.id === 'app.linear/linear')?.connected).toBe(true)
    expect(view.find((a) => a.id === 'com.stripe/mcp')?.connected).toBe(false)
  })

  it('has unique ids and https URLs, and serves catalog apps without the registry', async () => {
    expect(new Set(APP_CATALOG.map((a) => a.id)).size).toBe(APP_CATALOG.length)
    expect(APP_CATALOG.every((a) => a.url.startsWith('https://'))).toBe(true)
    expect(await appServer('com.stripe/mcp')).toMatchObject({ title: 'Stripe', url: 'https://mcp.stripe.com', verified: true })
  })
})
