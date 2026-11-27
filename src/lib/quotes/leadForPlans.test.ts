import { beforeEach, describe, expect, it, vi } from 'vitest'

import { sampleHomeItems } from '@/lib/load/load.fixture'
import { computeLoadTotals } from '@/lib/load/totals'
import { DEFAULT_QUOTE_SETTINGS } from '@/lib/settings/schemas'
import { fakeSupabase } from '@/test/fakeSupabase'

import { buildEstimate } from './buildEstimate'

/** Old estimates are never re-priced or overwritten when opened (Semako, 25 Nov 2026). */
let db = fakeSupabase()
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => db.client }))
vi.mock('@/lib/settings/getQuoteSettings', () => ({
  getQuoteSettings: async () => DEFAULT_QUOTE_SETTINGS,
}))
vi.mock('@/lib/waitlist/token', () => ({ currentVisitorHash: async () => 'hash' }))

const { loadLeadForStaff } = await import('./leadForPlans')

const ID = '11111111-1111-4111-8111-111111111111'
const fresh = buildEstimate(
  computeLoadTotals(sampleHomeItems),
  'Kaduna',
  0.2,
  DEFAULT_QUOTE_SETTINGS,
)
// The same estimate as it was stored before the ready-made terms.
const old = structuredClone(fresh)
for (const p of ['essential', 'comfort', 'independence'] as const) {
  delete old.plans[p].quote.snapshot.terms
}
old.pricingRateByTenure = { 3: 0.24, 6: 0.24, 9: 0.24, 12: 0.24 }

const seed = (estimate: unknown, pricedAt: string) =>
  db.seed('waitlist_consumers', {
    id: ID,
    first_name: 'Ada',
    state: 'Kaduna',
    created_at: pricedAt,
    load_items: sampleHomeItems,
    estimate: { ...(estimate as object), pricedAt },
  })

beforeEach(() => {
  db = fakeSupabase()
})

describe('loadLead: never overwrites an old estimate', () => {
  it('an old-terms estimate past its validity days keeps its figures (nothing written)', async () => {
    seed(old, '2026-10-01T00:00:00Z')
    const lfp = await loadLeadForStaff(ID)
    expect(lfp!.estimate.plans.comfort.quote.snapshot.terms).toBeUndefined()
    expect(lfp!.estimate.plans.comfort.quote.systemPrice).toBe(old.plans.comfort.quote.systemPrice)
    expect(lfp!.tenures).toEqual([3, 6, 9, 12])
    const stored = db.rows('waitlist_consumers')[0]!.estimate as typeof old & { pricedAt: string }
    expect(stored.pricedAt).toBe('2026-10-01T00:00:00Z')
    expect(stored.plans.comfort.quote.snapshot.terms).toBeUndefined()
  })

  it('an estimate already on the new terms is refreshed when past its validity days (as before)', async () => {
    seed(fresh, '2026-10-01T00:00:00Z')
    const lfp = await loadLeadForStaff(ID)
    expect(lfp!.estimate.pricedAt).not.toBe('2026-10-01T00:00:00Z')
    expect(lfp!.tenures).toEqual([6, 9, 12])
  })
})
