import { describe, expect, it } from 'vitest'

import {
  ACCESSORY_KINDS,
  KIND_LABELS,
  autoPickAccessories,
  dcWireMm2,
  ruleFor,
  type AccessoryRule,
  type CatalogueItem,
} from './autopick'

const rule = (max: number, over: Partial<AccessoryRule> = {}): AccessoryRule => ({
  maxKva: max,
  dcBreakerA: 63,
  acBreakerA: 63,
  dcSurgeV: 1000,
  acSurgeKa: 40,
  batteryBreakerA: 250,
  changeoverA: 63,
  regulatorKva: 5,
  boxWays: 8,
  trunkPipeMm: 25,
  flexPipeMm: 25,
  acWireMm2: 10,
  dcWireMm2: 6,
  trunkPipeM: 12,
  flexPipeM: 6,
  ...over,
})
const RULES = [rule(3.5, { dcBreakerA: 32, boxWays: 4 }), rule(5), rule(20, { dcBreakerA: 125 })]

const item = (
  sku: string,
  kind: CatalogueItem['kind'],
  rating: number,
  unitCost = 1000,
  unit: 'each' | 'metre' = 'each',
): CatalogueItem => ({
  sku,
  name: sku,
  kind,
  rating,
  unitCost,
  unit,
})
const CATALOGUE: CatalogueItem[] = [
  item('DCB-32', 'dc_breaker', 32),
  item('DCB-63', 'dc_breaker', 63),
  item('DCB-125', 'dc_breaker', 125),
  item('ACB-63', 'ac_breaker', 63),
  item('DCS-1000', 'dc_surge', 1000),
  item('ACS-40', 'ac_surge', 40),
  item('BTB-250', 'battery_breaker', 250),
  item('CHG-63', 'changeover', 63),
  item('VRG-5', 'voltage_regulator', 5),
  item('BOX-8', 'breaker_box', 8),
  item('TRK-25', 'trunk_pipe', 25, 800, 'metre'),
  item('FLX-25', 'flex_pipe', 25, 600, 'metre'),
  item('ACW-10', 'ac_wire', 10, 3500, 'metre'),
  item('DCW-6', 'dc_wire', 6, 1200, 'metre'),
  item('DCW-10', 'dc_wire', 10, 2200, 'metre'),
  item('DCW-16', 'dc_wire', 16, 3500, 'metre'),
]

describe('accessory kinds', () => {
  it('lists every accessory a quote gets, in order, with plain labels', () => {
    expect(ACCESSORY_KINDS).toEqual([
      'ac_surge',
      'dc_surge',
      'ac_breaker',
      'dc_breaker',
      'changeover',
      'voltage_regulator',
      'battery_breaker',
      'breaker_box',
      'trunk_pipe',
      'flex_pipe',
      'ac_wire',
      'dc_wire',
    ])
    expect(KIND_LABELS.voltage_regulator).toBe('Voltage regulator')
  })
})

describe('ruleFor', () => {
  it('the first rule whose max kVA covers the inverter; the largest beyond', () => {
    expect(ruleFor(RULES, 2.5)?.maxKva).toBe(3.5)
    expect(ruleFor(RULES, 5)?.maxKva).toBe(5)
    expect(ruleFor(RULES, 30)?.maxKva).toBe(20)
    expect(ruleFor([], 5)).toBeNull()
  })
})

describe('dcWireMm2 (voltage drop ≤ 3%)', () => {
  it('a long run at low voltage needs a thicker cable', () => {
    // 2 × 30 m × 26 A × 0.0175 Ω·mm²/m ÷ (0.03 × 166 V) ≈ 5.5 mm²
    expect(dcWireMm2({ lengthM: 30, currentA: 26, voltageV: 166, maxDrop: 0.03 })).toBeCloseTo(
      5.48,
      1,
    )
    expect(dcWireMm2({ lengthM: 60, currentA: 26, voltageV: 166, maxDrop: 0.03 })).toBeCloseTo(
      10.96,
      1,
    )
  })
})

describe('autoPickAccessories', () => {
  const sys = {
    inverterKva: 5,
    dcRunM: 30,
    acRunM: 12,
    stringCurrentA: 13,
    stringVoltageV: 166,
    maxDrop: 0.03,
  }

  it('one of each accessory, pipes and wires by the metre, each matched to the rule', () => {
    const picks = autoPickAccessories(sys, RULES, CATALOGUE)
    const by = Object.fromEntries(picks.map((p) => [p.kind, p]))
    expect(picks.map((p) => p.kind)).toEqual(ACCESSORY_KINDS)
    expect(by.dc_breaker).toMatchObject({ sku: 'DCB-63', qty: 1 })
    expect(by.trunk_pipe).toMatchObject({ sku: 'TRK-25', qty: 12 })
    expect(by.flex_pipe).toMatchObject({ sku: 'FLX-25', qty: 6 })
    expect(by.ac_wire).toMatchObject({ sku: 'ACW-10', qty: 12 })
    // 30 m × 2 conductors of DC cable, at least the rule's 6 mm² and enough for the 3% drop.
    expect(by.dc_wire).toMatchObject({ sku: 'DCW-6', qty: 60 })
  })

  it('a long DC run moves up a cable size to keep the drop under 3%', () => {
    const by = Object.fromEntries(
      autoPickAccessories({ ...sys, dcRunM: 60, stringCurrentA: 26 }, RULES, CATALOGUE).map((p) => [
        p.kind,
        p,
      ]),
    )
    expect(by.dc_wire!.sku).toBe('DCW-16')
  })

  it('the nearest larger item when the exact rating is not stocked; missing kinds are left out', () => {
    const picks = autoPickAccessories(
      { ...sys, inverterKva: 2.5 },
      RULES,
      CATALOGUE.filter((c) => c.kind !== 'changeover'),
    )
    const by = Object.fromEntries(picks.map((p) => [p.kind, p]))
    expect(by.breaker_box!.sku).toBe('BOX-8') // rule wants 4 ways; 8 is the smallest stocked ≥ 4
    expect(by.changeover).toBeUndefined()
  })

  it('no rules or no itemised catalogue → nothing (the old pack is used instead)', () => {
    expect(autoPickAccessories(sys, [], CATALOGUE)).toEqual([])
    expect(autoPickAccessories(sys, RULES, [])).toEqual([])
  })
})
