import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { SessionInfo } from '@/lib/auth/session'
import { fakeSupabase } from '@/test/fakeSupabase'

let db = fakeSupabase()
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => db.client }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => db.client }))
vi.mock('@/lib/quotes/leadForPlans', () => ({ quoteValidityDays: async () => 14 }))
vi.mock('@/lib/waitlist/token', () => ({ currentVisitorHash: async () => 'visitor-hash' }))

const quote = {
  systemPrice: 2_000_000,
  deposit: 400_000,
  monthly: 140_000,
  lines: [{ sku: 'INV-5', name: '5 kVA inverter', qty: 1, lineTotal: 900_000 }],
  noMarkup: [],
  snapshot: { tenureMonths: 12, depositShare: 0.2 },
}
let blocking: string[] = []
vi.mock('@/lib/build/server', () => ({
  builderContext: async () => ({}),
  priceSelection: (_ctx: unknown, sel: { state: string }) => ({
    priced: { notes: [`state ${sel.state}`], blocking, sample: false },
    quote,
  }),
  selectionSummary: () => ({ size: { inverterKva: 5 }, panelWatts: 550 }),
}))
const saveBuiltSystem = vi.fn()
vi.mock('@/lib/build/save', () => ({ saveBuiltSystem: (...a: unknown[]) => saveBuiltSystem(...a) }))
const ensureInvoiceForQuote = vi.fn()
vi.mock('@/lib/invoices/server', () => ({
  ensureInvoiceForQuote: (...a: unknown[]) => ensureInvoiceForQuote(...a),
}))

const { acceptStaffQuotation, createStaffQuotation, mayCreateQuotations, staffQuotationForAdmin } =
  await import('./server')

const sa: SessionInfo = { user: { id: 'sa', email: 's@x.test' }, role: 'super_admin', aal: 'aal2' }
const marketer: SessionInfo = {
  user: { id: 'mk', email: 'm@x.test' },
  role: 'content',
  aal: 'aal2',
}
const selection = {
  scope: 'complete',
  state: 'Abia',
  items: [{ sku: 'INV-5', qty: 1 }],
  site: {},
  installer: 'go4solar',
}
const contact = {
  firstName: 'Ada',
  surname: 'Obi',
  phone: '08031234567',
  email: 'ada@example.com',
  lga: 'Ikeja',
  consent: true,
}

beforeEach(() => {
  db = fakeSupabase()
  blocking = []
  saveBuiltSystem.mockReset()
  ensureInvoiceForQuote.mockReset()
  db.seed('profiles', { id: 'sa', is_test: false }, { id: 'mk', is_test: true })
})

describe('mayCreateQuotations', () => {
  it('super admins; other staff only with the permission; never without two-factor', async () => {
    db.defineFunction('has_permission', () => false)
    expect(await mayCreateQuotations(sa)).toBe(true)
    expect(await mayCreateQuotations(marketer)).toBe(false)
    expect(await mayCreateQuotations({ ...sa, aal: 'aal1' })).toBe(false)
    db.defineFunction('has_permission', (a) => a.target === 'create_quotations')
    expect(await mayCreateQuotations(marketer)).toBe(true)
  })
})

describe('createStaffQuotation', () => {
  const input = {
    customer: { name: 'Ada Obi', phone: '0803 123 4567', state: 'Lagos' },
    selection,
    depositShare: 0.2,
    tenure: 12,
  }

  it('saves the priced snapshot for the customer’s state, with an audit row', async () => {
    const r = await createStaffQuotation(sa, input)
    expect(r).toMatchObject({ ok: true })
    const row = db.rows('staff_quotations')[0]!
    expect(row).toMatchObject({
      created_by: 'sa',
      customer_name: 'Ada Obi',
      customer_phone: '+2348031234567',
      state: 'Lagos',
      total: 2_000_000,
      monthly: 140_000,
      deposit_share: 0.2,
      tenure: 12,
      sample: false,
      is_test: false,
    })
    // The state at the top wins over whatever the builder had.
    expect(row.builder).toMatchObject({
      kind: 'builder',
      selection: { state: 'Lagos' },
      notes: ['state Lagos'],
      quote,
    })
    expect(String(row.public_code)).toMatch(/^[a-z0-9]{12}$/)
    const days = (new Date(String(row.valid_until)).getTime() - Date.now()) / 86_400_000
    expect(Math.round(days)).toBe(14)
    expect(db.rows('audit_log')[0]).toMatchObject({
      action: 'staff_quotation.create',
      actor_id: 'sa',
      entity: 'staff_quotations',
    })
  })

  it('name and phone are optional; a test staff account makes test data', async () => {
    expect(
      await createStaffQuotation(marketer, {
        ...input,
        customer: { name: '', phone: '', state: 'Kano' },
      }),
    ).toMatchObject({ ok: true })
    expect(db.rows('staff_quotations')[0]).toMatchObject({
      customer_name: null,
      customer_phone: null,
      is_test: true,
    })
  })

  it('refuses a bad phone, no state, or a system that does not work; nothing saved', async () => {
    expect(
      await createStaffQuotation(sa, { ...input, customer: { ...input.customer, phone: '12' } }),
    ).toMatchObject({ ok: false })
    expect(
      await createStaffQuotation(sa, { ...input, customer: { name: '', phone: '' } }),
    ).toMatchObject({ ok: false, error: "Choose the customer's state" })
    blocking = ['The panels need more input than this inverter takes.']
    expect(await createStaffQuotation(sa, input)).toEqual({
      ok: false,
      error: 'The panels need more input than this inverter takes.',
    })
    expect(db.rows('staff_quotations')).toEqual([])
  })
})

