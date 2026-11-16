import { describe, expect, it } from 'vitest'

import { DEFAULT_QUOTE_SETTINGS } from '@/lib/settings/schemas'
import { assumedEquipment } from '@/lib/sizing/defaults'
import { DEFAULT_OFFER_TERMS, businessOfferFrom } from '@/lib/spewa/offer'

import { builderItems, priceSelection, suggestForLoad, type BuilderContext } from './server'

const eq = assumedEquipment()
const ctx: BuilderContext = {
  settings: DEFAULT_QUOTE_SETTINGS,
  catalogue: {
    details: new Map(),
    inverters: [2.5, 5, 7.5, 10].map((kva) => ({
      sku: `INV-${kva}`,
      name: `${kva} kVA inverter`,
      kva,
      unitCost: 300000 + kva * 50000,
      option: eq.inverters.find((i) => i.kva === kva)!,
    })),
    batteries: [
      { sku: 'BAT-2.5-24', name: '2.5 kWh 24 V', kwh: 2.5, voltage: 24, unitCost: 420000 },
      { sku: 'BAT-5-48', name: '5 kWh 48 V', kwh: 5, voltage: 48, unitCost: 1000000 },
    ],
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
      { sku: 'ACC-7.5', name: 'Pack', kind: 'pack', rating: 7.5, unitCost: 180000, unit: 'each' },
      { sku: 'ACC-20', name: 'Pack', kind: 'pack', rating: 20, unitCost: 300000, unit: 'each' },
    ],
    rules: [],
    rackPrices: { metal: 25, aluminium: 40 },
    settings: {
      railsPerPanel: 1,
      clampPricePerPanel: 0,
      extraPerStorey: 0,
      maxDcVoltageDrop: 0.03,
    },
    logistics: [{ state: 'Other', amount: 50000, extraPerPanel: 0, localVendorsAvailable: false }],
    installByState: { Other: { small: 150000, medium: 200000, large: 300000 } },
    roofTypes: [],
  },
}
const sel = {
  scope: 'complete' as const,
  state: 'Lagos' as const,
  items: [],
  site: {},
  installer: 'go4solar' as const,
}

describe('suggestForLoad ("I know my load")', () => {
  it('an inverter at least the load, a battery at its voltage, panels and the accessories pack', () => {
    const items = suggestForLoad(ctx, 2, sel)
    const inv = items.find((i) => i.sku.startsWith('INV-'))!
    expect(Number(inv.sku.slice(4))).toBeGreaterThanOrEqual(2)
    const bat = items.find((i) => i.sku.startsWith('BAT-'))!
    expect(bat.sku).toBe('BAT-5-48') // a 48 V inverter takes the 48 V battery
    expect(items.find((i) => i.sku === 'PNL-550')!.qty).toBeGreaterThan(0)
    expect(items.some((i) => i.sku.startsWith('ACC-'))).toBe(true)
  })

  it('a load too big for sizing still gets a starting set (inverter by load, panels it can take)', () => {
    const items = suggestForLoad(ctx, 9, sel)
    expect(items.find((i) => i.sku.startsWith('INV-'))!.sku).toBe('INV-10')
    expect(items.find((i) => i.sku === 'PNL-550')!.qty).toBe(18) // 10 kW ÷ 550 W
  })
})

describe('priceSelection', () => {
  it('customer figures only, delivery and installation as separate lines', () => {
    const { priced } = priceSelection(
      ctx,
      {
        ...sel,
        items: [
          { sku: 'INV-5', qty: 1 },
          { sku: 'BAT-5-48', qty: 2 },
          { sku: 'PNL-550', qty: 6 },
          { sku: 'ACC-7.5', qty: 1 },
        ],
      },
      0.2,
      12,
    )
    expect(priced!.systemPrice).toBeGreaterThan(0)
    expect(priced!.monthly).toBeGreaterThan(0)
    expect(priced!.noMarkup.map((l) => l.label)).toEqual([
      'Installation',
      'Delivery — Go4Solar logistics (Lagos)',
    ])
    expect(JSON.stringify(priced)).not.toMatch(/unitCost|costPrice|markupShare/i)
    expect(priced!.blocking).toEqual([])
  })
  it('nothing chosen yet → no price', () => {
    expect(priceSelection(ctx, sel, 0.2, 12).priced!.systemPrice).toBe(0)
  })
})

