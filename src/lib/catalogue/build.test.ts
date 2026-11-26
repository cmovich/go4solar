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

  it('the customer may leave out delivery in any state (Semako, 2026-11-17)', () => {
    const b = assembleBuild({ ...sel, ownDelivery: true }, CAT)
    expect(b.noMarkup.some((l) => /Delivery/.test(l.label))).toBe(false)
    expect(b.notes).toContain('Customer arranges delivery (not charged).')
    expect(assembleBuild(sel, CAT).noMarkup.some((l) => /Delivery/.test(l.label))).toBe(true)
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

describe('installation and delivery rule (Semako, 26 Nov 2026)', () => {
  const only = (items: { sku: string; qty: number }[]) => ({
    ...sel,
    items,
    delivery: 'yes' as const,
  })
  it('one type of product: no installation, no delivery, no pack, no installer warning', () => {
    for (const items of [
      [
        { sku: 'INV-5', qty: 1 },
        { sku: 'ACC-7.5', qty: 1 },
      ],
      [{ sku: 'BAT-5-48', qty: 4 }],
      [{ sku: 'PNL-550', qty: 2 }],
    ]) {
      const b = assembleBuild({ ...only(items), installer: 'own' }, CAT)
      expect(b.shape).toBe('single')
      expect(b.noMarkup).toEqual([])
      expect(b.installCost).toBe(0)
      expect(b.lines.some((l) => l.sku === 'ACC-7.5')).toBe(false)
      expect(b.notes).not.toContain(
        'Go4Solar is not liable for any installation errors brought to us.',
      )
      expect(b.notes).not.toContain('Customer arranges delivery (not charged).')
      expect(b.notes).not.toContain('Includes the standard accessories pack.')
      expect(b.notes).not.toContain('Customer provides ladder/scaffold (not charged).')
    }
  })
  it('two or more types: charged only for a Yes', () => {
    const items = [
      { sku: 'INV-5', qty: 1 },
      { sku: 'BAT-5-48', qty: 1 },
    ]
    const yes = assembleBuild({ ...sel, items, installer: 'go4solar', delivery: 'yes' }, CAT)
    expect(yes.shape).toBe('multi')
    expect(yes.noMarkup.map((l) => l.label)).toEqual([
      'Installation',
      'Delivery — Go4Solar logistics (Kano)',
    ])
    const no = assembleBuild({ ...sel, items, installer: 'own', delivery: 'no' }, CAT)
    expect(no.noMarkup).toEqual([])
    expect(no.notes).toContain('Customer arranges delivery (not charged).')
    // Not answered yet: nothing charged.
    const unanswered = assembleBuild({ ...sel, items, installer: null, delivery: null }, CAT)
    expect(unanswered.noMarkup).toEqual([])
  })
  it('battery + panels without an inverter asks too (treated as a system)', () => {
    const b = assembleBuild(
      {
        ...sel,
        items: [
          { sku: 'BAT-5-48', qty: 1 },
          { sku: 'PNL-550', qty: 2 },
        ],
        delivery: 'yes',
      },
      CAT,
    )
    expect(b.shape).toBe('multi')
    expect(b.noMarkup.map((l) => l.label)).toContain('Installation')
  })
  it('no panels: the mounting and roof answers are ignored (no rack, no roof or storey extras)', () => {
    const b = assembleBuild(
      {
        ...sel,
        items: [
          { sku: 'INV-5', qty: 1 },
          { sku: 'BAT-5-48', qty: 1 },
        ],
        delivery: 'yes',
      },
      CAT,
    )
    expect(b.noMarkup.find((l) => l.label === 'Installation')?.amount).toBe(200000)
    expect(b.notes.some((n) => /rack|mounting structure/i.test(n))).toBe(false)
  })
  it('older saved choices (no delivery answer) keep the old meaning', () => {
    expect(assembleBuild(sel, CAT).noMarkup.some((l) => /Delivery/.test(l.label))).toBe(true)
    expect(
      assembleBuild({ ...sel, ownDelivery: true }, CAT).noMarkup.some((l) =>
        /Delivery/.test(l.label),
      ),
    ).toBe(false)
  })
})
