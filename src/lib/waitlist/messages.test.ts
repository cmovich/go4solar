import { describe, expect, it } from 'vitest'

import { PRICE_LATER_TEXT, confirmationText } from './messages'

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
})
