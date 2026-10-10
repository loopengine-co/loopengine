import { describe, expect, it } from 'vitest'
import { signProxyIdentity, verifyProxyIdentity } from '../core/trusted-proxy.js'

const SECRET = 'test-secret'
const future = () => Math.floor(Date.now() / 1000) + 60

describe('trusted proxy identity', () => {
  it('round-trips a signed identity', () => {
    const identity = { sub: 'user-1', workspace: 'ws-1', role: 'owner', exp: future() }
    expect(verifyProxyIdentity(signProxyIdentity(identity, SECRET), SECRET)).toEqual(identity)
  })

  it('rejects a missing, malformed, tampered, wrongly-signed or expired header', () => {
    const good = signProxyIdentity({ sub: 'user-1', role: 'owner', exp: future() }, SECRET)
    const [payload, signature] = good.split('.')
    const tampered = Buffer.from(JSON.stringify({ sub: 'admin', role: 'owner', exp: future() })).toString('base64url')

    expect(verifyProxyIdentity(undefined, SECRET)).toBeUndefined()
    expect(verifyProxyIdentity(['a', 'b'], SECRET)).toBeUndefined()
    expect(verifyProxyIdentity('no-dot', SECRET)).toBeUndefined()
    expect(verifyProxyIdentity(`${tampered}.${signature}`, SECRET)).toBeUndefined()
    expect(verifyProxyIdentity(`${payload}.${signature}`, 'other-secret')).toBeUndefined()
    expect(verifyProxyIdentity(signProxyIdentity({ sub: 'u', role: 'owner', exp: 1 }, SECRET), SECRET)).toBeUndefined()
  })
})
