import { describe, expect, it } from 'vitest'

import type { ComponentDraft } from './adminSchemas'
import { checkComponentRows, isPackRow, stockSizesFor } from './componentRows'

const row = (over: Partial<ComponentDraft>): ComponentDraft => ({
  sku: 'X',
  name: 'Item',
  category: 'accessories',
  unitCost: 1000,
  size: 0,
  source: 'oem',
  active: true,
  sample: false,
  nominalVoltage: null,
  specs: {},
  kind: 'flex_pipe',
  ...over,
})

describe('checkComponentRows', () => {
  it('an accessory saves with a blank or 0 size (not applicable); stored with no size', () => {
    for (const size of [null, 0, '']) {
      const r = checkComponentRows([{ ...row({ sku: 'FLX-25' }), size }])
      expect(r.errors).toEqual([])
      expect(r.valid).toHaveLength(1)
      expect(stockSizesFor(r.valid[0]!.draft)).toEqual({})
    }
  })

  it('a pack needs its max kVA (that is how it is picked)', () => {
    const r = checkComponentRows([row({ sku: 'ACC-2', kind: 'pack', size: 0 })])
    expect(r.errors).toEqual([
      { index: 0, sku: 'ACC-2', message: 'Enter the max kVA for this pack (it is picked by it).' },
    ])
    const ok = checkComponentRows([row({ sku: 'ACC-2', kind: 'pack', size: 2 })])
    expect(stockSizesFor(ok.valid[0]!.draft)).toEqual({ maxKva: 2 })
  })

  it('inverters, batteries and panels still need a size; missing volts is a warning', () => {
    const r = checkComponentRows([
      row({ sku: 'INV-1', category: 'inverter', kind: null, size: 0 }),
      row({ sku: 'INV-2', category: 'inverter', kind: null, size: 2 }),
    ])
    expect(r.errors).toEqual([{ index: 0, sku: 'INV-1', message: 'Enter the size (kVA).' }])
    expect(r.valid.map((v) => v.draft.sku)).toEqual(['INV-2'])
    expect(r.warnings).toEqual([{ index: 1, sku: 'INV-2', message: 'Volts not entered yet.' }])
    expect(stockSizesFor(r.valid[0]!.draft)).toEqual({ kva: 2 })
  })

  it('one bad row never blocks the others', () => {
    const r = checkComponentRows([
      row({ sku: 'FLX-25' }),
      row({ sku: 'PNL-550', category: 'panels', kind: null, size: 0 }),
      row({ sku: 'ACC-2', kind: 'pack', size: 2, unitCost: 87_500 }),
      row({ sku: 'flx-25' }),
    ])
    expect(r.valid.map((v) => v.index)).toEqual([0, 2])
    expect(r.errors.map((e) => [e.index, e.message])).toEqual([
      [1, 'Enter the size (W).'],
      [3, 'FLX-25 is already used on row 1. Use a different SKU.'],
    ])
  })

  it('a row that fails the form check names the field', () => {
    const r = checkComponentRows([row({ sku: '', unitCost: -1 })])
    expect(r.errors[0]).toMatchObject({ index: 0 })
    expect(r.valid).toEqual([])
  })
})

describe('isPackRow: only packs are auto-added by size', () => {
  it('ordinary accessories are never packs, whatever their size', () => {
    for (const kind of ['flex_pipe', 'dc_breaker', 'ac_breaker', 'changeover'] as const) {
      expect(isPackRow({ category: 'accessories', kind, maxKva: 1 })).toBe(false)
    }
  })
  it('a pack needs a max kVA above 0; rows with no type and no size are not packs', () => {
    expect(isPackRow({ category: 'accessories', kind: 'pack', maxKva: 2 })).toBe(true)
    expect(isPackRow({ category: 'accessories', kind: 'pack', maxKva: null })).toBe(false)
    expect(isPackRow({ category: 'accessories', kind: null, maxKva: null })).toBe(false)
    expect(isPackRow({ category: 'accessories', kind: null, maxKva: 7.5 })).toBe(true)
    expect(isPackRow({ category: 'inverter', kind: null, maxKva: 2 })).toBe(false)
  })
})
