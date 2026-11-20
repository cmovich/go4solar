import { describe, expect, it } from 'vitest'

import { balanceDrawFor, funderOptions, optionKey, type FunderRow } from '@/lib/approvals/rules'
import { priceQuote } from '@/lib/pricing/price'

import { go4solarFigures, customerFigures, tradeLendaDrawn, monthlyRateOf } from './figures'
import { ogaBoss } from './fixture'
import { quoteBasis, readyPlanBasis } from './planBasis'

/**
 * ONE figure for what Trade Lenda hands over: price paid in full − deposit, for both lending
 * types. The balance taken at approval, the "drawn" amount, the interest and the Send screen's
 * "amount financed" must all agree (Semako, 19 Nov).
 */
const r = monthlyRateOf(0.48)
const tradeLenda: FunderRow = {
  id: 'tl',
  name: 'Trade Lenda',
  annualRate: 0.48,
  minAmount: 0,
  maxAmount: null,
  maxTenure: 12,
  balanceAvailable: 50_000_000,
  status: 'active',
  lendingTypes: ['customer', 'go4solar'],
}
const noCosts = { kycPerLoan: 0, feePerInstalment: 0, lossProvisionShare: 0 }

const builderQuote = priceQuote({
  lines: [
    { sku: 'INV-5', name: '5 kVA inverter', category: 'inverter', unitCost: 400_000, qty: 1 },
    { sku: 'ACC-7.5', name: 'Pack', category: 'accessories', unitCost: 180_000, qty: 1 },
  ],
  installCost: 250_000,
  noMarkup: [
    { label: 'Installation', amount: 150_000 },
    { label: 'Delivery — Go4Solar logistics (Kaduna)', amount: 100_000 },
  ],
  marginByCategory: { panels: 0.03, battery: 0.03, inverter: 0.03, accessories: 0.03 },
  pricingRateAnnual: 0.24,
  tenureMonths: 12,
  depositShare: 0.2,
})

const cases = [
  { name: 'Oga Boss', basis: readyPlanBasis(ogaBoss, 12), costPrice: 1_102_500 },
  {
    name: 'a builder system',
    basis: quoteBasis('Own system', builderQuote, 0.2, 12, { 12: 0.24 }),
    costPrice: builderQuote.costPrice,
  },
]

describe.each(cases)('$name: one drawn figure everywhere', ({ basis, costPrice }) => {
  for (const type of ['customer', 'go4solar'] as const) {
    it(type, () => {
      const f =
        type === 'customer'
          ? customerFigures({
              price: basis.priceInFull,
              depositShare: 0.2,
              months: 12,
              monthlyRate: r,
            })
          : go4solarFigures({
              priceInFull: basis.priceInFull,
              quoted: basis.quoted,
              months: 12,
              monthlyRate: r,
            })
      const drawn = tradeLendaDrawn({ priceInFull: basis.priceInFull, deposit: f.deposit })
      // Send screen ("amount financed") and the profile figures.
      expect(f.financed).toBe(drawn)
      // Interest on the drawn amount.
      expect(f.charge).toBe(Math.round(drawn * 0.04 * 12))

      // Approval: the balance taken and the "drawn" shown in the panel.
      const loan = {
        systemPrice: type === 'customer' ? basis.priceInFull : basis.quoted.totalPayable,
        costPrice,
        deposit: f.deposit,
        balance: 0,
        tenure: 12 as const,
        priceInFull: basis.priceInFull,
      }
      const option = funderOptions([tradeLenda], loan, noCosts, {
        recordedFees: 0,
        minNetMarginShare: 0,
      }).find((o) => optionKey(o) === `tl:${type}`)!
      expect(balanceDrawFor(option, loan)).toBe(drawn)
      if (type === 'go4solar') {
        expect(option.profit.drawn).toBe(drawn)
        expect(option.profit.funderInterest).toBe(f.charge)
      }
    })
  }
})

it('Oga Boss, lends to Go4Solar: drawn ₦1,045,600, interest ₦501,888, Go4Solar repays ₦1,547,488', () => {
  const basis = readyPlanBasis(ogaBoss, 12)
  const f = go4solarFigures({
    priceInFull: basis.priceInFull,
    quoted: basis.quoted,
    months: 12,
    monthlyRate: r,
  })
  expect([f.financed, f.charge, f.totalRepayment]).toEqual([1_045_600, 501_888, 1_547_488])
})
