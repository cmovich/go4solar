import { describe, expect, it } from 'vitest'

import { SPEC_FIELDS, missingSpecs, specProblems, usableComponents } from './specs'

const inverter = {
  category: 'inverter' as const,
  nominalVoltage: 24,
  specs: {
    ratedKva: 3.5,
    ratedW: 3500,
    batteryV: 24,
    maxPvW: 4000,
    maxPvVoc: 450,
    mpptMin: 120,
    mpptMax: 430,
    maxChargeA: 100,
    surgeW: 7000,
  },
}
const battery = {
  category: 'battery' as const,
  nominalVoltage: 24,
  specs: {
    nominalV: 25.6,
    capacityAh: 200,
    capacityKwh: 5.12,
    chemistry: 'LiFePO4',
    usableDod: 90,
    maxChargeA: 100,
    maxDischargeA: 100,
  },
}
const panel = {
  category: 'panels' as const,
  nominalVoltage: 24,
  specs: { wp: 550, voc: 49.6, vmp: 41.9, isc: 14, imp: 13.1, tempCoeffPmax: -0.35 },
}
const accessory = { category: 'accessories' as const, nominalVoltage: null, specs: { notes: '' } }

describe('SPEC_FIELDS', () => {
  it('lists the specs each category needs', () => {
    expect(SPEC_FIELDS.inverter.map((f) => f.key)).toEqual([
      'ratedKva',
      'ratedW',
      'batteryV',
      'maxPvW',
      'maxPvVoc',
      'mpptMin',
      'mpptMax',
      'maxChargeA',
      'surgeW',
      'maxAcChargeA',
    ])
    expect(SPEC_FIELDS.battery.map((f) => f.key)).toEqual([
      'nominalV',
      'capacityAh',
      'capacityKwh',
      'chemistry',
      'usableDod',
      'maxChargeA',
      'maxDischargeA',
    ])
    expect(SPEC_FIELDS.panels.map((f) => f.key)).toEqual([
      'wp',
      'voc',
      'vmp',
      'isc',
      'imp',
      'tempCoeffPmax',
    ])
    expect(SPEC_FIELDS.accessories.map((f) => f.key)).toEqual(['notes'])
  })
})

describe('missingSpecs', () => {
  it('complete items have none (accessories need no specs)', () => {
    for (const c of [inverter, battery, panel, accessory]) expect(missingSpecs(c)).toEqual([])
  })
  it('names what is missing, in plain words, including the nominal voltage', () => {
    expect(missingSpecs({ ...panel, nominalVoltage: null, specs: { wp: 550 } })).toEqual([
      'nominal voltage',
      'Voc',
      'Vmp',
      'Isc',
      'Imp',
      'temperature coefficient of Pmax',
    ])
  })
})

describe('specProblems (sensible values)', () => {
  it('accepts real datasheet values', () => {
    for (const c of [inverter, battery, panel]) expect(specProblems(c)).toEqual([])
  })
  it('refuses impossible numbers and inconsistent pairs', () => {
    expect(specProblems({ ...panel, specs: { ...panel.specs, vmp: 52 } })).toContain(
      'Vmp must be lower than Voc',
    )
    expect(specProblems({ ...panel, specs: { ...panel.specs, imp: 15 } })).toContain(
      'Imp must not be higher than Isc',
    )
    expect(specProblems({ ...inverter, specs: { ...inverter.specs, mpptMax: 500 } })).toContain(
      'MPPT max must not be higher than max PV Voc',
    )
    expect(specProblems({ ...inverter, specs: { ...inverter.specs, mpptMin: 440 } })).toContain(
      'MPPT min must be lower than MPPT max',
    )
    expect(specProblems({ ...inverter, specs: { ...inverter.specs, surgeW: 2000 } })).toContain(
      'Surge W must be at least the rated W',
    )
    expect(specProblems({ ...battery, specs: { ...battery.specs, usableDod: 120 } })).toContain(
      'Usable DoD must be between 10 and 100 %',
    )
    expect(specProblems({ ...battery, specs: { ...battery.specs, capacityKwh: 12 } })).toContain(
      'Capacity kWh does not match V × Ah (25.6 V × 200 Ah ≈ 5.12 kWh)',
    )
    expect(specProblems({ ...panel, specs: { ...panel.specs, tempCoeffPmax: 0.4 } })).toContain(
      'Temperature coefficient of Pmax must be between −1 and 0 %/°C',
    )
  })
})

describe('usableComponents (what the engine and builder may use)', () => {
  const rows = [
    {
      id: 'p1',
      sku: 'PNL-550',
      category: 'panels' as const,
      active: true,
      nominalVoltage: 24,
      specs: panel.specs,
    },
    {
      id: 'p2',
      sku: 'PNL-400',
      category: 'panels' as const,
      active: true,
      nominalVoltage: null,
      specs: {},
    },
    {
      id: 'b1',
      sku: 'BAT-5',
      category: 'battery' as const,
      active: true,
      nominalVoltage: null,
      specs: {},
    },
  ]
  it('skips items with missing specs, with a note', () => {
    const r = usableComponents(rows)
    expect(r.usable.map((c) => c.id)).toContain('p1')
    expect(r.usable.map((c) => c.id)).not.toContain('p2')
    expect(r.skipped).toContainEqual({
      sku: 'PNL-400',
      reason: expect.stringMatching(/^Specs missing: /),
    })
  })
  it('while a whole category has no complete item yet, it is kept (so quotes keep working) and flagged', () => {
    const r = usableComponents(rows)
    expect(r.usable.map((c) => c.id)).toContain('b1')
    expect(r.categoriesWithoutSpecs).toEqual(['battery'])
  })
})

// Part B: grid charging current is optional (40 A assumed when missing, with a warning), and an
// inverter with missing specs stays usable: the sizing engine fills the gaps with assumed values.
describe('inverter specs in Part B', () => {
  it('the AC (grid) charge current is optional', () => {
    expect(missingSpecs(inverter)).toEqual([])
    expect(SPEC_FIELDS.inverter.find((f) => f.key === 'maxAcChargeA')).toMatchObject({
      optional: true,
    })
  })

  it('inverters with missing specs are never skipped', () => {
    const { usable, skipped } = usableComponents([
      { id: 'i1', sku: 'INV-3.5', active: true, ...inverter },
      {
        id: 'i2',
        sku: 'INV-5',
        category: 'inverter',
        active: true,
        nominalVoltage: null,
        specs: {},
      },
    ])
    expect(usable.map((u) => u.sku)).toEqual(['INV-3.5', 'INV-5'])
    expect(skipped).toEqual([])
  })
})
