import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  readActauthConfig,
  addActauthRule,
  updateActauthRule,
  removeActauthRule,
  setDefaultDecision,
  ActauthRuleExistsError,
  ActauthRuleNotFoundError,
  applyPlannedRules,
} from '../web/actauth-admin.js'

// Same fixture-agent-under-the-real-agents-dir approach as
// tests/gateway-tools.test.ts.
const AGENT_NAME = 'actauth-admin-fixture-agent'
const AGENT_DIR = join(process.cwd(), 'agents', AGENT_NAME)

afterEach(() => {
  rmSync(AGENT_DIR, { recursive: true, force: true })
})

describe('readActauthConfig', () => {
  it('defaults to deny/[] when actauth.yml does not exist', () => {
    expect(readActauthConfig(AGENT_NAME)).toEqual({ defaultDecision: 'deny', rules: [] })
  })
})

describe('addActauthRule / updateActauthRule / removeActauthRule', () => {
  it('addActauthRule appends a rule that readActauthConfig then returns', () => {
    addActauthRule(AGENT_NAME, { name: 'read-allowed', scope: 'default/production', tool: 'read_file', decision: 'allow' })
    expect(readActauthConfig(AGENT_NAME)).toEqual({
      defaultDecision: 'deny',
      rules: [{ name: 'read-allowed', scope: 'default/production', tool: 'read_file', decision: 'allow' }],
    })
  })

  it('rejects a duplicate rule name', () => {
    addActauthRule(AGENT_NAME, { name: 'dup', scope: 'default/production', tool: 'read_file', decision: 'allow' })
    expect(() => addActauthRule(AGENT_NAME, { name: 'dup', scope: '*/*', tool: 'write_file', decision: 'deny' })).toThrow(ActauthRuleExistsError)
  })

  it('updateActauthRule mutates scope/tool/decision of an existing rule by name', () => {
    addActauthRule(AGENT_NAME, { name: 'r1', scope: 'default/production', tool: 'read_file', decision: 'allow' })
    updateActauthRule(AGENT_NAME, 'r1', { scope: '*/*', tool: 'write_file', decision: 'ask' })
    expect(readActauthConfig(AGENT_NAME).rules).toEqual([{ name: 'r1', scope: '*/*', tool: 'write_file', decision: 'ask' }])
  })

  it('updateActauthRule throws ActauthRuleNotFoundError for an unknown name', () => {
    expect(() => updateActauthRule(AGENT_NAME, 'nope', { scope: '*/*', tool: 'x', decision: 'ask' })).toThrow(ActauthRuleNotFoundError)
  })

  it('removeActauthRule drops the rule by name', () => {
    addActauthRule(AGENT_NAME, { name: 'r1', scope: 'default/production', tool: 'read_file', decision: 'allow' })
    addActauthRule(AGENT_NAME, { name: 'r2', scope: 'default/production', tool: 'write_file', decision: 'ask' })
    removeActauthRule(AGENT_NAME, 'r1')
    expect(readActauthConfig(AGENT_NAME).rules).toEqual([{ name: 'r2', scope: 'default/production', tool: 'write_file', decision: 'ask' }])
  })

  it('removeActauthRule throws ActauthRuleNotFoundError for an unknown name', () => {
    expect(() => removeActauthRule(AGENT_NAME, 'nope')).toThrow(ActauthRuleNotFoundError)
  })

  it('setDefaultDecision updates default_decision without touching rules', () => {
    addActauthRule(AGENT_NAME, { name: 'r1', scope: 'default/production', tool: 'read_file', decision: 'allow' })
    setDefaultDecision(AGENT_NAME, 'allow')
    expect(readActauthConfig(AGENT_NAME)).toEqual({
      defaultDecision: 'allow',
      rules: [{ name: 'r1', scope: 'default/production', tool: 'read_file', decision: 'allow' }],
    })
  })

  it('preserves comments and hand-authored rules untouched by an edit elsewhere in the file', () => {
    mkdirSync(AGENT_DIR, { recursive: true })
    writeFileSync(
      join(AGENT_DIR, 'actauth.yml'),
      'default_decision: ask\n\nrules:\n  # hand-written reasoning for this rule\n  - name: hand-written\n    scope: default/production\n    tool: read_file\n    decision: allow\n',
    )

    addActauthRule(AGENT_NAME, { name: 'new-rule', scope: '*/*', tool: 'write_file', decision: 'deny' })

    const raw = readFileSync(join(AGENT_DIR, 'actauth.yml'), 'utf8')
    expect(raw).toContain('# hand-written reasoning for this rule')
    expect(readActauthConfig(AGENT_NAME).rules).toEqual([
      { name: 'hand-written', scope: 'default/production', tool: 'read_file', decision: 'allow' },
      { name: 'new-rule', scope: '*/*', tool: 'write_file', decision: 'deny' },
    ])
  })
})

describe('applyPlannedRules: a plan\'s permissions, after its abilities have added theirs', () => {
  const rules = () => readActauthConfig(AGENT_NAME).rules.map((r) => `${r.name}:${r.tool}:${r.decision}`)

  it("adds a rule named after the tool for one that has none, and nothing for one an ability already set the same", () => {
    addActauthRule(AGENT_NAME, { name: 'mcp-firecrawl-firecrawl-scrape', scope: '*/*', tool: 'firecrawl_scrape', decision: 'allow' })
    const result = applyPlannedRules(AGENT_NAME, [
      { tool: 'firecrawl_scrape', decision: 'allow' },
      { tool: 'send_email', decision: 'ask' },
    ])
    expect(result).toEqual({ added: ['send_email'], unchanged: ['firecrawl_scrape'], kept: [] })
    expect(rules()).toEqual(['mcp-firecrawl-firecrawl-scrape:firecrawl_scrape:allow', 'send_email:send_email:ask'])
  })

  it('puts a stricter rule just above the one it overrides, so it decides', () => {
    addActauthRule(AGENT_NAME, { name: 'first', scope: '*/*', tool: 'web_search', decision: 'allow' })
    addActauthRule(AGENT_NAME, { name: 'stripe-issue-refund', scope: '*/*', tool: 'issue_refund', decision: 'allow' })
    const result = applyPlannedRules(AGENT_NAME, [{ tool: 'issue_refund', decision: 'ask' }])
    expect(result.added).toEqual(['issue_refund'])
    expect(rules()).toEqual(['first:web_search:allow', 'issue_refund:issue_refund:ask', 'stripe-issue-refund:issue_refund:allow'])
  })

  it("never loosens a decision the agent already has, and says so", () => {
    addActauthRule(AGENT_NAME, { name: 'payouts', scope: '*/*', tool: 'send_payout', decision: 'ask' })
    expect(applyPlannedRules(AGENT_NAME, [{ tool: 'send_payout', decision: 'allow' }])).toEqual({ added: [], unchanged: [], kept: [{ tool: 'send_payout', has: 'ask', wants: 'allow' }] })
    expect(rules()).toEqual(['payouts:send_payout:ask'])
  })

  it('keeps a template\'s own rule name, and makes a taken one unique', () => {
    addActauthRule(AGENT_NAME, { name: 'send_email', scope: 'acme/production', tool: 'other_tool', decision: 'deny' })
    applyPlannedRules(AGENT_NAME, [{ tool: 'send_email', decision: 'ask' }, { name: 'gmail-search', tool: 'gmail_search', decision: 'allow' }])
    expect(rules()).toEqual(['send_email:other_tool:deny', 'send_email-2:send_email:ask', 'gmail-search:gmail_search:allow'])
  })
})
