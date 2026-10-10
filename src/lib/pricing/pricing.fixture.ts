import type { QuoteInput } from './types'

/**
 * The PRD's pricing illustration: equipment ₦1,600,000, base margin 12.5%, installation
 * ₦200,000, pricing rate 24%/year. At 12 months and 20% deposit → system price ₦2,475,248.
 */
export const sampleQuoteInput: QuoteInput = {
  lines: [
    { sku: 'PNL-550', name: 'Solar panels', category: 'panels', unitCost: 600000, qty: 1 },
    { sku: 'BAT-5', name: 'Lithium battery', category: 'battery', unitCost: 600000, qty: 1 },
    { sku: 'INV-3.5', name: 'Hybrid inverter', category: 'inverter', unitCost: 300000, qty: 1 },
    {
      sku: 'ACC-KIT',
      name: 'Cables and protection',
      category: 'accessories',
      unitCost: 100000,
      qty: 1,
    },
  ],
  installCost: 200000,
  marginByCategory: { panels: 0.125, battery: 0.125, inverter: 0.125, accessories: 0.125 },
  pricingRateAnnual: 0.24,
  tenureMonths: 12,
  depositShare: 0.2,
}

/** Unit costs used in the PRD's profit illustration. */
export const sampleUnitCosts = {
  kycPerLoan: 10000,
  feePerInstalment: 300,
  lossProvisionShare: 0.02,
}
