import { describe, expect, it } from 'vitest'

import { assumedEquipment } from '@/lib/sizing/defaults'

import { assembleBuild, type FullCatalogue } from './build'

const eq = assumedEquipment()
const CAT: FullCatalogue = {
  inverters: [
    {
      sku: 'INV-5',
      name: '5 kVA inverter',
      kva: 5,
      unitCost: 400000,
      option: eq.inverters.find((i) => i.kva === 5)!,
    },
  ],
  batteries: [{ sku: 'BAT-5-48', name: '5 kWh battery', kwh: 5, voltage: 48, unitCost: 1_000_000 }],
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
      sku: 'ACC-7.5',
      name: 'Protection, cables and mounting',
      kind: 'pack',
      rating: 7.5,
      unitCost: 180000,
      unit: 'each',
    },
    {
      sku: 'DCW-6',
      name: 'DC solar cable 6 mm²',
      kind: 'dc_wire',
      rating: 6,
      unitCost: 1200,
      unit: 'metre',
    },
  ],
  rackPrices: { metal: 25, aluminium: 40 },
  settings: {
    railsPerPanel: 1,
    clampPricePerPanel: 0,
    extraPerStorey: 10000,
    maxDcVoltageDrop: 0.03,
  },
  logistics: [{ state: 'Other', amount: 50000, extraPerPanel: 0, localVendorsAvailable: false }],
  installByState: { Other: { small: 150000, medium: 200000, large: 300000 } },
  roofTypes: [
    { id: 'roof-1', name: 'Stone-coated tiles', needsRack: true, price: 5000, unit: 'per_panel' },
  ],
}

const sel = {
  scope: 'complete' as const,
  state: 'Kano' as const,
  items: [
    { sku: 'INV-5', qty: 1 },
    { sku: 'BAT-5-48', qty: 2 },
    { sku: 'PNL-550', qty: 6 },
    { sku: 'DCW-6', qty: 40 },
  ],
  site: {
    mounting: 'roof' as const,
    roofTypeId: 'roof-1',
    rack: { wanted: true, material: 'aluminium' as const },
    building: { unit: 'storeys' as const, height: 2, floor: 0 },
  },
  installer: 'go4solar' as const,
}

describe('assembleBuild (the builder selection → invoice lines)', () => {
  it('equipment lines from the selection, wires by the metre, plus the rack', () => {
    const b = assembleBuild(sel, CAT)
    expect(b.lines.map((l) => [l.sku, l.qty, l.category])).toEqual([
      ['INV-5', 1, 'inverter'],
      ['BAT-5-48', 2, 'battery'],
      ['PNL-550', 6, 'panels'],
      ['DCW-6', 40, 'accessories'],
      ['RACK-ALUMINIUM', 1, 'accessories'],
    ])
  })

  it('installation (state base for the size band + roof per panel + storeys) and delivery, never marked up', () => {
    const b = assembleBuild(sel, CAT)
    expect(b.noMarkup).toEqual([
      { label: 'Installation', amount: 200000 + 6 * 5000 + 2 * 10000 },
      { label: 'Delivery — Go4Solar logistics (Kano)', amount: 50000 },
    ])
    expect(b.installCost).toBe(250000 + 50000)
  })

  it('own installer: no installation line, and the liability warning', () => {
    const b = assembleBuild({ ...sel, installer: 'own' }, CAT)
    expect(b.noMarkup.map((l) => l.label)).toEqual(['Delivery — Go4Solar logistics (Kano)'])
    expect(b.notes).toContain('Go4Solar is not liable for any installation errors brought to us.')
  })

  it('delivery can only be left out where local vendors exist', () => {
    expect(
      assembleBuild({ ...sel, ownDelivery: true }, CAT).noMarkup.some((l) =>
        /Delivery/.test(l.label),
      ),
    ).toBe(true)
    const local = {
      ...CAT,
      logistics: [{ state: 'Other', amount: 50000, extraPerPanel: 0, localVendorsAvailable: true }],
    }
    const b = assembleBuild({ ...sel, ownDelivery: true }, local)
    expect(b.noMarkup.some((l) => /Delivery/.test(l.label))).toBe(false)
    expect(b.notes).toContain('Customer arranges delivery with a local vendor.')
  })

  it('compatibility problems block; unknown items are ignored', () => {
    const b = assembleBuild(
      { ...sel, items: [...sel.items, { sku: 'NOPE', qty: 1 }, { sku: 'PNL-550', qty: 0 }] },
      CAT,
    )
    expect(b.lines.some((l) => l.sku === 'NOPE')).toBe(false)
    expect(b.compat.blocking).toEqual([])
    const bad = assembleBuild(
      {
        ...sel,
        items: [
          { sku: 'INV-5', qty: 1 },
          { sku: 'PNL-550', qty: 20 },
        ],
      },
      CAT,
    )
    expect(bad.compat.blocking[0]).toMatch(/more than the 5 kVA inverter can take/)
  })

  it('carries the quote notes (ladder/scaffold, rack declined…)', () => {
    const b = assembleBuild({ ...sel, site: { ...sel.site, rack: { wanted: false } } }, CAT)
    expect(b.notes).toContain('Customer provides ladder/scaffold (not charged).')
    expect(b.notes).toContain(
      'Customer declined rack; installation on this roof may not be possible without one.',
    )
    expect(b.lines.some((l) => l.sku.startsWith('RACK'))).toBe(false)
  })
})
