import { describe, expect, it } from 'vitest'

import { DEFAULT_COMPANY } from '@/lib/company/schema'
import { buildInvoice } from '@/lib/invoices/build'
import { formatNaira } from '@/lib/money'
import { sampleQuoteInput } from '@/lib/pricing/pricing.fixture'
import { priceQuote } from '@/lib/pricing/price'
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

const data = buildInvoice({
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
})

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
      '0% interest',
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
        fullDiscount: 0.25,
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
      formatNaira(139_413),
      'Or pay in full',
      '25% off',
      formatNaira(1_450_770 + 45_000),
      'One fixed price. No hidden charges.',
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
