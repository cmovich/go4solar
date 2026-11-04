import { describe, expect, it } from 'vitest'

import { DEFAULT_COMPANY } from '@/lib/company/schema'
import { buildInvoice } from '@/lib/invoices/build'
import { formatNaira } from '@/lib/money'
import { sampleQuoteInput } from '@/lib/pricing/pricing.fixture'
import { priceQuote } from '@/lib/pricing/price'
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
      '08182112423',
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
