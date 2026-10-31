import { describe, expect, it } from 'vitest'

import { assumedEquipment } from '@/lib/sizing/defaults'

import { toBuilderItems } from './server'

const eq = assumedEquipment()

describe('toBuilderItems (what the browser gets)', () => {
  const cat = {
    details: new Map([['INV-5', { brand: 'Felicity', description: 'Hybrid', photoUrl: null }]]),
    inverters: [
      {
        sku: 'INV-5',
        name: '5 kVA inverter',
        kva: 5,
        unitCost: 400000,
        option: eq.inverters.find((i) => i.kva === 5)!,
      },
    ],
    batteries: [{ sku: 'BAT-5', name: '5 kWh battery', kwh: 5, voltage: 48, unitCost: 1000000 }],
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
      {
        sku: 'DCW-6',
        name: 'DC cable',
        kind: 'dc_wire' as const,
        rating: 6,
        unitCost: 1200,
        unit: 'metre' as const,
      },
    ],
    rackPrices: {},
    settings: {
      railsPerPanel: 1,
      clampPricePerPanel: 0,
      extraPerStorey: 0,
      maxDcVoltageDrop: 0.03,
    },
    logistics: [],
    installByState: {},
    roofTypes: [],
  }
  const pricing = {
    sample: false,
    pricingRateAnnual: 0.24,
    pricingRateByTenure: { 12: 0.24 },
    marginByCategory: { panels: 0.1, battery: 0.1, inverter: 0.1, accessories: 0.2 },
  }
  const items = toBuilderItems(cat, pricing, 0.2)

  it('never includes a cost price', () => {
    for (const i of items) expect(JSON.stringify(i)).not.toMatch(/unitCost|cost/i)
  })

  it('customer price = cost × (1 + margin) ÷ (1 − rate × 80%) at the lowest deposit over 12 months', () => {
    const inv = items.find((i) => i.sku === 'INV-5')!
    expect(inv.price).toBe(Math.round((400000 * 1.1) / (1 - 0.24 * 0.8)))
    expect(inv).toMatchObject({ group: 'inverter', size: '5 kVA · 48 V', brand: 'Felicity' })
    const wire = items.find((i) => i.sku === 'DCW-6')!
    expect(wire).toMatchObject({ group: 'dc_wire', unit: 'metre', size: '6 mm² · per metre' })
  })
})
