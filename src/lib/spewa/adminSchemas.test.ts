import { describe, expect, it } from 'vitest'

import { DEFAULT_OFFER_TERMS } from './offer'
import { itemToRow, offerTermsForm, spewaItemSchema, termsToForm } from './adminSchemas'

const ok = {
  itemNo: 31,
  category: 'Inverters',
  code: 'SPW-SLS-0004',
  product: 'Solis 12kW/48V S6-EH1P12K03-NV-YD-L On Grid',
  brand: 'SOLIS',
  warranty: '5 years',
  prices: {
    showroom: 2300000,
    installer: 2200000,
    level_b: 2000000,
    level_a: 1900000,
    big_dealer: 1750000,
  },
  kind: 'inverter',
  ratingKw: 12,
  voltage: 48,
  highVoltage: false,
  kwh: null,
  watts: null,
  active: true,
  sortOrder: 31,
}

describe('spewaItemSchema', () => {
  it('accepts a complete item and maps it to a database row', () => {
    const p = spewaItemSchema.parse(ok)
    expect(itemToRow(p)).toMatchObject({
      item_no: 31,
      code: 'SPW-SLS-0004',
      installer: 2200000,
      big_dealer: 1750000,
      kind: 'inverter',
      rating_kw: 12,
      voltage: 48,
      high_voltage: false,
      active: true,
    })
  })

  it('codes are stored upper-case; empty brand is null', () => {
    const p = spewaItemSchema.parse({ ...ok, code: ' spw-x ', brand: '' })
    expect(p.code).toBe('SPW-X')
    expect(p.brand).toBeNull()
  })

  it('prices may be empty, never negative', () => {
    expect(
      spewaItemSchema.safeParse({ ...ok, prices: { ...ok.prices, showroom: null } }).success,
    ).toBe(true)
    expect(
      spewaItemSchema.safeParse({ ...ok, prices: { ...ok.prices, showroom: -1 } }).success,
    ).toBe(false)
  })

  it('a switched-on inverter needs its kW, a battery its kWh, a panel its watts', () => {
    expect(spewaItemSchema.safeParse({ ...ok, ratingKw: null }).error?.issues[0]?.message).toBe(
      'Enter the inverter size (kW).',
    )
    expect(
      spewaItemSchema.safeParse({ ...ok, kind: 'battery', ratingKw: null, kwh: null }).error
        ?.issues[0]?.message,
    ).toBe('Enter the battery size (kWh).')
    expect(
      spewaItemSchema.safeParse({ ...ok, kind: 'panel', ratingKw: null }).error?.issues[0]
        ?.message,
    ).toBe('Enter the panel watts.')
    // Switched off: may be saved without a size.
    expect(spewaItemSchema.safeParse({ ...ok, ratingKw: null, active: false }).success).toBe(true)
  })
})

describe('offer terms form (percent on screen, decimals stored)', () => {
  it('round trip', () => {
    const form = termsToForm(DEFAULT_OFFER_TERMS)
    expect(form.charges).toEqual({ 3: 7.5, 6: 15, 9: 22.5, 12: 30 })
    expect(form.badDebtPct).toBe(2)
    expect(offerTermsForm.parse(form)).toEqual(DEFAULT_OFFER_TERMS)
  })

  it('switching the columns', () => {
    const t = offerTermsForm.parse({
      ...termsToForm(DEFAULT_OFFER_TERMS),
      partnerColumn: 'level_a',
      sellingColumn: 'showroom',
    })
    expect(t.partnerColumn).toBe('level_a')
    expect(t.sellingColumn).toBe('showroom')
  })

  it('refuses the same column for both, charges over 100% and a bad date', () => {
    const base = termsToForm(DEFAULT_OFFER_TERMS)
    expect(
      offerTermsForm.safeParse({ ...base, sellingColumn: 'big_dealer' }).error?.issues[0]?.message,
    ).toBe('The partner price and the selling price must be different columns.')
    expect(offerTermsForm.safeParse({ ...base, charges: { ...base.charges, 3: 120 } }).success).toBe(
      false,
    )
    expect(offerTermsForm.safeParse({ ...base, priceListDate: '9 Nov' }).success).toBe(false)
  })
})
