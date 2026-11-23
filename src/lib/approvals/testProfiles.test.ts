import { describe, expect, it, vi } from 'vitest'

import { fakeSupabase } from '@/test/fakeSupabase'
import { REPORT_EXCLUSIONS } from '@/config/reportExclusions'

const db = fakeSupabase()
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => db.client }))
const { testProfileIds } = await import('./admin')

/** The SPEWA demo account (G4S-E7B59741): kept waiting for SPEWA, never counted as real. */
const DEMO_PROFILE = '497fe7f0-5d49-4ceb-b4bf-40f08b13d9f2'

describe('testProfileIds', () => {
  it('finds every test account, past the 1,000-row page limit', async () => {
    for (let i = 0; i < 2500; i++) db.seed('profiles', { id: `t-${i}`, is_test: true })
    db.seed('profiles', { id: 'real', is_test: false })
    const ids = await testProfileIds()
    expect(ids.has('t-2499')).toBe(true)
    expect(ids.has('real')).toBe(false)
  })

  it('also leaves out the accounts on the report exclusion list (the SPEWA demo), though not test', async () => {
    db.seed('profiles', { id: DEMO_PROFILE, is_test: false })
    const ids = await testProfileIds()
    expect(ids.has(DEMO_PROFILE)).toBe(true)
    expect(ids.has('real')).toBe(false)
  })

  it('every exclusion says why and which file it is', () => {
    expect(REPORT_EXCLUSIONS.map((e) => e.profileId)).toContain(DEMO_PROFILE)
    for (const e of REPORT_EXCLUSIONS) {
      expect(e.profileId).toMatch(/^[0-9a-f-]{36}$/)
      expect(e.reason.length).toBeGreaterThan(10)
    }
  })
})
