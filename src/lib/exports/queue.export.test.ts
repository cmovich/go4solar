import { beforeEach, describe, expect, it, vi } from 'vitest'

import { sampleHomeItems } from '@/lib/load/load.fixture'
import { computeLoadTotals } from '@/lib/load/totals'
import { buildEstimate } from '@/lib/quotes/buildEstimate'
import { cashPrice } from '@/lib/quotes/quote'
import { DEFAULT_QUOTE_SETTINGS } from '@/lib/settings/schemas'
import { quoteBasis } from '@/lib/tradeLenda/planBasis'
import type { ProfileValues } from '@/lib/tradeLenda/profile'
import { batchCsv } from '@/lib/tradeLenda/exports'
import { funderSafetyProblems, type FunderCustomer } from '@/lib/tradeLenda/snapshot'
import { fakeSupabase } from '@/test/fakeSupabase'

/**
 * Stop blocking exports (Semako, 25 Nov 2026): only a name, a phone and consent for that funder
 * block. A Get Started / calculator person goes on Trade Lenda's own 4% terms.
 */
let db = fakeSupabase()
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => db.client }))

const TL = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const BARE = '11111111-1111-4111-8111-111111111111'
const NOCONSENT = '22222222-2222-4222-8222-222222222222'
const NOQUOTE = '33333333-3333-4333-8333-333333333333'

const estimate = buildEstimate(
  computeLoadTotals(sampleHomeItems),
  'Kaduna',
  0.2,
  DEFAULT_QUOTE_SETTINGS,
)

const blank: ProfileValues = {
  customerType: null,
  businessName: null,
  contactRole: null,
  firstName: null,
  surname: null,
  phone: null,
  whatsapp: null,
  email: null,
  dateOfBirth: null,
  state: null,
  lga: null,
  street: null,
  landmark: null,
  employmentType: null,
  incomeRange: null,
  guarantorName: null,
  guarantorPhone: null,
  guarantorRelationship: null,
  planKind: null,
  planRef: null,
  depositShare: null,
  months: null,
}
const lead = (id: string, chosen: string | null) => ({
  id,
  first_name: 'Ada',
  surname: 'Obi',
  phone_e164: '+2348031234567',
  whatsapp_e164: null,
  email: null,
  lga: null,
  state: 'Kaduna',
  applicant_type: 'individual',
  builder: null,
  chosen_plan: chosen,
  deposit_share: chosen ? 0.2 : null,
  estimate: chosen ? estimate : null,
})
const nobody = {
  phoneVerifiedAt: null,
  phoneVerifiedBy: null,
  phoneVerifiedNote: null,
  figuresAgreedAt: null,
  figuresAgreedBy: null,
  figuresAgreedNote: null,
}

vi.mock('@/lib/tradeLenda/server', () => ({
  loadProfileView: async (id: string) => ({
    lead: lead(id, id === NOQUOTE ? null : 'comfort'),
    profile: null,
    values: {
      ...blank,
      firstName: 'Ada',
      surname: 'Obi',
      phone: '+2348031234567',
      state: 'Kaduna',
    },
    ticks: nobody,
  }),
  // The real rule for a calculator person: their stored plan's quote at the deposit and length.
  basisFor: async (
    l: { estimate: typeof estimate | null },
    kind: string | null,
    ref: string | null,
    d: number,
    m: 6 | 12,
  ) =>
    kind === 'estimate' && ref && l.estimate
      ? quoteBasis('Comfort (calculator)', l.estimate.plans.comfort.quote, d, m, {})
      : null,
}))
vi.mock('@/lib/exports/consents', () => ({
  loadConsents: async (id: string) =>
    id === NOCONSENT
      ? []
      : [
          {
            funderId: TL,
            funderName: 'Trade Lenda',
            consentedAt: '2026-11-25T10:00:00Z',
            consentedBy: 'Staff A',
            consentNote: null,
            withdrawnAt: null,
          },
        ],
}))

const { addToQueue, exportQueue, queueView } = await import('./queue')
const ops = { id: 'ops-1', role: 'operations' as const }

