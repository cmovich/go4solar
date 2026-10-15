import { beforeEach, describe, expect, it, vi } from 'vitest'

import { fakeSupabase } from '@/test/fakeSupabase'

import { testPhone } from '../../../../e2e/helpers/test-identity'

let db = fakeSupabase()
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => db.client }))
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'x-forwarded-for': '1.2.3.4' }),
}))
vi.mock('@/lib/ratelimit/hitRateLimit', () => ({ hitRateLimit: async () => true }))
vi.mock('@/lib/waitlist/token', () => ({
  currentVisitorHash: async () => 'visitor-hash',
  getOrCreateVisitorToken: async () => ({ hash: 'visitor-hash' }),
}))

const { savePhoneStep } = await import('./actions')

const items = [
  {
    id: 'i-1',
    category: 'lighting',
    name: 'LED bulb',
    watts: 10,
    qty: 4,
    hoursPerDay: 6,
    surgeFactor: 1,
    dutyCycle: 1,
    custom: false,
  },
]

beforeEach(() => {
  db = fakeSupabase()
})

// Fix-up 1 #1: every step now has Back; going back to the phone screen must not add a 2nd lead.
describe('savePhoneStep', () => {
  it('first save creates the lead; saving again with its id updates the same lead', async () => {
    const first = await savePhoneStep({ phone: testPhone(), sameAsPhone: true, items })
    expect(first.ok).toBe(true)
    const id = first.ok ? first.id : ''
    const newPhone = testPhone()
    const again = await savePhoneStep({ id, phone: newPhone, sameAsPhone: true, items })
    expect(again).toEqual({ ok: true, id })
    const rows = db.rows('waitlist_consumers')
    expect(rows).toHaveLength(1)
    expect(rows[0]!.phone_e164).toBe(`+234${newPhone.slice(1)}`)
  })

  it("someone else's lead id is never updated (a new lead is not made either)", async () => {
    db.seed('waitlist_consumers', {
      id: '00000000-0000-4000-8000-000000000001',
      visitor_token_hash: 'other',
    })
    const r = await savePhoneStep({
      id: '00000000-0000-4000-8000-000000000001',
      phone: testPhone(),
      sameAsPhone: true,
      items,
    })
    expect(r.ok).toBe(false)
    expect(db.rows('waitlist_consumers')).toHaveLength(1)
  })
})
