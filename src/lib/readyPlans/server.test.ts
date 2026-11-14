import { describe, expect, it, vi } from 'vitest'

import { fakeSupabase } from '@/test/fakeSupabase'

import { SEEDED_PLANS } from './plans.fixture'
import { planToRow } from './schema'

const db = fakeSupabase()
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => db.client }))
const { extraFor, loadReadyPlans, offerFor, storedReadyPlan } = await import('./server')

const oga = { ...SEEDED_PLANS.find((p) => p.slug === 'oga-boss')!, sample: false }
const rows = [
  {
    state: 'Kaduna',
    amount: 20_000,
    extraPerPanel: 0,
    localVendorsAvailable: false,
    sample: false,
  },
  {
    state: 'Lagos',
    amount: 50_000,
    extraPerPanel: 5_000,
    localVendorsAvailable: false,
    sample: false,
  },
  { state: 'Kano', amount: 40_000, extraPerPanel: 0, localVendorsAvailable: false, sample: true },
  { state: 'Other', amount: 60_000, extraPerPanel: 0, localVendorsAvailable: false, sample: false },
]

describe('extraFor (delivery outside the included state)', () => {
  it('state price (with its per-panel extra) minus the included ₦20,000; "Other" for states without a row', () => {
    expect(extraFor(oga, 'Kaduna', rows)).toBe(0)
    expect(extraFor(oga, 'Lagos', rows)).toBe(50_000 + 4 * 5_000 - 20_000)
    expect(extraFor(oga, 'Enugu', rows)).toBe(40_000)
  })
  it('a SAMPLE delivery price is not used: null ("confirmed when we contact you")', () => {
    expect(extraFor(oga, 'Kano', rows)).toBeNull()
  })
})

describe('offerFor (what pages may show)', () => {
  it('figures for a confirmed plan; none for a SAMPLE plan', () => {
    expect(offerFor(oga, rows).card).toEqual({ deposit: 261_400, monthly: 139_413, months: 12 })
    const sample = offerFor({ ...oga, sample: true }, rows)
    expect(sample.card).toBeNull()
    expect(sample.tenures).toBeNull()
    expect(sample.fullPayment).toBeNull()
  })
  it('never carries vendor costs, line prices or the rate', () => {
    const json = JSON.stringify(offerFor(oga, rows))
    expect(json).not.toMatch(/vendorCost|monthlyRate|adminNote|"price"/)
  })
})

describe('storedReadyPlan (what a chosen plan saves)', () => {
  it('kind, plan, pay-in-full price, extra delivery and the priced quote', () => {
    const s = storedReadyPlan(oga, 12, 'Lagos', {}, rows)
    expect(s).toMatchObject({
      kind: 'ready',
      plan: { slug: 'oga-boss', name: 'Oga Boss' },
      fixed: {
        fullPayment: 1_450_770 + 50_000,
        fullDiscount: 0.25,
        extra: { state: 'Lagos', amount: 50_000 },
      },
      sample: false,
    })
    expect(s.quote.deposit).toBe(261_400 + 50_000)
  })
  it('SAMPLE when the plan is, or when the state delivery price is', () => {
    expect(storedReadyPlan({ ...oga, sample: true }, 12, 'Kaduna', {}, rows).sample).toBe(true)
    expect(storedReadyPlan(oga, 12, 'Kano', {}, rows).sample).toBe(true)
  })
})

describe('loadReadyPlans', () => {
  it('switched-on plans in order for customers; every plan for admin', async () => {
    db.seed('ready_plans', ...SEEDED_PLANS.map((p, i) => ({ ...planToRow(p), active: i !== 2 })))
    expect((await loadReadyPlans({ activeOnly: true })).map((p) => p.slug)).not.toContain(
      'oga-boss',
    )
    expect(await loadReadyPlans({ activeOnly: false })).toHaveLength(SEEDED_PLANS.length)
  })
})

describe('storedReadyPlan: pay in full', () => {
  it('one payment of the pay-in-full price, marked full; the months are ignored', () => {
    const s = storedReadyPlan(oga, 6, 'Lagos', {}, rows, 'full')
    expect(s.fixed).toMatchObject({ payment: 'full', fullPayment: 1_450_770 + 50_000 })
    expect(s.quote).toMatchObject({
      systemPrice: 1_500_770,
      deposit: 1_500_770,
      balance: 0,
      monthly: 0,
    })
    expect(s.quote.instalments).toEqual([])
  })
})
