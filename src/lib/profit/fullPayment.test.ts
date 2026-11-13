import { describe, expect, it } from 'vitest'

import { fullPaymentProfit } from './fullPayment'

describe('fullPaymentProfit (paid in full: a one-off sale)', () => {
  it('price − vendor cost − the payment fee; nothing drawn, nothing to come each month', () => {
    expect(
      fullPaymentProfit({ systemPrice: 1_450_770, costPrice: 1_102_500, fees: 2_000 }),
    ).toEqual({
      drawn: 0,
      funderInterest: 0,
      grossProfit: 348_270,
      directCosts: 2_000,
      netProfit: 346_270,
      netPerMonth: 0,
      customerMonthly: 0,
      funderMonthly: 0,
      annualReturnOnDrawn: null,
    })
  })
})
