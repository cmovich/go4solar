import { describe, expect, it } from 'vitest'

import { SAMPLE_PRICE_LIST, SAMPLE_PRICING } from '@/lib/settings/schemas'

import {
  installBandFor,
  priceListFromRows,
  pricingFromRows,
  type CategoryMarginRow,
  type ComponentRow,
  type InstallationCostRow,
  type PricingRateRow,
} from './tables'

// Rows exactly as 0006_pricing.sql seeds them (numeric columns arrive as numbers from PostgREST).
const components: ComponentRow[] = [
  {
    sku: 'PNL-550',
    name: '550 W solar panel',
    category: 'panels',
    unit_cost: 120000,
    stock_sizes: { watts: 550 },
    active: true,
    sample: true,
  },
  {
    sku: 'BAT-2.5',
    name: '2.5 kWh lithium battery module',
    category: 'battery',
    unit_cost: 450000,
    stock_sizes: { kwh: 2.5 },
    active: true,
    sample: true,
  },
  {
    sku: 'INV-1',
    name: '1 kVA hybrid inverter',
    category: 'inverter',
    unit_cost: 180000,
    stock_sizes: { kva: 1 },
    active: true,
    sample: true,
  },
  {
    sku: 'INV-1.5',
    name: '1.5 kVA hybrid inverter',
    category: 'inverter',
    unit_cost: 220000,
    stock_sizes: { kva: 1.5 },
    active: true,
    sample: true,
  },
  {
    sku: 'INV-2.5',
    name: '2.5 kVA hybrid inverter',
    category: 'inverter',
    unit_cost: 350000,
    stock_sizes: { kva: 2.5 },
    active: true,
    sample: true,
  },
  {
    sku: 'INV-3.5',
    name: '3.5 kVA hybrid inverter',
    category: 'inverter',
    unit_cost: 450000,
    stock_sizes: { kva: 3.5 },
    active: true,
    sample: true,
  },
  {
    sku: 'INV-5',
    name: '5 kVA hybrid inverter',
    category: 'inverter',
    unit_cost: 650000,
    stock_sizes: { kva: 5 },
    active: true,
    sample: true,
  },
  {
    sku: 'INV-7.5',
    name: '7.5 kVA hybrid inverter',
    category: 'inverter',
    unit_cost: 950000,
    stock_sizes: { kva: 7.5 },
    active: true,
    sample: true,
  },
  {
    sku: 'INV-10',
    name: '10 kVA hybrid inverter',
    category: 'inverter',
    unit_cost: 1300000,
    stock_sizes: { kva: 10 },
    active: true,
    sample: true,
  },
  {
    sku: 'INV-15',
    name: '15 kVA hybrid inverter',
    category: 'inverter',
    unit_cost: 1900000,
    stock_sizes: { kva: 15 },
    active: true,
    sample: true,
  },
  {
    sku: 'INV-20',
    name: '20 kVA hybrid inverter',
    category: 'inverter',
    unit_cost: 2500000,
    stock_sizes: { kva: 20 },
    active: true,
    sample: true,
  },
  {
    sku: 'ACC-1.5',
    name: 'Protection, cables and mounting (≤ 1.5 kVA)',
    category: 'accessories',
    unit_cost: 60000,
    stock_sizes: { maxKva: 1.5 },
    active: true,
    sample: true,
  },
  {
    sku: 'ACC-3.5',
    name: 'Protection, cables and mounting (≤ 3.5 kVA)',
    category: 'accessories',
    unit_cost: 100000,
    stock_sizes: { maxKva: 3.5 },
    active: true,
    sample: true,
  },
  {
    sku: 'ACC-7.5',
    name: 'Protection, cables and mounting (≤ 7.5 kVA)',
    category: 'accessories',
    unit_cost: 180000,
    stock_sizes: { maxKva: 7.5 },
    active: true,
    sample: true,
  },
  {
    sku: 'ACC-20',
    name: 'Protection, cables and mounting (≤ 20 kVA)',
    category: 'accessories',
    unit_cost: 300000,
    stock_sizes: { maxKva: 20 },
    active: true,
    sample: true,
  },
]
const margins: CategoryMarginRow[] = [
  { category: 'panels', margin: 0.125, sample: true },
  { category: 'battery', margin: 0.125, sample: true },
  { category: 'inverter', margin: 0.125, sample: true },
  { category: 'accessories', margin: 0.125, sample: true },
]
const rates: PricingRateRow[] = [3, 6, 9, 12].map((t) => ({
  tenure_months: t,
  expected_funder_rate: 0.16,
  spread: 0.06,
  default_buffer: 0.02,
  pricing_rate: 0.24,
  sample: true,
}))
const installs: InstallationCostRow[] = (['FCT', 'Kaduna', 'Lagos', 'Other'] as const).flatMap(
  (state) => {
    const small = state === 'FCT' || state === 'Kaduna' ? 150000 : 200000
    return [
      { state, size_band: 'small' as const, amount: small, sample: true },
      { state, size_band: 'medium' as const, amount: small * 1.5, sample: true },
      { state, size_band: 'large' as const, amount: small * 2, sample: true },
    ]
  },
)

