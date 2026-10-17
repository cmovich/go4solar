import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { SessionInfo } from '@/lib/auth/session'

// --- fakes ---------------------------------------------------------------
const getSessionInfo = vi.fn<() => Promise<SessionInfo>>()
vi.mock('@/lib/auth/session', () => ({ getSessionInfo: () => getSessionInfo() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/headers', () => ({ headers: async () => new Headers({ host: 'localhost:3000' }) }))

const sendPasswordLink = vi.fn(async () => ({ ok: true as const }))
vi.mock('@/lib/auth/passwordLinks', () => ({
  sendPasswordLink,
  authCallbackUrl: (origin: string) => `${origin}/auth/callback`,
}))

let target: { id: string; email: string; email_confirmed_at: string | null } | null
let targetRole = 'super_admin'
const inviteUserByEmail = vi.fn(async () => ({ data: { user: { id: 'u2' } }, error: null }))
const audit: unknown[] = []
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    auth: {
      admin: {
        inviteUserByEmail,
        getUserById: async () => ({
          data: { user: target },
          error: target ? null : { message: 'x' },
        }),
      },
    },
    from: (table: string) => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: { role: targetRole } }) }),
      }),
      update: () => ({ eq: async () => ({ error: null }) }),
      upsert: async () => ({ error: null }),
      insert: async (payload: unknown) => {
        if (table === 'audit_log') audit.push(payload)
        return { error: null }
      },
    }),
  }),
}))

const { inviteStaff, resendStaffInvite } = await import('./actions')

const ME = '11111111-1111-4111-8111-111111111111'
const JERRY = '22222222-2222-4222-8222-222222222222'
const superAdmin: SessionInfo = {
  user: { id: ME, email: 'boss@go4solar.test' },
  role: 'super_admin',
  aal: 'aal2',
}

beforeEach(() => {
  getSessionInfo.mockResolvedValue(superAdmin)
  target = { id: JERRY, email: 'new-staff@go4solar.test', email_confirmed_at: null }
  targetRole = 'super_admin'
  inviteUserByEmail.mockClear()
  sendPasswordLink.mockClear()
  audit.length = 0
})

describe('inviteStaff', () => {
  it('the invite link returns to /auth/callback (then "Set your password"), not /login', async () => {
    await inviteStaff({
      email: 'new-staff@go4solar.test',
      fullName: 'New Staff',
      role: 'operations',
      assistedEntry: false,
    })
    expect(inviteUserByEmail).toHaveBeenCalledWith('new-staff@go4solar.test', {
      data: { full_name: 'New Staff' },
      redirectTo: 'http://localhost:3000/auth/callback',
    })
  })
})

describe('resendStaffInvite', () => {
  it('super admin with two-factor only', async () => {
    getSessionInfo.mockResolvedValue({ ...superAdmin, aal: 'aal1' })
    expect(await resendStaffInvite({ profileId: JERRY })).toEqual({
      ok: false,
      error: 'Only a super admin can manage staff.',
    })
    getSessionInfo.mockResolvedValue({ ...superAdmin, role: 'operations' })
    expect((await resendStaffInvite({ profileId: JERRY })).ok).toBe(false)
    expect(inviteUserByEmail).not.toHaveBeenCalled()
    expect(sendPasswordLink).not.toHaveBeenCalled()
  })

  it('invite never opened: sends the invite again', async () => {
    expect(await resendStaffInvite({ profileId: JERRY })).toEqual({ ok: true })
    expect(inviteUserByEmail).toHaveBeenCalledWith('new-staff@go4solar.test', {
      redirectTo: 'http://localhost:3000/auth/callback',
    })
    expect(sendPasswordLink).not.toHaveBeenCalled()
    expect(audit).toEqual([
      expect.objectContaining({ action: 'staff.resend_invite', after: { sent: 'invite' } }),
    ])
  })

  it('invite already used (account confirmed, no password chosen): a "set your password" link', async () => {
    target = { ...target!, email_confirmed_at: '2026-10-16T19:34:36Z' }
    expect(await resendStaffInvite({ profileId: JERRY })).toEqual({ ok: true })
    expect(inviteUserByEmail).not.toHaveBeenCalled()
    expect(sendPasswordLink).toHaveBeenCalledWith(
      'new-staff@go4solar.test',
      'http://localhost:3000',
    )
    expect(audit).toEqual([
      expect.objectContaining({ action: 'staff.resend_invite', after: { sent: 'password_link' } }),
    ])
  })

  it('only for staff accounts, and not for yourself', async () => {
    targetRole = 'consumer'
    expect((await resendStaffInvite({ profileId: JERRY })).ok).toBe(false)
    expect(await resendStaffInvite({ profileId: ME })).toEqual({
      ok: false,
      error: 'You are already signed in. Use "Forgot password?" on the sign-in page if needed.',
    })
    expect(inviteUserByEmail).not.toHaveBeenCalled()
    expect(sendPasswordLink).not.toHaveBeenCalled()
  })
})