beforeEach(() => {
  db = fakeSupabase({ export_queue_items: [['queue_id', 'waitlist_id']] })
  db.defineFunction('next_export_number', () => 'EXP-2026-0001')
  db.seed(
    'waitlist_consumers',
    { id: BARE, is_test: false, first_name: 'Ada', surname: 'Obi', phone_e164: '+2348031234567' },
    {
      id: NOCONSENT,
      is_test: false,
      first_name: 'Ada',
      surname: 'Obi',
      phone_e164: '+2348031234567',
    },
    {
      id: NOQUOTE,
      is_test: false,
      first_name: 'Ada',
      surname: 'Obi',
      phone_e164: '+2348031234567',
    },
  )
  db.seed('funders', {
    id: TL,
    name: 'Trade Lenda',
    batch_prefix: 'TL',
    annual_rate: 0.48,
    lending_types: ['customer', 'go4solar'],
    default_lending_type: 'customer',
    is_test: false,
    status: 'active',
  })
})

const view = () =>
  queueView({ isTest: false, funderId: TL, lendingType: 'customer', mode: 'full-where-possible' })

describe('exports: only name, phone and consent block', () => {
  it('no address, email, WhatsApp, records ticks or Edit-page quote: exported, with warnings', async () => {
    await addToQueue([BARE], ops)
    const [row] = (await view()).rows
    expect(row!.level).toBe('basic')
    expect(row!.problems).toEqual([])
    expect(row!.warnings).toEqual(
      expect.arrayContaining([
        'email',
        'landmark',
        'WhatsApp',
        'details confirmed by phone',
        'agreed to the quote figures',
      ]),
    )
    // The calculator plan the person chose counts as their quote: no "plan" warning.
    expect(row!.warnings).not.toContain('plan')
    const r = await exportQueue(
      { isTest: false, funderId: TL, lendingType: 'customer', mode: 'full-where-possible' },
      ops,
    )
    expect(r).toMatchObject({ ok: true, number: 'TL-Batch-001' })
  })

  it('a Get Started / calculator person goes on Trade Lenda’s 4% terms: price in full, deposit, financed × 4% × months', async () => {
    await addToQueue([BARE], ops)
    await exportQueue(
      { isTest: false, funderId: TL, lendingType: 'customer', mode: 'full-where-possible' },
      ops,
    )
    const c = db.rows('funder_batch_items')[0]!.snapshot as FunderCustomer
    const price = cashPrice(estimate.plans.comfort.quote.snapshot)
    const deposit = Math.round(price * 0.2)
    const financed = price - deposit
    expect(c.figures).toMatchObject({
      costToCustomer: price,
      deposit,
      financed,
      ratePerMonth: 0.04,
      months: 12,
      totalRepayment: deposit + financed + Math.round(financed * 0.04 * 12),
    })
    // Records not ticked are blank, never "Staff, ".
    expect(c.records.verifiedByPhone).toMatchObject({ by: '', at: '' })
    // Kept: nothing internal.
    expect(funderSafetyProblems(c)).toEqual([])
    expect(JSON.stringify(c)).not.toMatch(/ninLast4|bvn|unitCost|margin|profit|costPrice/i)
  })

  it('no consent for that funder: blocked (the only reason with no name/phone)', async () => {
    await addToQueue([NOCONSENT], ops)
    const [row] = (await view()).rows
    expect(row!.level).toBeNull()
    expect(row!.problems).toEqual(['Needs: consent to share with this funder.'])
    const r = await exportQueue(
      { isTest: false, funderId: TL, lendingType: 'customer', mode: 'full-where-possible' },
      ops,
    )
    expect(r.ok).toBe(false)
  })

  it('no quote at all: exported with blank figures and a "quote" warning', async () => {
    await addToQueue([NOQUOTE], ops)
    const [row] = (await view()).rows
    expect(row!.warnings).toContain('quote')
    const r = await exportQueue(
      { isTest: false, funderId: TL, lendingType: 'customer', mode: 'full-where-possible' },
      ops,
    )
    expect(r.ok).toBe(true)
    const c = db.rows('funder_batch_items')[0]!.snapshot as FunderCustomer
    expect(c.noQuote).toBe(true)
    const csv = batchCsv({
      number: 'TL-Batch-001',
      version: 1,
      lendingType: 'customer',
      createdAt: '2026-11-25',
      totals: { byPlan: {}, byMonths: {} } as never,
      customers: [c],
      decisions: {},
    })
    const [head, line] = csv.trim().split('\n')
    const cols = head!.split(',')
    const cells = line!.split(',')
    expect(cells[cols.indexOf('Total cost to customer')]).toBe('')
    expect(cells[cols.indexOf('Monthly repayment')]).toBe('')
  })
})