describe('staffQuotationForAdmin', () => {
  it('super admins see every quotation; other staff only their own', async () => {
    const id = '7f1c8a52-3a0e-4c1b-9a43-1b2c3d4e5f60'
    db.seed('staff_quotations', { id, created_by: 'sa' })
    expect(await staffQuotationForAdmin(sa, id)).not.toBeNull()
    expect(await staffQuotationForAdmin(marketer, id)).toBeNull()
  })
})

describe('acceptStaffQuotation ("Accept and apply")', () => {
  const builder = { kind: 'builder', selection, notes: [], size: {}, quote, sample: false }
  const seed = (extra: Record<string, unknown> = {}) =>
    db.seed('staff_quotations', {
      id: 'q1',
      public_code: 'abcdefghjkmn',
      created_by: 'mk',
      builder,
      accepted_at: null,
      shared_at: null,
      valid_until: new Date(Date.now() + 86_400_000).toISOString(),
      ...extra,
    })
  const accept = (live: boolean) =>
    acceptStaffQuotation({
      code: 'abcdefghjkmn',
      contact,
      live,
      ip: '1.2.3.4',
      origin: 'https://go4solar.app',
    })

  it('prelaunch: the customer’s own details start the sign-up from the stored snapshot', async () => {
    seed()
    saveBuiltSystem.mockResolvedValue({ ok: true, leadId: 'lead-1', quoteId: null })
    expect(await accept(false)).toEqual({ ok: true, next: null })
    expect(saveBuiltSystem).toHaveBeenCalledWith(
      expect.objectContaining({
        stored: builder,
        live: false,
        contact: expect.objectContaining({ firstName: 'Ada', phone: '+2348031234567' }),
        fromStaff: { enteredBy: 'mk' },
      }),
    )
    expect(db.rows('staff_quotations')[0]).toMatchObject({
      accepted_lead_id: 'lead-1',
      accepted_quote_id: null,
    })
    expect(db.rows('staff_quotations')[0]!.accepted_at).toBeTruthy()
    expect(db.rows('audit_log')[0]).toMatchObject({ action: 'staff_quotation.accept' })
    expect(ensureInvoiceForQuote).not.toHaveBeenCalled()
  })

  it('live: an accepted quote, its invoice, then the account step (phone code, ID checks)', async () => {
    seed()
    saveBuiltSystem.mockResolvedValue({ ok: true, leadId: 'lead-1', quoteId: 'quote-1' })
    ensureInvoiceForQuote.mockResolvedValue({ ok: true })
    expect(await accept(true)).toEqual({ ok: true, next: '/account?quote=quote-1' })
    expect(ensureInvoiceForQuote).toHaveBeenCalledWith('quote-1', 'https://go4solar.app')
  })

  it('refuses an expired quotation, a used one, a wrong link or missing details', async () => {
    seed({ valid_until: new Date(Date.now() - 1000).toISOString() })
    expect(await accept(false)).toMatchObject({
      ok: false,
      error: expect.stringMatching(/expired/),
    })
    db = fakeSupabase()
    seed({ accepted_at: new Date().toISOString() })
    expect(await accept(false)).toMatchObject({
      ok: false,
      error: expect.stringMatching(/already/),
    })
    expect(
      await acceptStaffQuotation({
        code: 'zzzzzzzzzzzz',
        contact,
        live: false,
        ip: 'x',
        origin: 'o',
      }),
    ).toMatchObject({ ok: false })
    db = fakeSupabase()
    seed()
    expect(
      await acceptStaffQuotation({
        code: 'abcdefghjkmn',
        contact: { ...contact, consent: false },
        live: false,
        ip: 'x',
        origin: 'o',
      }),
    ).toMatchObject({ ok: false })
    expect(saveBuiltSystem).not.toHaveBeenCalled()
  })

  it('back on the link after accepting (live, same phone): straight to the account step', async () => {
    seed({ accepted_at: new Date().toISOString(), accepted_quote_id: 'quote-9' })
    db.seed('quotes', { id: 'quote-9', anon_token_hash: 'visitor-hash' })
    expect(await accept(true)).toEqual({ ok: true, next: '/account?quote=quote-9' })
  })
})
