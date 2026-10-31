import { describe, expect, it } from 'vitest'

import { isOwnSystem, OWN_SYSTEM_LABEL, storedBuild } from './stored'

const quote = {
  systemPrice: 2_000_000,
  deposit: 400_000,
  monthly: 150_000,
  snapshot: { tenureMonths: 12 },
  lines: [
    { sku: 'INV-5', name: '5 kVA inverter', qty: 1, lineTotal: 900_000, unitCost: 600_000 },
    { sku: 'PNL-550', name: '550 W panel', qty: 6, lineTotal: 700_000 },
  ],
  noMarkup: [
    { label: 'Installation', amount: 250_000 },
    { label: 'Delivery — Go4Solar logistics (Lagos)', amount: 150_000 },
  ],
}

describe('storedBuild (a saved builder system, for staff and the customer)', () => {
  it('decodes the priced snapshot without cost prices', () => {
    const b = storedBuild({ kind: 'builder', quote, notes: ['Rack: metal'], sample: false })
    expect(b).toEqual({
      systemPrice: 2_000_000,
      deposit: 400_000,
      monthly: 150_000,
      months: 12,
      lines: [
        { name: '5 kVA inverter', qty: 1, lineTotal: 900_000 },
        { name: '550 W panel', qty: 6, lineTotal: 700_000 },
      ],
      extras: quote.noMarkup,
      notes: ['Rack: metal'],
      sample: false,
    })
    expect(JSON.stringify(b)).not.toMatch(/unitCost/)
  })

  it('null for anything that is not a builder system', () => {
    expect(storedBuild(null)).toBeNull()
    expect(storedBuild({})).toBeNull()
    expect(storedBuild({ kind: 'builder' })).toBeNull()
    expect(storedBuild('x')).toBeNull()
  })

  it('older saves without a sample flag count as sample (prices hidden)', () => {
    expect(storedBuild({ kind: 'builder', quote })!.sample).toBe(true)
  })
})

describe('isOwnSystem', () => {
  it('true only for a builder value', () => {
    expect(isOwnSystem({ kind: 'builder', quote })).toBe(true)
    expect(isOwnSystem({ kind: 'builder' })).toBe(true)
    expect(isOwnSystem(null)).toBe(false)
    expect(isOwnSystem(undefined)).toBe(false)
    expect(isOwnSystem({ kind: 'other' })).toBe(false)
    expect(OWN_SYSTEM_LABEL).toBe('Your own system')
  })
})
