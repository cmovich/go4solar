import { describe, expect, it } from 'vitest'

import { DEFAULT_QUOTE_SETTINGS } from '@/lib/settings/schemas'
import { assumedEquipment } from '@/lib/sizing/defaults'

import { priceSelection, suggestForLoad, type BuilderContext } from './server'

const eq = assumedEquipment()
const ctx: BuilderContext = {
  settings: DEFAULT_QUOTE_SETTINGS,
  catalogue: {
    details: new Map(),
    inverters: [2.5, 5, 7.5, 10].map((kva) => ({
      sku: `INV-${kva}`,
      name: `${kva} kVA inverter`,
      kva,
      unitCost: 300000 + kva * 50000,
      option: eq.inverters.find((i) => i.kva === kva)!,
    })),
    batteries: [
      { sku: 'BAT-2.5-24', name: '2.5 kWh 24 V', kwh: 2.5, voltage: 24, unitCost: 420000 },
      { sku: 'BAT-5-48', name: '5 kWh 48 V', kwh: 5, voltage: 48, unitCost: 1000000 },
    ],
    panels: [
      {
        sku: 'PNL-550',
        name: '550 W panel',
        watts: 550,
        unitCost: 110000,
        lengthCm: 228,
        option: eq.panel,
      },
    ],
    accessories: [
      { sku: 'ACC-7.5', name: 'Pack', kind: 'pack', rating: 7.5, unitCost: 180000, unit: 'each' },
      { sku: 'ACC-20', name: 'Pack', kind: 'pack', rating: 20, unitCost: 300000, unit: 'each' },
    ],
    rules: [],
    rackPrices: { metal: 25, aluminium: 40 },
    settings: {
      railsPerPanel: 1,
      clampPricePerPanel: 0,
      extraPerStorey: 0,
      maxDcVoltageDrop: 0.03,
    },
    logistics: [{ state: 'Other', amount: 50000, extraPerPanel: 0, localVendorsAvailable: false }],
    installByState: { Other: { small: 150000, medium: 200000, large: 300000 } },
    roofTypes: [],
  },
}
const sel = {
  scope: 'complete' as const,
  state: 'Lagos' as const,
  items: [],
  site: {},
  installer: 'go4solar' as const,
}

describe('suggestForLoad ("I know my load")', () => {
  it('an inverter at least the load, a battery at its voltage, panels and the accessories pack', () => {
    const items = suggestForLoad(ctx, 2, sel)
    const inv = items.find((i) => i.sku.startsWith('INV-'))!
    expect(Number(inv.sku.slice(4))).toBeGreaterThanOrEqual(2)
    const bat = items.find((i) => i.sku.startsWith('BAT-'))!
    expect(bat.sku).toBe('BAT-5-48') // a 48 V inverter takes the 48 V battery
    expect(items.find((i) => i.sku === 'PNL-550')!.qty).toBeGreaterThan(0)
    expect(items.some((i) => i.sku.startsWith('ACC-'))).toBe(true)
  })

  it('a load too big for sizing still gets a starting set (inverter by load, panels it can take)', () => {
    const items = suggestForLoad(ctx, 9, sel)
    expect(items.find((i) => i.sku.startsWith('INV-'))!.sku).toBe('INV-10')
    expect(items.find((i) => i.sku === 'PNL-550')!.qty).toBe(18) // 10 kW ÷ 550 W
  })
})

describe('priceSelection', () => {
  it('customer figures only, delivery and installation as separate lines', () => {
    const { priced } = priceSelection(
      ctx,
      {
        ...sel,
        items: [
          { sku: 'INV-5', qty: 1 },
          { sku: 'BAT-5-48', qty: 2 },
          { sku: 'PNL-550', qty: 6 },
          { sku: 'ACC-7.5', qty: 1 },
        ],
      },
      0.2,
      12,
    )
    expect(priced!.systemPrice).toBeGreaterThan(0)
    expect(priced!.monthly).toBeGreaterThan(0)
    expect(priced!.noMarkup.map((l) => l.label)).toEqual([
      'Installation',
      'Delivery — Go4Solar logistics (Lagos)',
    ])
    expect(JSON.stringify(priced)).not.toMatch(/unitCost|costPrice|markupShare/i)
    expect(priced!.blocking).toEqual([])
  })
  it('nothing chosen yet → no price', () => {
    expect(priceSelection(ctx, sel, 0.2, 12).priced!.systemPrice).toBe(0)
  })
})
