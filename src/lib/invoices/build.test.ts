import { describe, expect, it } from 'vitest'

import { DEFAULT_COMPANY } from '@/lib/company/schema'
import { sampleQuoteInput } from '@/lib/pricing/pricing.fixture'
import { priceQuote } from '@/lib/pricing/price'
import { SEEDED_PLANS } from '@/lib/readyPlans/plans.fixture'
import { fullPaymentQuoteResult, priceReadyPlan, readyQuoteResult } from '@/lib/readyPlans/price'

import { buildInvoice, newPublicCode, type InvoiceInput } from './build'
import { verifyView } from './verify'

const priced = priceQuote({
  ...sampleQuoteInput,
  lines: [
    ...sampleQuoteInput.lines,
    { sku: 'DCW-6', name: 'DC wire 6 mm²', category: 'accessories', unitCost: 2000, qty: 20 },
    {
      sku: 'RACK-ALUMINIUM',
      name: 'Aluminium roof rack',
      category: 'accessories',
      unitCost: 50000,
      qty: 1,
    },
  ],
  installCost: 250000,
  noMarkup: [
    { label: 'Installation', amount: 200000 },
    { label: 'Delivery — Go4Solar logistics (Kaduna)', amount: 50000 },
  ],
})

const base: InvoiceInput = {
  number: 'G4S-INV-2026-0001',
  publicCode: 'abc123def456',
  verifyUrl: 'https://go4solar.app/verify/abc123def456',
  issuedAt: new Date('2026-11-03T10:00:00Z'),
  validityDays: 7,
  company: DEFAULT_COMPANY,
  customer: {
    firstName: 'Amina',
    name: 'Amina Bello',
    phone: '+2348031234567',
    email: 'amina@example.test',
    place: 'Kaduna North, Kaduna',
    businessName: null,
  },
  title: 'Comfort plan',
  reference: 'G4S-1A2B3C4D',
  result: priced,
  items: {
    'PNL-550': { spec: '550 W', unit: 'each' },
    'INV-3.5': { spec: '3.5 kVA · 24 V', unit: 'each' },
    'DCW-6': { spec: '6 mm²', unit: 'metre' },
  },
  site: { mounting: 'roof', wire: { known: false }, rack: { wanted: true, material: 'aluminium' } },
  roofNeedsRack: true,
  installer: 'go4solar',
  packIncluded: false,
}

describe('buildInvoice (what the invoice PDF prints)', () => {
  it('every equipment line, then rack, installation and delivery as separate lines', () => {
    const inv = buildInvoice(base)
    expect(inv.lines.map((l) => [l.item, l.kind])).toEqual([
      ['Solar panels', 'equipment'],
      ['Lithium battery', 'equipment'],
      ['Hybrid inverter', 'equipment'],
      ['Cables and protection', 'equipment'],
      ['DC wire 6 mm²', 'equipment'],
      ['Aluminium roof rack', 'rack'],
      ['Installation', 'installation'],
      ['Delivery — Go4Solar logistics (Kaduna)', 'delivery'],
    ])
  })

  it('size/spec and quantity (metres for wire); no cost prices anywhere', () => {
    const inv = buildInvoice(base)
    expect(inv.lines[0]).toMatchObject({ spec: '550 W', qty: '1' })
    expect(inv.lines[4]).toMatchObject({ spec: '6 mm²', qty: '20 m' })
    expect(JSON.stringify(inv)).not.toMatch(/unitCost|costPrice|markupShare/)
  })

  it('lines add up to the total amount payable; deposit and monthly × months from the quote', () => {
    const inv = buildInvoice(base)
    expect(inv.lines.reduce((t, l) => t + l.amount, 0)).toBe(priced.systemPrice)
    expect(inv.totals).toEqual({
      total: priced.systemPrice,
      deposit: priced.deposit,
      depositShare: 0.2,
      balance: priced.balance,
      monthly: priced.monthly,
      months: 12,
    })
  })

  it('dates: issued and valid until (validity days later)', () => {
    const inv = buildInvoice(base)
    expect(inv.issuedAt).toBe('2026-11-03T10:00:00.000Z')
    expect(inv.validUntil).toBe('2026-11-10T10:00:00.000Z')
  })

  it('notes: ladder/scaffold, wire estimate, prices valid until', () => {
    expect(buildInvoice(base).notes).toEqual([
      'Customer provides ladder/scaffold (not charged).',
      "This is an estimate — you may need extra wire, as we haven't seen your site.",
      'Prices valid until 10 Nov 2026.',
    ])
  })

  it('notes: customer mounting, rack declined, own installer, accessories pack', () => {
    const ground = buildInvoice({ ...base, site: { mounting: 'ground' }, packIncluded: true })
    expect(ground.notes).toContain('Includes the standard accessories pack.')
    expect(ground.notes).toContain(
      'Customer provides the space and the mounting structure (not charged).',
    )
    const declined = buildInvoice({
      ...base,
      site: { mounting: 'roof', rack: { wanted: false } },
      installer: 'own',
    })
    expect(declined.notes).toContain(
      'Customer declined rack; installation on this roof may not be possible without one.',
    )
    expect(declined.notes).toContain(
      'Go4Solar is not liable for any installation errors brought to us.',
    )
  })

  it('quotes priced before itemised lines show one "Installation and logistics" line', () => {
    const old = { ...priced, noMarkup: undefined } as unknown as typeof priced
    const inv = buildInvoice({ ...base, result: old })
    expect(inv.lines.at(-1)).toMatchObject({
      item: 'Installation and logistics',
      kind: 'installation',
      amount: 250000,
    })
  })

  it('newPublicCode: 12 random lowercase letters and digits', () => {
    const a = newPublicCode()
    expect(a).toMatch(/^[a-z0-9]{12}$/)
    expect(newPublicCode()).not.toBe(a)
  })
})

