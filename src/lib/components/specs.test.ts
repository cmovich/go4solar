import { describe, expect, it } from 'vitest'

import { SPEC_FIELDS, NEEDED_TO_QUOTE, missingSpecs, specProblems, specWarnings } from './specs'

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
  specs: {
    wp: 550,
    voc: 49.6,
    vmp: 41.9,
    isc: 14,
    imp: 13.1,
    tempCoeffPmax: -0.35,
    lengthCm: 228,
    widthCm: 113,
  },
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
      'lengthCm',
      'widthCm',
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
      'length',
      'width',
    ])
  })
})

describe('specProblems (only what is filled in; blocks saving)', () => {
  it('accepts real datasheet values', () => {
    for (const c of [inverter, battery, panel]) expect(specProblems(c)).toEqual([])
  })
  it('accepts partial specs: one field, or none at all', () => {
    expect(specProblems({ ...inverter, nominalVoltage: null, specs: { ratedKva: 5 } })).toEqual([])
    expect(specProblems({ ...battery, nominalVoltage: null, specs: {} })).toEqual([])
    expect(specProblems({ ...panel, specs: { voc: 49.6 } })).toEqual([])
  })
  it('refuses numbers out of a sensible range', () => {
    expect(specProblems({ ...battery, specs: { ...battery.specs, usableDod: 120 } })).toContain(
      'Usable DoD must be between 10 and 100 %',
    )
    expect(specProblems({ ...panel, specs: { ...panel.specs, tempCoeffPmax: 0.4 } })).toContain(
      'Temperature coefficient of Pmax must be between −1 and 0 %/°C',
    )
  })
  it('refuses text in a number field', () => {
    expect(specProblems({ ...panel, specs: { voc: '49.6V' } })).toEqual(['Voc must be a number'])
  })
  it('never blocks on pairs that do not match (those are warnings)', () => {
    expect(specProblems({ ...panel, specs: { ...panel.specs, vmp: 52 } })).toEqual([])
    expect(specProblems({ ...battery, specs: { ...battery.specs, capacityKwh: 12 } })).toEqual([])
  })
})

describe('specWarnings (pairs that do not match; shown, never block saving)', () => {
  it('none for real datasheet values or partial specs', () => {
    for (const c of [inverter, battery, panel]) expect(specWarnings(c)).toEqual([])
    expect(specWarnings({ ...panel, specs: { vmp: 52 } })).toEqual([])
  })
  it('names inconsistent pairs in plain words', () => {
    expect(specWarnings({ ...panel, specs: { ...panel.specs, vmp: 52 } })).toContain(
      'Vmp is usually lower than Voc',
    )
    expect(specWarnings({ ...panel, specs: { ...panel.specs, imp: 15 } })).toContain(
      'Imp is usually not higher than Isc',
    )
    expect(specWarnings({ ...inverter, specs: { ...inverter.specs, mpptMax: 500 } })).toContain(
      'MPPT max is usually not higher than max PV Voc',
    )
    expect(specWarnings({ ...inverter, specs: { ...inverter.specs, mpptMin: 440 } })).toContain(
      'MPPT min is usually lower than MPPT max',
    )
    expect(specWarnings({ ...inverter, specs: { ...inverter.specs, surgeW: 2000 } })).toContain(
      'Surge W is usually at least the rated W',
    )
    expect(specWarnings({ ...battery, specs: { ...battery.specs, capacityKwh: 12 } })).toContain(
      'Capacity kWh does not match V × Ah (25.6 V × 200 Ah ≈ 5.12 kWh)',
    )
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
})

// Part F: the rack is priced per cm of panel length; without it the panel is "Incomplete".
describe('panel length and width', () => {
  it('missing → listed as incomplete', () => {
    const specs: Record<string, number | null> = { ...panel.specs, lengthCm: null, widthCm: null }
    expect(missingSpecs({ ...panel, specs })).toEqual(['length', 'width'])
  })
})

// No datasheet spec is needed for an item to be quoted: the row's size and unit cost are.
describe('neededToQuote', () => {
  it('names the main columns each category needs (no datasheet specs)', () => {
    expect(NEEDED_TO_QUOTE.inverter).toEqual(['size (kVA)', 'unit cost'])
    expect(NEEDED_TO_QUOTE.panels).toEqual(['size (W)', 'unit cost'])
    expect(NEEDED_TO_QUOTE.battery).toEqual(['size (kWh)', 'unit cost'])
    expect(NEEDED_TO_QUOTE.accessories).toEqual(['size (max kVA)', 'unit cost'])
  })
})
