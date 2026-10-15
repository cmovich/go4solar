import { afterEach, describe, expect, it, vi } from 'vitest'

import { TEST_MODE_COOKIE, unlockToken } from './policy'

const SECRET = 'preview-test-mode-secret-0123456789'
let cookie: string | undefined
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (k: string) => (k === TEST_MODE_COOKIE && cookie ? { value: cookie } : undefined),
  }),
  headers: async () => new Headers(),
}))
vi.mock('@/lib/auth/session', () => ({
  getSessionInfo: async () => ({
    user: { id: 'u-1', email: 'x@go4solar.test' },
    role: 'consumer',
    aal: 'aal1',
  }),
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))

const { includeTestData } = await import('./server')
const { completeMockCheckout } = await import('@/app/(consumer)/app/pay/actions')

const saved = { ...process.env }
afterEach(() => {
  process.env = { ...saved }
  cookie = undefined
})
const ref = { reference: 'G4S-DEP-0123456789AB', outcome: 'success' as const }

describe('test-only switches on the server', () => {
  it('production: ?test=1 is ignored and the mock checkout refuses, even with the secret and cookie', async () => {
    process.env.VERCEL_ENV = 'production'
    process.env.TEST_MODE_SECRET = SECRET
    cookie = unlockToken(SECRET)
    expect(await includeTestData('1')).toBe(false)
    expect(await completeMockCheckout(ref)).toEqual({ ok: false, error: 'Not available.' })
  })

  it('preview without unlocking: off', async () => {
    process.env.VERCEL_ENV = 'preview'
    process.env.TEST_MODE_SECRET = SECRET
    expect(await includeTestData('1')).toBe(false)
    expect(await completeMockCheckout(ref)).toEqual({ ok: false, error: 'Not available.' })
  })

  it('preview after unlocking with the secret: on', async () => {
    process.env.VERCEL_ENV = 'preview'
    process.env.TEST_MODE_SECRET = SECRET
    cookie = unlockToken(SECRET)
    expect(await includeTestData('1')).toBe(true)
    expect(await includeTestData(undefined)).toBe(false)
  })

  it('locally: on', async () => {
    delete process.env.VERCEL_ENV
    expect(await includeTestData('1')).toBe(true)
  })
})