describe('priceListFromRows', () => {
  const list = priceListFromRows({ components, installs, panelWatts: 550 })

  it('rebuilds the same price list the waiting list used from the seeded tables', () => {
    expect(list.panel).toEqual(SAMPLE_PRICE_LIST.panel)
    expect(list.batteryModule).toEqual(SAMPLE_PRICE_LIST.batteryModule)
    expect(list.inverters).toEqual(SAMPLE_PRICE_LIST.inverters)
    expect(list.accessoriesByKva).toEqual(SAMPLE_PRICE_LIST.accessoriesByKva)
    expect(list.sample).toBe(true)
  })

  it('installation is per state and size band', () => {
    expect(list.installByState.Lagos).toEqual({ small: 200000, medium: 300000, large: 400000 })
    expect(list.installByState.FCT.small).toBe(150000)
    expect(list.installByState.Other.large).toBe(400000)
  })

  it('ignores inactive components and prefers the panel matching the sizing panel watts', () => {
    const withExtra: ComponentRow[] = [
      ...components,
      {
        sku: 'PNL-450',
        name: '450 W panel',
        category: 'panels',
        unit_cost: 90000,
        stock_sizes: { watts: 450 },
        active: true,
        sample: false,
      },
      {
        sku: 'INV-30',
        name: '30 kVA',
        category: 'inverter',
        unit_cost: 4000000,
        stock_sizes: { kva: 30 },
        active: false,
        sample: false,
      },
    ]
    const l = priceListFromRows({ components: withExtra, installs, panelWatts: 550 })
    expect(l.panel.sku).toBe('PNL-550')
    expect(l.inverters.map((i) => i.sku)).not.toContain('INV-30')
    expect(priceListFromRows({ components: withExtra, installs, panelWatts: 450 }).panel.sku).toBe(
      'PNL-450',
    )
  })

  it('sample is false only when every row used is real', () => {
    const real = priceListFromRows({
      components: components.map((c) => ({ ...c, sample: false })),
      installs: installs.map((i) => ({ ...i, sample: false })),
      panelWatts: 550,
    })
    expect(real.sample).toBe(false)
  })

  it('throws a clear error when a category has no active component', () => {
    expect(() =>
      priceListFromRows({
        components: components.filter((c) => c.category !== 'battery'),
        installs,
        panelWatts: 550,
      }),
    ).toThrow(/battery/)
  })
})

describe('pricingFromRows', () => {
  it('maps margins and per-tenure rates (expected + spread + buffer)', () => {
    const p = pricingFromRows({ margins, rates })
    expect(p.marginByCategory).toEqual(SAMPLE_PRICING.marginByCategory)
    expect(p.pricingRateByTenure).toEqual({ 3: 0.24, 6: 0.24, 9: 0.24, 12: 0.24 })
    expect(p.pricingRateAnnual).toBe(0.24) // the 12-month rate, used by the estimate
    expect(p.sample).toBe(true)
  })

  it('uses the stored sum when present and recomputes it otherwise', () => {
    const p = pricingFromRows({
      margins,
      rates: rates.map((r) =>
        r.tenure_months === 3 ? { ...r, spread: 0.1, pricing_rate: null } : r,
      ),
    })
    expect(p.pricingRateByTenure[3]).toBeCloseTo(0.28, 6)
  })
})

describe('installBandFor', () => {
  it('small ≤ 3.5 kVA, medium ≤ 7.5 kVA, large above', () => {
    expect(installBandFor(1)).toBe('small')
    expect(installBandFor(3.5)).toBe('small')
    expect(installBandFor(5)).toBe('medium')
    expect(installBandFor(7.5)).toBe('medium')
    expect(installBandFor(10)).toBe('large')
  })
})
