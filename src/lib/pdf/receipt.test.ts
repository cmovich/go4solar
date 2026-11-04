import { describe, expect, it } from 'vitest'

import { pdfPageTexts } from '@/test/pdfText'

import { renderReceiptPdf } from './ReceiptPdf'

describe('payment receipt PDF', () => {
  it('shows who paid, what for, how much (₦ in Inter) and what is left', async () => {
    const pdf = await renderReceiptPdf({
      receiptNo: 'G4S-PAY-ABC123',
      customerName: 'Love Lounge',
      planReference: 'G4S-1A2B3C4D',
      label: 'Payment 2 of 12',
      amount: 120000,
      paidAt: '2026-12-04T09:30:00Z',
      channel: 'card',
      amountLeft: 1200000,
    })
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF')
    const text = pdfPageTexts(pdf).join(' ')
    for (const part of [
      'Payment receipt',
      'G4S-PAY-ABC123',
      'Love Lounge',
      'G4S-1A2B3C4D',
      'Payment 2 of 12',
      '₦120,000',
      '₦1,200,000',
      '4 Dec 2026',
      'Go4Solar Energy Limited',
    ]) {
      expect(text).toContain(part)
    }
  }, 30000)

  it('prints the company details it is given (the admin "Company details" setting)', async () => {
    const pdf = await renderReceiptPdf(
      {
        receiptNo: 'G4S-PAY-XYZ',
        customerName: 'Love Lounge',
        planReference: 'G4S-1A2B3C4D',
        label: 'Deposit',
        amount: 500000,
        paidAt: '2026-12-04T09:30:00Z',
        channel: 'card',
        amountLeft: 1000000,
      },
      {
        name: 'Test Solar Co Ltd',
        address: '1 Test Road, Kaduna',
        phone: '08000000001, 08000000002',
        email: 'hello@test-solar.example',
        website: 'www.test-solar.example',
        rcNumber: null,
      },
    )
    const text = pdfPageTexts(pdf).join(' ')
    for (const part of [
      'Test Solar Co Ltd',
      '1 Test Road, Kaduna',
      'hello@test-solar.example',
      '08000000001 · 08000000002',
      'www.test-solar.example',
    ]) {
      expect(text, part).toContain(part)
    }
    expect(text).not.toContain('Go4Solar Energy Limited')
  }, 30000)
})
