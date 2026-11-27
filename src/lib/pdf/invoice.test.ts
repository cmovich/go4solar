import { describe, expect, it } from 'vitest'

import { DEFAULT_COMPANY } from '@/lib/company/schema'
import { buildInvoice, customerFixed } from '@/lib/invoices/build'
import { formatNaira } from '@/lib/money'
import { sampleQuoteInput } from '@/lib/pricing/pricing.fixture'
import { priceQuote } from '@/lib/pricing/price'
import { DEFAULT_OFFER_TERMS, quoteOffer } from '@/lib/spewa/offer'
import { SEEDED_PLANS } from '@/lib/readyPlans/plans.fixture'
import { priceReadyPlan, readyQuoteResult } from '@/lib/readyPlans/price'
import { pdfPageTexts } from '@/test/pdfText'

import { renderInvoicePdf } from './InvoicePdf'

const result = priceQuote({
  ...sampleQuoteInput,
  lines: [
    ...sampleQuoteInput.lines,
    {
      sku: 'RACK-METAL',
      name: 'Metal roof rack',
      category: 'accessories',
      unitCost: 40000,
      qty: 1,
    },
  ],
  installCost: 250000,
  noMarkup: [
    { label: 'Installation', amount: 200000 },
    { label: 'Delivery — Go4Solar logistics (Kaduna)', amount: 50000 },
  ],
})

const invoiceInput: Parameters<typeof buildInvoice>[0] = {
  number: 'G4S-INV-2026-0007',
  publicCode: 'abc123def456',
  verifyUrl: 'https://go4solar.app/verify/abc123def456',
  issuedAt: new Date('2026-11-03T10:00:00Z'),
  validityDays: 7,
  company: { ...DEFAULT_COMPANY, rcNumber: '9560733' },
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
  result,
  items: { 'PNL-550': { spec: '550 W', unit: 'each' } },
  site: { mounting: 'roof', wire: { known: false } },
  roofNeedsRack: false,
  installer: 'go4solar',
  packIncluded: true,
}
const data = buildInvoice(invoiceInput)

const images = (pdf: Buffer) => pdf.toString('latin1').match(/\/Subtype\s*\/Image/g)?.length ?? 0

describe('invoice PDF', () => {
  it('logo, company header, number, dates, customer, every line, totals, notes and the verify link', async () => {
    const pdf = await renderInvoicePdf(data)
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF')
    // The logo, plus the QR code (the quotation below has only the logo).
    const quotation = await renderInvoicePdf({ ...data, kind: 'quotation', verifyUrl: null })
    expect(images(pdf)).toBeGreaterThan(images(quotation))
    expect(images(quotation)).toBeGreaterThan(0)
    const text = pdfPageTexts(pdf).join(' ')
    for (const part of [
      'Go4Solar Energy Limited',
      'Suite 40, Jayjay Shopping Complex, Kaduna',
      '09018617165',
      'contact@go4solar.app',
      'RC 9560733',
      'Invoice',
      'G4S-INV-2026-0007',
      '3 Nov 2026',
      '10 Nov 2026',
      'Amina Bello',
      'Comfort plan',
      'G4S-1A2B3C4D',
      'Solar panels',
      '550 W',
      'Metal roof rack',
      'Installation',
      'Delivery — Go4Solar logistics (Kaduna)',
      'Total amount payable',
      'One fixed price. No hidden charges',
      'Customer provides ladder/scaffold',
      'go4solar.app/verify/abc123def456',
    ]) {
      expect(text, part).toContain(part)
    }
    for (const l of data.lines) {
      expect(text, l.item).toContain(formatNaira(l.amount))
    }
    expect(text).toContain(formatNaira(result.systemPrice))
  }, 30000)

  it('a quotation: titled Quotation with the quote reference, no QR code, no invoice number', async () => {
    const pdf = await renderInvoicePdf({
      ...data,
      kind: 'quotation',
      number: 'G4S-1A2B3C4D',
      verifyUrl: null,
    })
    expect(images(pdf)).toBe(images(await renderInvoicePdf({ ...data, verifyUrl: null })))
    const text = pdfPageTexts(pdf).join(' ')
    expect(text).toContain('Quotation')
    expect(text).toContain('Quotation ref.')
    expect(text).toContain('G4S-1A2B3C4D')
    expect(text).toContain('Accept it to receive your numbered invoice')
    expect(text).not.toContain('G4S-INV')
    expect(text).not.toContain('/verify/')
  }, 30000)
})

