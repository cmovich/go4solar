import { describe, expect, it } from 'vitest'

import { sampleItems, sampleSummary, type SampleInput } from './sampleStatus'

const clean: SampleInput = {
  components: [
    { id: 'c1', sku: 'PNL-550', name: '550 W panel', active: true, sample: false },
    { id: 'c2', sku: 'INV-10', name: '10 kVA inverter', active: true, sample: false },
  ],
  margins: [{ category: 'panels', sample: false }],
  rates: [
    { tenureMonths: 12, enabled: true, sample: false },
    { tenureMonths: 24, enabled: false, sample: true },
  ],
  installation: [{ state: 'Lagos', sizeBand: 'small', sample: false }],
  unitCostsSample: false,
  energySample: false,
}

describe('sampleItems (what still needs confirming)', () => {
  it('nothing left: all prices confirmed, prices show on the website', () => {
    expect(sampleItems(clean)).toEqual([])
    expect(sampleSummary([])).toEqual({
      hiding: 0,
      other: 0,
      message: 'All prices confirmed — prices are showing on the website.',
    })
  })

  it('lists every SAMPLE row by section; switched-off tenures and inactive parts never count', () => {
    const items = sampleItems({
      ...clean,
      components: [
        ...clean.components,
        { id: 'c3', sku: 'INV-20', name: '20 kVA inverter', active: true, sample: true },
        { id: 'c4', sku: 'ACC-1.5', name: 'old tier', active: false, sample: true },
      ],
      margins: [{ category: 'battery', sample: true }],
      rates: [
        { tenureMonths: 12, enabled: true, sample: true },
        { tenureMonths: 24, enabled: false, sample: true },
      ],
      installation: [{ state: 'FCT', sizeBand: 'large', sample: true }],
      unitCostsSample: true,
      energySample: true,
    })
    expect(items).toEqual([
      { section: 'components', key: 'c3', label: 'INV-20 · 20 kVA inverter', hidesPrices: true },
      { section: 'margins', key: 'battery', label: 'Battery margin', hidesPrices: true },
      { section: 'rates', key: '12', label: '12 months rate', hidesPrices: true },
      {
        section: 'installation',
        key: 'FCT:large',
        label: 'Abuja (FCT) · large',
        hidesPrices: true,
      },
      { section: 'unit-costs', key: 'unit_costs', label: 'Unit costs', hidesPrices: false },
      { section: 'energy', key: 'energy', label: 'Energy prices and factors', hidesPrices: false },
    ])
    expect(sampleSummary(items)).toEqual({
      hiding: 4,
      other: 2,
      message:
        '4 items still marked SAMPLE — prices are hidden on the website until these are confirmed or changed',
    })
  })

  it('only admin-side items left: prices show on the website', () => {
    const items = sampleItems({ ...clean, unitCostsSample: true })
    expect(sampleSummary(items).message).toBe(
      'All prices confirmed — prices are showing on the website.',
    )
    expect(sampleSummary(items).other).toBe(1)
  })

  it('one item uses the singular', () => {
    const items = sampleItems({ ...clean, margins: [{ category: 'panels', sample: true }] })
    expect(sampleSummary(items).message).toBe(
      '1 item still marked SAMPLE — prices are hidden on the website until it is confirmed or changed',
    )
  })

  it('Part F: SAMPLE delivery and rack prices hide prices; rules and builder settings do not', () => {
    const items = sampleItems({
      ...clean,
      logistics: [
        { state: 'Other', sample: true },
        { state: 'lagos', sample: false },
      ],
      rackSample: true,
      rulesSample: true,
      builderSettingsSample: true,
    })
    expect(items.map((i) => [i.section, i.key, i.hidesPrices])).toEqual([
      ['delivery', 'Other', true],
      ['builder', 'racks', true],
      ['builder', 'rules', false],
      ['builder', 'settings', false],
    ])
    expect(items[0]!.label).toBe('Delivery · Other (fallback)')
    expect(sampleSummary(items).hiding).toBe(2)
  })

  it('Part F rows are optional (before migration 0027)', () => {
    expect(sampleItems(clean)).toEqual([])
  })
})
