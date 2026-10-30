import { describe, expect, it } from 'vitest'

import { equipmentFrom } from './equipment'

const fullInverter = {
  ratedKva: 5,
  ratedW: 5000,
  batteryV: 48,
  maxPvW: 6500,
  maxPvVoc: 500,
  mpptMin: 120,
  mpptMax: 450,
  maxChargeA: 100,
  surgeW: 10000,
}

describe('equipmentFrom (price list → what the sizing engine uses)', () => {
  it('uses entered specs; nothing assumed', () => {
    const e = equipmentFrom({
      inverters: [
        { sku: 'INV-5', kva: 5, nominalVoltage: 48, specs: { ...fullInverter, maxAcChargeA: 60 } },
      ],
      panel: { sku: 'PNL-550', watts: 550, specs: { voc: 50.1, vmp: 42 } },
      batteries: [],
    })
    expect(e.inverters[0]).toEqual({
      sku: 'INV-5',
      kva: 5,
      batteryV: 48,
      maxPvW: 6500,
      maxPvVoc: 500,
      mpptMin: 120,
      mpptMax: 450,
      maxChargeA: 100,
      surgeW: 10000,
      acChargeA: 60,
      assumed: [],
    })
    expect(e.panel).toEqual({ sku: 'PNL-550', watts: 550, voc: 50.1, vmp: 42, assumed: [] })
  })

  it('fills missing specs from the assumed table and lists them', () => {
    const e = equipmentFrom({
      inverters: [{ sku: 'INV-3.5', kva: 3.2, nominalVoltage: null, specs: { maxPvW: 4500 } }],
      panel: { sku: 'PNL-550', watts: 550, specs: {} },
      batteries: [],
    })
    const inv = e.inverters[0]!
    expect(inv.maxPvW).toBe(4500)
    expect(inv.batteryV).toBe(24) // 3.2 kVA → the 3.5 kVA row
    expect(inv.acChargeA).toBeNull()
    expect(inv.assumed).toContain('battery voltage')
    expect(inv.assumed).toContain('max PV Voc')
    expect(inv.assumed).not.toContain('max PV input W')
    expect(e.panel.assumed).toEqual(['Voc', 'Vmp'])
  })

  it('the nominal voltage column counts as the battery voltage', () => {
    const e = equipmentFrom({
      inverters: [{ sku: 'INV-5', kva: 5, nominalVoltage: 24, specs: {} }],
      panel: { sku: 'P', watts: 550, specs: {} },
      batteries: [],
    })
    expect(e.inverters[0]!.batteryV).toBe(24)
    expect(e.inverters[0]!.assumed).not.toContain('battery voltage')
  })

  it('only batteries with complete specs join the catalogue', () => {
    const e = equipmentFrom({
      inverters: [],
      panel: { sku: 'P', watts: 550, specs: {} },
      batteries: [
        {
          sku: 'BAT-5-48',
          kwh: 5,
          unitCost: 1_000_000,
          nominalVoltage: 48,
          specs: {
            nominalV: 51.2,
            capacityAh: 100,
            capacityKwh: 5.12,
            chemistry: 'LiFePO4',
            usableDod: 90,
            maxChargeA: 100,
            maxDischargeA: 100,
          },
        },
        { sku: 'BAT-2.5', kwh: 2.5, unitCost: 420_000, nominalVoltage: null, specs: {} },
      ],
    })
    expect(e.batteries).toEqual([
      { sku: 'BAT-5-48', kwh: 5.12, voltage: 48, usableDod: 0.9, unitCost: 1_000_000 },
    ])
  })
})
