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

const { ensureInvoiceForQuote, quotationForQuote } = await import('./server')

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
