import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDecisionToken, decideLinkMaker, decidePath, verifyDecisionToken } from '#core/approval-links.js'

afterEach(() => vi.unstubAllEnvs())

describe('decision links', () => {
  it('round-trips a pendingId and kind, with an expiry about 7 days out', () => {
    vi.stubEnv('LOOPENGINE_LINK_SECRET', 'test-secret')
    const now = Date.now()
    const verified = verifyDecisionToken(createDecisionToken('p-1', 'approval', now), now)
    expect(verified).toMatchObject({ pendingId: 'p-1', kind: 'approval' })
    expect(verified!.expiresAt - now).toBe(7 * 24 * 3_600_000)
  })

  it('rejects a tampered, foreign-secret or expired token', () => {
    vi.stubEnv('LOOPENGINE_LINK_SECRET', 'test-secret')
    const now = Date.now()
    const token = createDecisionToken('p-1', 'question', now)
    const [body, sig] = token.split('.')
    const forged = Buffer.from(JSON.stringify({ p: 'p-2', k: 'question', exp: now + 1e9 })).toString('base64url')
    expect(verifyDecisionToken(`${forged}.${sig}`, now)).toBeNull()
    expect(verifyDecisionToken('garbage', now)).toBeNull()
    expect(verifyDecisionToken(token, now + 8 * 24 * 3_600_000)).toBeNull()
    vi.stubEnv('LOOPENGINE_LINK_SECRET', 'other-secret')
    expect(verifyDecisionToken(`${body}.${sig}`, now)).toBeNull()
  })

  it('honors LOOPENGINE_LINK_TTL_HOURS and builds full links only when there is a base URL', () => {
    vi.stubEnv('LOOPENGINE_LINK_SECRET', 'test-secret')
    vi.stubEnv('LOOPENGINE_LINK_TTL_HOURS', '2')
    const now = Date.now()
    expect(verifyDecisionToken(createDecisionToken('p', 'approval', now), now)!.expiresAt - now).toBe(2 * 3_600_000)
    expect(decidePath('p', 'approval')).toMatch(/^\/decide\/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/)
    expect(decideLinkMaker(undefined)('p', 'approval')).toBeUndefined()
    expect(decideLinkMaker('https://x.example/')('p', 'approval')).toMatch(/^https:\/\/x\.example\/decide\//)
  })
})