describe('business or institution (SPEWA offer) in the builder', () => {
  const spewaItem = (
    code: string,
    kind: 'inverter' | 'battery' | 'panel' | 'light',
    size: Record<string, number>,
    sell: number,
    partner: number,
  ) => ({
    id: code,
    itemNo: 1,
    category: 'Other' as const,
    code,
    product: `${code} product`,
    brand: 'SOLIS',
    warranty: null,
    prices: { showroom: null, installer: sell, level_b: null, level_a: null, big_dealer: partner },
    kind,
    ratingKw: size.kw ?? null,
    voltage: size.v ?? null,
    highVoltage: false,
    kwh: size.kwh ?? null,
    watts: size.w ?? null,
    active: true,
    sortOrder: 1,
  })
  const businessOffer = businessOfferFrom({
    items: [
      spewaItem('SPW-SLS-0004', 'inverter', { kw: 12, v: 48 }, 2_200_000, 1_750_000),
      spewaItem('SPW-BAT-15', 'battery', { kwh: 15, v: 48 }, 1_867_500, 1_675_000),
      spewaItem('SP-0001', 'panel', { w: 550 }, 113_000, 100_000),
      spewaItem('SPW-LGT-0001', 'light', { w: 100 }, 185_000, 165_000),
    ],
    terms: DEFAULT_OFFER_TERMS,
    rule: { funderId: 'f', minDepositShare: 0.3, tenures: [3, 6, 9, 12] },
    base: DEFAULT_QUOTE_SETTINGS.priceList,
  })!
  const bctx: BuilderContext = { ...ctx, settings: { ...ctx.settings, businessOffer } }
  const biz = { ...sel, applicantType: 'business' as const }

  it('lists SPEWA inverters, batteries, panels and lights at the selling price; our accessories stay', () => {
    const items = builderItems(bctx, 'business')
    expect(items.find((i) => i.sku === 'SPW-SLS-0004')).toMatchObject({
      group: 'inverter',
      price: 2_200_000,
      kva: 12,
      brand: 'SOLIS',
    })
    expect(items.find((i) => i.sku === 'SPW-LGT-0001')).toMatchObject({ group: 'lights' })
    expect(items.some((i) => i.sku === 'INV-5')).toBe(false)
    expect(items.some((i) => i.sku === 'ACC-7.5')).toBe(true)
    // Individuals keep our catalogue.
    expect(builderItems(bctx, 'individual').some((i) => i.sku === 'SPW-SLS-0004')).toBe(false)
  })

  it('item 31 alone at 30% over 12 months: 2,662,000 (plus installation and delivery)', () => {
    const { priced, quote } = priceSelection(
      bctx,
      { ...biz, items: [{ sku: 'SPW-SLS-0004', qty: 1 }], installer: 'own' },
      0.3,
      12,
    )
    expect(quote!.snapshot.offer?.kind).toBe('spewa')
    // Delivery (50,000, our table) is part of the cash price: 2,250,000.
    expect(quote!.deposit).toBe(675_000)
    expect(quote!.balance).toBe(Math.round(1_575_000 * 1.3))
    expect(priced!.minDepositShare).toBe(0.3)
    expect(priced!.tenures).toEqual([3, 6, 9, 12])
    expect(priced!.offer).toBe(true)
  })

  it('a deposit under 30% is raised to 30%; lights are priced as SPEWA lines', () => {
    const { quote } = priceSelection(
      bctx,
      { ...biz, items: [{ sku: 'SPW-LGT-0001', qty: 2 }], installer: 'own' },
      0.2,
      6,
    )
    expect(quote!.snapshot.depositShare).toBe(0.3)
    expect(quote!.snapshot.lines[0]).toMatchObject({ sellUnit: 185_000, unitCost: 165_000 })
  })

  it('"I know my load" suggests SPEWA equipment for a business', () => {
    const items = suggestForLoad(bctx, 8, biz)
    expect(items.some((i) => i.sku === 'SPW-SLS-0004')).toBe(true)
    expect(items.some((i) => i.sku === 'SP-0001')).toBe(true)
  })
})
