import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { SessionInfo } from '@/lib/auth/session'
import { fakeSupabase } from '@/test/fakeSupabase'

process.env.ID_HASH_SECRET = 'id-hash-test-secret-0123456789abcdef'

let db = fakeSupabase()
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => db.client }))
const getSessionInfo = vi.fn<() => Promise<SessionInfo>>()
vi.mock('@/lib/auth/session', () => ({ getSessionInfo: () => getSessionInfo() }))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
vi.mock('next/headers', () => ({ headers: async () => new Headers() }))
vi.mock('@/lib/ratelimit/hitRateLimit', () => ({ hitRateLimit: async () => true }))
const createLivenessSession = vi.fn(async () => ({ sessionId: 'mock-1' }))
const getLivenessResult = vi.fn(async () => ({
  status: 'passed' as const,
  livenessPassed: true,
  faceMatchScore: 0.9,
}))
vi.mock('@/lib/providers/kyc', () => ({
  getKycProvider: async () => ({ name: 'mock', createLivenessSession, getLivenessResult }),
}))

const actions = await import('./actions')

const staff: SessionInfo = {
  user: { id: 'staff-1', email: 'ops@go4solar.test' },
  role: 'operations',
  aal: 'aal2',
}
const customer: SessionInfo = {
  user: { id: 'customer-1', email: 'ada@x.test' },
  role: 'consumer',
  aal: 'aal1',
}

beforeEach(() => {
  vi.clearAllMocks()
  db = fakeSupabase()
  // An application entered by staff on the customer's behalf, NIN confirmed and consent given.
  db.seed('applications', {
    id: 'app-1',
    consumer_id: 'customer-1',
    entered_by: 'staff-1',
    entry_channel: 'walk_in',
    status: 'draft',
    applicant_type: 'individual',
    steps: { details: true, nin: true, bvn: true, consent: true },
    personal: { firstName: 'Ada' },
    credit_flags: {},
    biometric_consent_at: '2026-10-11T09:00:00Z',
  })
  db.seed('kyc_checks', {
    subject_id: 'app-1',
    kind: 'nin',
    status: 'passed',
    attempt: 1,
    result_summary: {},
  })
})

describe('assisted entry: identity steps only in the customer’s own session', () => {
  it('staff (who entered the record) cannot start or finish the face check', async () => {
    getSessionInfo.mockResolvedValue(staff)
    expect(await actions.startLiveness()).toMatchObject({ ok: false })
    expect(await actions.finishLiveness({ sessionId: 'mock-1' })).toMatchObject({ ok: false })
    expect(await actions.giveBiometricConsent({ agree: true })).toMatchObject({ ok: false })
    expect(createLivenessSession).not.toHaveBeenCalled()
    expect(getLivenessResult).not.toHaveBeenCalled()
    expect(db.rows('kyc_checks').filter((c) => c.kind === 'liveness')).toHaveLength(0)
  })

  it('not signed in at all: nothing happens', async () => {
    getSessionInfo.mockResolvedValue({ user: null, role: null, aal: null })
    expect(await actions.startLiveness()).toMatchObject({ ok: false })
    expect(createLivenessSession).not.toHaveBeenCalled()
  })

  it('the customer, signed in on their own phone, can', async () => {
    getSessionInfo.mockResolvedValue(customer)
    expect(await actions.startLiveness()).toMatchObject({ ok: true, sessionId: 'mock-1' })
    expect(await actions.finishLiveness({ sessionId: 'mock-1' })).toMatchObject({ ok: true })
    expect(db.rows('kyc_checks').filter((c) => c.kind === 'liveness')).toEqual([
      expect.objectContaining({ subject_id: 'app-1', status: 'passed' }),
    ])
  })
})
