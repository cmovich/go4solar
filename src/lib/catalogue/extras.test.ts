import { describe, expect, it } from 'vitest'

import { installationCost, logisticsFor, rackLine, OWN_INSTALLER_WARNING } from './extras'

describe('rackLine (racks are equipment: markup applies)', () => {
  const base = {
    panels: 6,
    panelLengthCm: 228,
    pricePerCm: 40,
    railsPerPanel: 1,
    clampPricePerPanel: 0,
  }
  it('panels × length × price per cm × rails per panel + clamps, as one invoice line', () => {
    expect(rackLine({ ...base, material: 'aluminium', mounting: 'roof' })).toEqual({
      sku: 'RACK-ALUMINIUM',
      name: 'Aluminium roof rack — 6 panels × 228 cm',
      category: 'accessories',
      unitCost: 6 * 228 * 40,
      qty: 1,
    })
    expect(
      rackLine({
        ...base,
        material: 'metal',
        mounting: 'roof',
        railsPerPanel: 2,
        clampPricePerPanel: 1500,
      })!.unitCost,
    ).toBe(6 * 228 * 40 * 2 + 6 * 1500)
  })
  it('no rack on ground mounting, when declined, or without the panel length', () => {
    expect(rackLine({ ...base, material: 'metal', mounting: 'ground' })).toBeNull()
    expect(rackLine({ ...base, material: null, mounting: 'roof' })).toBeNull()
    expect(
      rackLine({ ...base, material: 'metal', mounting: 'roof', panelLengthCm: null }),
    ).toBeNull()
  })
})

describe('logisticsFor', () => {
  const rows = [
    { state: 'Lagos', amount: 40000, extraPerPanel: 1000, localVendorsAvailable: true },
    { state: 'Other', amount: 50000, extraPerPanel: 0, localVendorsAvailable: false },
  ]
  it('the state’s own price (+ per panel); removable only where local vendors exist', () => {
    expect(logisticsFor('Lagos', 6, rows)).toEqual({
      label: 'Delivery — Go4Solar logistics (Lagos)',
      amount: 46000,
      removable: true,
    })
  })
  it('a state without a row uses "Other" and is never removable', () => {
    expect(logisticsFor('Kano', 6, rows)).toEqual({
      label: 'Delivery — Go4Solar logistics (Kano)',
      amount: 50000,
      removable: false,
    })
  })
  it('no rows (before the catalogue exists) → none', () => {
    expect(logisticsFor('Kano', 6, [])).toBeNull()
  })
})

describe('installationCost', () => {
  const base = { baseCost: 200000, panels: 6, panelKw: 3.3, storeysAbove: 2, extraPerStorey: 10000 }
  it('Go4Solar installer: base + roof price + height', () => {
    expect(
      installationCost({
        ...base,
        installer: 'go4solar',
        roof: { price: 5000, unit: 'per_panel' },
      }),
    ).toBe(200000 + 30000 + 20000)
    expect(
      installationCost({ ...base, installer: 'go4solar', roof: { price: 10000, unit: 'per_kw' } }),
    ).toBe(200000 + 33000 + 20000)
    expect(installationCost({ ...base, installer: 'go4solar', roof: null, storeysAbove: 0 })).toBe(
      200000,
    )
  })
  it('own installer: no installation charge (and the liability warning)', () => {
    expect(installationCost({ ...base, installer: 'own', roof: null })).toBe(0)
    expect(OWN_INSTALLER_WARNING).toBe(
      'Go4Solar is not liable for any installation errors brought to us.',
    )
  })
})
