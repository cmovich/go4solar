import { describe, expect, it } from 'vitest'

import { PRICE_LATER_TEXT, THANK_YOU_TEXT, confirmationText } from './messages'

const base = {
  firstName: 'Ada',
  phoneE164: '+2348000001234',
  whatsappE164: null,
  email: null,
  plan: 'comfort' as const,
  depositShare: 0.2,
  systemPrice: 2_475_248,
  deposit: 495_050,
  monthly: 165_017,
  tenureMonths: 12,
}

describe('confirmationText', () => {
  it('real prices: the estimate with naira amounts and the total', () => {
    const t = confirmationText({ ...base, samplePrices: false })
    expect(t).toContain('₦2,475,248')
    expect(t).toContain('0% interest')
  })

  // Prompt 16A: while any price is a SAMPLE price, no naira amount (and no 0% claim) goes out.
  it('sample prices: plan only, no amounts, the "price confirmed later" line', () => {
    const t = confirmationText({ ...base, samplePrices: true })
    expect(t).not.toMatch(/₦|0% interest/)
    expect(t).toContain('Comfort')
    expect(t).toContain(PRICE_LATER_TEXT)
    expect(PRICE_LATER_TEXT).toBe('Your exact price will be confirmed when we contact you.')
  })

  // Prelaunch copy change: the 7-day promise appears only after sign-up, in this exact wording.
  it('starts with the thank-you line (the only 7-day promise) and never says "waiting list"', () => {
    expect(THANK_YOU_TEXT).toBe(
      'Thank you! Our team will get back to you within 7 days with your confirmed price and next steps.',
    )
    for (const samplePrices of [true, false]) {
      const t = confirmationText({ ...base, samplePrices })
      expect(t).toContain(THANK_YOU_TEXT)
      expect(t).not.toMatch(/waiting list|next 7 days/i)
    }
  })
})

describe('confirmation for a builder system (Part F)', () => {
  it('names it "your own system" instead of a plan', async () => {
    const { confirmationText } = await import('./messages')
    const text = confirmationText({
      firstName: 'Love',
      phoneE164: '+2348031234567',
      whatsappE164: null,
      email: null,
      plan: 'comfort',
      planLabel: 'Your own system',
      depositShare: 0.2,
      systemPrice: 3000000,
      deposit: 600000,
      monthly: 200000,
      tenureMonths: 12,
      samplePrices: false,
    })
    expect(text).toContain('Your estimate: Your own system — total ₦3,000,000')
    expect(text).not.toContain('Comfort')
  })
})