describe('ready-made plan quotation PDF', () => {
  it('items without prices, pay-in-full price, extra delivery, "One fixed price"; never "interest"', async () => {
    const oga = SEEDED_PLANS.find((p) => p.slug === 'oga-boss')!
    const priced = priceReadyPlan(oga, 12, 45_000)
    const doc = buildInvoice({
      kind: 'quotation',
      number: 'G4S-1A2B3C4D',
      publicCode: '',
      verifyUrl: null,
      issuedAt: new Date('2026-11-12T10:00:00Z'),
      validityDays: 7,
      company: DEFAULT_COMPANY,
      customer: data.customer,
      reference: 'G4S-1A2B3C4D',
      site: {},
      roofNeedsRack: false,
      installer: 'go4solar',
      packIncluded: false,
      title: 'Oga Boss',
      result: readyQuoteResult(oga, priced, 'Lagos'),
      items: {},
      fixed: {
        fullPayment: priced.fullPayment,
        fullDiscount: 0.2,
        extra: { state: 'Lagos', amount: 45_000 },
      },
    })
    const text = pdfPageTexts(await renderInvoicePdf(doc)).join(' ')
    for (const part of [
      'Oga Boss',
      'Battery 3.6 kWh lithium-ion 12 V',
      formatNaira(priced.totalPayable),
      formatNaira(261_400),
      'Delivery to Lagos (extra, paid with the deposit)',
      formatNaira(45_000),
      formatNaira(128_957),
      'Or pay in full',
      '20% off',
      formatNaira(1_447_110 + 45_000),
      'One fixed price. No hidden charges',
      'Late payments',
    ]) {
      expect(text, part).toContain(part)
    }
    // No per-line price (battery ₦470,000, panels ₦400,000) and never the word "interest".
    expect(text).not.toContain(formatNaira(470_000))
    expect(text).not.toContain(formatNaira(400_000))
    expect(text).not.toMatch(/interest/i)
  })
})

describe('invoice PDF: financing lines (SPEWA offer only)', () => {
  const demo = priceQuote({
    lines: [
      {
        sku: 'SPW-SLS-0011',
        name: 'Solis 5kW/48V',
        category: 'inverter',
        unitCost: 480_000,
        sellUnit: 520_000,
        qty: 1,
      },
      {
        sku: 'SPW-BAT',
        name: 'MUST 48V/5KWH',
        category: 'battery',
        unitCost: 900_000,
        sellUnit: 940_000,
        qty: 1,
      },
      {
        sku: 'SPW-PNL',
        name: '330W Sungene',
        category: 'panels',
        unitCost: 50_000,
        sellUnit: 56_500,
        qty: 3,
      },
      {
        sku: 'ACC',
        name: 'Protection, cables and mounting',
        category: 'accessories',
        unitCost: 180_000,
        sellUnit: 185_400,
        qty: 1,
      },
    ],
    installCost: 225_050,
    noMarkup: [
      { label: 'Installation', amount: 125_050 },
      { label: 'Delivery — Go4Solar logistics (Kaduna)', amount: 100_000 },
    ],
    marginByCategory: { panels: 0.03, battery: 0.03, inverter: 0.03, accessories: 0.03 },
    pricingRateAnnual: 0.3,
    tenureMonths: 12,
    depositShare: 0.3,
    minDepositShare: 0.3,
    offer: quoteOffer(DEFAULT_OFFER_TERMS, [3, 6, 9, 12]),
  })

  it('the SPEWA demo: amount financed ₦1,427,965, the charge apart, balance to repay ₦1,856,355', async () => {
    const d = buildInvoice({ ...invoiceInput, title: 'Your own system', result: demo })
    const text = pdfPageTexts(await renderInvoicePdf(d)).join('\n')
    expect(text).toContain('Amount financed')
    expect(text).toContain(formatNaira(1_427_965))
    expect(text).toContain('Payment plan charge (12 months, 30%)')
    expect(text).toContain(formatNaira(428_390))
    expect(text).toContain('Balance to repay monthly')
    expect(text).toContain(formatNaira(1_856_355))
  })

  it('home quotes: no financing lines (the cost is in the one fixed price)', async () => {
    const text = pdfPageTexts(await renderInvoicePdf(data)).join('\n')
    expect(text).not.toContain('Balance to repay monthly')
    expect(text).not.toContain('Amount financed')
  })
})

describe('home quotation PDF on the ready-made terms (25 Nov 2026)', () => {
  it('items without prices; only total, deposit, monthly × months and pay in full', async () => {
    const home = priceQuote({
      lines: [
        { sku: 'INV-1', name: '1 kVA inverter', category: 'inverter', unitCost: 257_500, qty: 1 },
      ],
      installCost: 200_000,
      noMarkup: [
        { label: 'Installation', amount: 100_000 },
        { label: 'Delivery — Go4Solar logistics (Kaduna)', amount: 100_000 },
      ],
      marginByCategory: { panels: 0.03, battery: 0.03, inverter: 0.03, accessories: 0.03 },
      pricingRateAnnual: 0.48,
      tenureMonths: 12,
      depositShare: 0.2,
      terms: { kind: 'flat', monthlyRate: 0.04, fullDiscount: 0.2 },
    })
    const doc = buildInvoice({
      ...invoiceInput,
      kind: 'quotation',
      result: home,
      fixed: customerFixed(home),
    })
    const text = pdfPageTexts(await renderInvoicePdf(doc)).join(' ')
    for (const shown of [643_871, 93_045, 45_902, 515_097])
      expect(text).toContain(formatNaira(shown))
    for (const hidden of [265_225, 100_000, 178_646, 372_180, 465_225])
      expect(text).not.toContain(formatNaira(hidden))
    expect(text).toContain('1 kVA inverter')
    expect(text).toContain('Installation')
    expect(text).not.toMatch(/interest|payment plan charge|amount financed/i)
  })
})
