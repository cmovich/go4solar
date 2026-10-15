import { describe, expect, it } from 'vitest'

import { deployEnv, mockProvidersAllowed, testSwitchesAllowed, unlockToken } from './policy'

const SECRET = 'preview-test-mode-secret-0123456789'

describe('deployEnv', () => {
  it('reads Vercel’s VERCEL_ENV; anything else is local (your computer, automated tests)', () => {
    expect(deployEnv({ VERCEL_ENV: 'production' })).toBe('production')
    expect(deployEnv({ VERCEL_ENV: 'preview' })).toBe('preview')
    expect(deployEnv({ VERCEL_ENV: 'development' })).toBe('local')
    expect(deployEnv({})).toBe('local')
  })
})

describe('test-only switches (?test=1, mock checkout pages)', () => {
  it('never work in production, even with the secret and the cookie', () => {
    expect(
      testSwitchesAllowed({ env: 'production', secret: SECRET, cookie: unlockToken(SECRET) }),
    ).toBe(false)
  })

  it('on previews only after unlocking with the secret', () => {
    expect(testSwitchesAllowed({ env: 'preview', secret: SECRET, cookie: null })).toBe(false)
    expect(testSwitchesAllowed({ env: 'preview', secret: SECRET, cookie: 'guess' })).toBe(false)
    expect(
      testSwitchesAllowed({
        env: 'preview',
        secret: SECRET,
        cookie: unlockToken('other-secret-0123456789'),
      }),
    ).toBe(false)
    expect(
      testSwitchesAllowed({ env: 'preview', secret: SECRET, cookie: unlockToken(SECRET) }),
    ).toBe(true)
  })

  it('on previews without a (long enough) secret configured: never', () => {
    expect(
      testSwitchesAllowed({ env: 'preview', secret: undefined, cookie: unlockToken('') }),
    ).toBe(false)
    expect(
      testSwitchesAllowed({ env: 'preview', secret: 'short', cookie: unlockToken('short') }),
    ).toBe(false)
  })

  it('locally (your computer, Playwright) always', () => {
    expect(testSwitchesAllowed({ env: 'local', secret: undefined, cookie: null })).toBe(true)
  })

  it('the unlock cookie is a keyed hash, not the secret itself', () => {
    expect(unlockToken(SECRET)).toMatch(/^[0-9a-f]{64}$/)
    expect(unlockToken(SECRET)).not.toContain(SECRET)
  })
})

describe('mock providers (KYC, payments, messaging, vision)', () => {
  it('are refused in production, allowed on previews and locally', () => {
    expect(mockProvidersAllowed('production')).toBe(false)
    expect(mockProvidersAllowed('preview')).toBe(true)
    expect(mockProvidersAllowed('local')).toBe(true)
  })
})
