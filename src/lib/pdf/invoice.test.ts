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
  company: { ...DEFAULT_COMPANY, rcNumber: 'RC 1234567' },
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

describe('invoice PDF', () => {
  it('logo, company header, number, dates, customer, every line, totals, notes and the verify link', async () => {
    const pdf = await renderInvoicePdf(data)
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF')
    // Two pictures: the Go4Solar logo and the QR code.
    expect(pdf.toString('latin1').match(/\/Subtype\s*\/Image/g)?.length).toBeGreaterThanOrEqual(2)
    const text = pdfPageTexts(pdf).join(' ')
    for (const part of [
      'Go4Solar Energy Limited',
      'Suite 40, Jayjay Shopping Complex, Kaduna',
      '08182112423',
      'contact@go4solar.app',
      'RC 1234567',
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
})
