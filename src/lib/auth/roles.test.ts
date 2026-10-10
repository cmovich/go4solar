import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { SessionInfo } from './session'

// Fake session: each test sets what getSessionInfo() returns.
const getSessionInfo = vi.fn<() => Promise<SessionInfo>>()
vi.mock('./session', () => ({ getSessionInfo: () => getSessionInfo() }))

// next/navigation's redirect() throws; we mimic that so the guards stop executing.
class RedirectError extends Error {
  constructor(public readonly to: string) {
    super(`NEXT_REDIRECT ${to}`)
  }
}
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new RedirectError(to)
  },
}))

const {
  STAFF_ROLES,
  isStaffRole,
  requireRole,
  requireStaffWithMfa,
  requireUser,
  requireVerifiedEmail,
} = await import('./roles')

const anon: SessionInfo = { user: null, role: null, aal: null }
const consumer: SessionInfo = {
  user: { id: 'u-consumer', email: 'c@example.com' },
  role: 'consumer',
  aal: 'aal1',
}
const staffNoMfa: SessionInfo = {
  user: { id: 'u-staff', email: 's@example.com' },
  role: 'credit_officer',
  aal: 'aal1',
}
const staffWithMfa: SessionInfo = { ...staffNoMfa, aal: 'aal2' }
const superAdminWithMfa: SessionInfo = { ...staffWithMfa, role: 'super_admin' }

async function redirectOf(fn: () => Promise<unknown>): Promise<string | null> {
  try {
    await fn()
    return null
  } catch (err) {
    if (err instanceof RedirectError) return err.to
    throw err
  }
}

beforeEach(() => {
  getSessionInfo.mockReset()
})

describe('isStaffRole', () => {
  it('lists the six back-office roles and nothing else', () => {
    expect(STAFF_ROLES).toEqual([
      'super_admin',
      'credit_officer',
      'operations',
      'collections',
      'finance',
      'content',
    ])
    expect(isStaffRole('finance')).toBe(true)
    expect(isStaffRole('consumer')).toBe(false)
    expect(isStaffRole('installer')).toBe(false)
    expect(isStaffRole(null)).toBe(false)
  })
})

describe('requireUser', () => {
  it('redirects a visitor with no session to /login, keeping the page they wanted', async () => {
    getSessionInfo.mockResolvedValue(anon)
    expect(await redirectOf(() => requireUser('/app'))).toBe('/login?next=%2Fapp')
  })

  it('returns the session for a logged-in user', async () => {
    getSessionInfo.mockResolvedValue(consumer)
    await expect(requireUser()).resolves.toEqual(consumer)
  })
})

describe('requireRole', () => {
  it('sends an anonymous visitor to /login', async () => {
    getSessionInfo.mockResolvedValue(anon)
    expect(await redirectOf(() => requireRole('super_admin'))).toBe('/login')
  })

  it('blocks a consumer from a staff-only route (redirects home)', async () => {
    getSessionInfo.mockResolvedValue(consumer)
    expect(await redirectOf(() => requireRole(...STAFF_ROLES))).toBe('/')
  })

  it('lets a user through when their role is in the list', async () => {
    getSessionInfo.mockResolvedValue(staffNoMfa)
    await expect(requireRole('credit_officer', 'super_admin')).resolves.toEqual(staffNoMfa)
  })
})

describe('requireStaffWithMfa', () => {
  it('sends an anonymous visitor to /login?next=/admin', async () => {
    getSessionInfo.mockResolvedValue(anon)
    expect(await redirectOf(() => requireStaffWithMfa())).toBe('/login?next=%2Fadmin')
  })

  it('blocks a consumer even if they have MFA', async () => {
    getSessionInfo.mockResolvedValue({ ...consumer, aal: 'aal2' })
    expect(await redirectOf(() => requireStaffWithMfa())).toBe('/')
  })

  it('redirects staff without aal2 to /admin/mfa', async () => {
    getSessionInfo.mockResolvedValue(staffNoMfa)
    expect(await redirectOf(() => requireStaffWithMfa())).toBe('/admin/mfa')
  })

  it('lets staff with aal2 through', async () => {
    getSessionInfo.mockResolvedValue(staffWithMfa)
    await expect(requireStaffWithMfa()).resolves.toEqual(staffWithMfa)
    getSessionInfo.mockResolvedValue(superAdminWithMfa)
    await expect(requireStaffWithMfa()).resolves.toEqual(superAdminWithMfa)
  })
})

describe('requireVerifiedEmail', () => {
  it('sends an anonymous visitor to /login', async () => {
    getSessionInfo.mockResolvedValue(anon)
    expect(await redirectOf(() => requireVerifiedEmail())).toBe('/login?next=%2Fapp%2Fapply')
  })

  it('sends a user with an unverified email back to the application to verify it', async () => {
    getSessionInfo.mockResolvedValue({ ...consumer, emailVerified: false })
    expect(await redirectOf(() => requireVerifiedEmail())).toBe('/app/apply?verify=email')
    getSessionInfo.mockResolvedValue(consumer) // field missing = not verified
    expect(await redirectOf(() => requireVerifiedEmail())).toBe('/app/apply?verify=email')
  })

  it('lets a verified user through', async () => {
    getSessionInfo.mockResolvedValue({ ...consumer, emailVerified: true })
    await expect(requireVerifiedEmail()).resolves.toMatchObject({ emailVerified: true })
  })
})
