import { beforeEach, describe, expect, it, vi } from 'vitest'

import { DEFAULT_COMPANY } from '@/lib/company/schema'
import { sampleQuoteInput } from '@/lib/pricing/pricing.fixture'
import { priceQuote } from '@/lib/pricing/price'
import { fakeSupabase } from '@/test/fakeSupabase'

let db = fakeSupabase()
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => db.client }))
vi.mock('@/lib/company/server', () => ({ loadCompany: async () => DEFAULT_COMPANY }))
vi.mock('@/lib/quotes/leadForPlans', () => ({
  quoteValidityDays: async () => 7,
  loadLeadForPlans: async () => null,
}))
vi.mock('@/lib/wizard/server', () => ({ fetchRoofTypes: async () => [] }))
vi.mock('@/lib/catalogue/server', () => ({
  loadCatalogue: async () => null,
  itemSizes: () => ({}),
}))

const { ensureInvoiceForQuote, quotationForQuote, quotationForStaff } = await import('./server')

const QUOTE = '013b33cd-78f7-4215-9a90-2b553470659d'
const result = priceQuote(sampleQuoteInput)
let n = 0

beforeEach(() => {
  db = fakeSupabase()
  n = 0
  db.defineFunction('next_invoice_number', (a) =>
    a.p_test
      ? `G4S-TEST-INV-2026-${String(++n).padStart(4, '0')}`
      : `G4S-INV-2026-${String(++n).padStart(4, '0')}`,
  )
  db.seed('profiles', {
    id: 'u-love',
    full_name: 'Love Lounge',
    email: 'love@example.test',
    phone_e164: '+2348000001234',
    state: 'Kaduna',
    is_test: true,
  })
  // An older quote (30 Oct): no waiting-list lead, owned by the customer's account.
  db.seed('quotes', {
    id: QUOTE,
    waitlist_id: null,
    owner_id: 'u-love',
    plan: 'essential',
    state: 'Kaduna',
    tenure: 12,
    result,
    site: null,
    builder: null,
  })
})

describe('ensureInvoiceForQuote (My account and admin)', () => {
  it('a quote with no lead: the invoice uses the customer account details (was "Not found")', async () => {
    const r = await ensureInvoiceForQuote(QUOTE, 'https://go4solar.app')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.invoice).toMatchObject({
      kind: 'invoice',
      number: 'G4S-TEST-INV-2026-0001',
      title: 'Essential plan',
      reference: 'G4S-013B33CD',
      customer: { name: 'Love Lounge', firstName: 'Love', email: 'love@example.test' },
    })
    expect(r.invoice.verifyUrl).toMatch(/^https:\/\/go4solar\.app\/verify\/[a-z0-9]{12}$/)
    expect(r.invoice.totals.total).toBe(result.systemPrice)
    expect(db.rows('invoices')).toHaveLength(1)
  })

  it('asking again returns the same invoice: no new number', async () => {
    const a = await ensureInvoiceForQuote(QUOTE, 'https://go4solar.app')
    const b = await ensureInvoiceForQuote(QUOTE, 'https://go4solar.app')
    expect(a.ok && b.ok && a.invoice.number === b.invoice.number).toBe(true)
    expect(db.rows('invoices')).toHaveLength(1)
  })

  it('an unknown quote → not found', async () => {
    expect(await ensureInvoiceForQuote('99999999-9999-4999-8999-999999999999', 'x')).toEqual({
      ok: false,
      reason: 'not_found',
    })
  })
})

describe('quotationForQuote (before Accept)', () => {
  it('a quotation with the quote reference; nothing saved, no number used', async () => {
    const r = await quotationForQuote(QUOTE)
    expect(r.ok && r.invoice.kind).toBe('quotation')
    expect(r.ok && r.invoice.number).toBe('G4S-013B33CD')
    expect(r.ok && r.invoice.verifyUrl).toBeNull()
    expect(db.rows('invoices')).toHaveLength(0)
    expect(n).toBe(0)
  })
})

describe('quotationForStaff (staff quotation tool)', () => {
  const row = {
    id: '7f1c8a52-3a0e-4c1b-9a43-1b2c3d4e5f60',
    public_code: 'abcdefghjkmn',
    created_by: 'sa',
    created_at: '2026-11-09T10:00:00.000Z',
    customer_name: 'Ada Obi',
    customer_phone: '+2348031234567',
    state: 'FCT',
    site: {},
    builder: { kind: 'builder', notes: [], sample: false, quote: result },
    deposit_share: 0.2,
    tenure: 12,
    total: result.systemPrice,
    monthly: result.monthly,
    sample: false,
    valid_until: '2026-11-16T10:00:00.000Z',
    shared_at: null,
    accepted_at: null,
    accepted_lead_id: null,
    accepted_quote_id: null,
    is_test: false,
  }
  it('a quotation (reference, no number or QR link) dated the day staff made it', async () => {
    const r = await quotationForStaff(row)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.invoice).toMatchObject({
      kind: 'quotation',
      number: 'G4S-7F1C8A52',
      reference: 'G4S-7F1C8A52',
      verifyUrl: null,
      title: 'Your own system',
      issuedAt: '2026-11-09T10:00:00.000Z',
      validUntil: '2026-11-16T10:00:00.000Z',
      customer: { name: 'Ada Obi', firstName: 'Ada', phone: '+2348031234567', place: 'Abuja (FCT)' },
    })
    expect(r.invoice.totals.total).toBe(result.systemPrice)
    expect(db.rows('invoices')).toEqual([])
  })
  it('no name: "Customer"; SAMPLE prices: no document', async () => {
    const r = await quotationForStaff({ ...row, customer_name: null })
    expect(r.ok && r.invoice.customer.name).toBe('Customer')
    expect(
      await quotationForStaff({
        ...row,
        sample: true,
        builder: { ...row.builder, sample: true },
      }),
    ).toEqual({ ok: false, reason: 'sample' })
  })
})