describe('verifyView (/verify/<code>: genuine or not, first name only)', () => {
  it('a genuine invoice: number, date, first name and total, still valid or expired', () => {
    const row = {
      number: 'G4S-INV-2026-0001',
      first_name: 'Amina',
      total: 2475248,
      issued_at: '2026-11-03T10:00:00Z',
      valid_until: '2026-11-10T10:00:00Z',
    }
    expect(verifyView(row, new Date('2026-11-05T00:00:00Z'))).toEqual({
      status: 'genuine',
      number: 'G4S-INV-2026-0001',
      firstName: 'Amina',
      total: 2475248,
      issuedOn: '3 Nov 2026',
      validUntil: '10 Nov 2026',
      expired: false,
    })
    expect(verifyView(row, new Date('2026-11-11T00:00:00Z'))).toMatchObject({ expired: true })
  })

  it('unknown code → not found', () => {
    expect(verifyView(null)).toEqual({ status: 'not_found' })
  })
})

describe('quotation (before Accept: no invoice number, no verify link)', () => {
  it('kind quotation keeps every line and total; the number is the quote reference', () => {
    const q = buildInvoice({ ...base, kind: 'quotation', number: 'G4S-1A2B3C4D', verifyUrl: null })
    expect(q.kind).toBe('quotation')
    expect(q.number).toBe('G4S-1A2B3C4D')
    expect(q.verifyUrl).toBeNull()
    expect(q.lines).toEqual(buildInvoice(base).lines)
    expect(q.totals).toEqual(buildInvoice(base).totals)
  })

  it('an invoice is kind invoice by default', () => {
    expect(buildInvoice(base).kind).toBe('invoice')
  })
})

// Ready-made plans: items without prices, deposit, any extra delivery paid with it, the monthly
// payments, the pay-in-full price and "One fixed price. No hidden charges."
describe('a ready-made plan quotation', () => {
  const oga = SEEDED_PLANS.find((p) => p.slug === 'oga-boss')!
  const pricedOga = priceReadyPlan(oga, 12, 45_000)
  const doc = buildInvoice({
    ...base,
    kind: 'quotation',
    title: 'Oga Boss',
    result: readyQuoteResult(oga, pricedOga, 'Lagos'),
    items: {},
    fixed: {
      fullPayment: pricedOga.fullPayment,
      fullDiscount: 0.25,
      extra: { state: 'Lagos', amount: 45_000 },
    },
  })
  it('lists every item and hides every per-line price; the extra delivery is in the totals', () => {
    expect(doc.lines.map((l) => l.item)).toContain('Battery 3.6 kWh lithium-ion 12 V')
    expect(doc.lines.every((l) => l.hideAmount)).toBe(true)
    expect(doc.lines.some((l) => l.item.startsWith('Delivery to Lagos'))).toBe(false)
  })
  it('totals: the deposit without the extra delivery, which is its own amount', () => {
    expect(doc.totals).toMatchObject({
      total: pricedOga.totalPayable,
      deposit: 261_400,
      monthly: 139_413,
      months: 12,
    })
    expect(doc.fixed).toEqual({
      fullPayment: 1_450_770 + 45_000,
      fullDiscount: 0.25,
      extra: { state: 'Lagos', amount: 45_000 },
    })
  })
  it('notes: ladder or scaffold and the site check; no interest wording anywhere', () => {
    expect(doc.notes).toContain('Customer provides ladder/scaffold (not charged).')
    expect(doc.notes).toContain('Subject to a site check.')
    expect(JSON.stringify(doc)).not.toMatch(/interest/i)
  })
})

describe('a pay-in-full quotation or invoice', () => {
  const oga = SEEDED_PLANS.find((p) => p.slug === 'oga-boss')!
  const priced = priceReadyPlan(oga, 12, 45_000)
  const doc = buildInvoice({
    ...base,
    kind: 'invoice',
    title: 'Oga Boss',
    result: fullPaymentQuoteResult(oga, priced, 'Lagos'),
    items: {},
    fixed: {
      fullPayment: priced.fullPayment,
      fullDiscount: 0.25,
      extra: { state: 'Lagos', amount: 45_000 },
      payment: 'full',
    },
  })
  it('one payment: total = everything paid now; no monthly payments', () => {
    expect(doc.totals).toMatchObject({
      total: 1_450_770 + 45_000,
      deposit: 1_450_770 + 45_000,
      balance: 0,
      monthly: 0,
      months: 0,
    })
    expect(doc.fixed?.payment).toBe('full')
    expect(JSON.stringify(doc)).not.toMatch(/interest/i)
  })
})
