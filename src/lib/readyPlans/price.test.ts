import { describe, expect, it } from 'vitest'

import { inverterText } from '@/lib/sizing/describe'

import { SEEDED_PLANS } from './plans.fixture'
import {
  cardFigures,
  deliveryExtra,
  fullPaymentQuoteResult,
  planSize,
  planPrice,
  priceReadyPlan,
  publicPlan,
  readyQuoteResult,
  vendorTotal,
} from './price'

const plan = (slug: string) => SEEDED_PLANS.find((p) => p.slug === slug)!
const ORDER = ['i-pass-my-neighbour', 'level-up', 'oga-boss', 'no-wahala', 'no-shaking', 'relax']

describe('priceReadyPlan: the figures Semako gave (Kaduna, no extra delivery)', () => {
  // deposit / 12-month monthly / full payment
  const twelve: [number, number, number][] = [
    [93_000, 49_600, 516_150],
    [169_400, 90_347, 940_170],
    [261_400, 139_413, 1_450_770],
    [285_400, 152_213, 1_583_970],
    [387_000, 206_400, 2_147_850],
    [684_000, 364_800, 4_049_280],
  ]
  // 6- and 9-month monthly
  const shorter: [number, number][] = [
    [80_600, 59_933],
    [146_813, 109_169],
    [226_547, 168_458],
    [247_347, 183_924],
    [335_400, 249_400],
    [592_800, 440_800],
  ]
  ORDER.forEach((slug, i) => {
    it(`${plan(slug).name}`, () => {
      const p12 = priceReadyPlan(plan(slug), 12)
      expect([p12.deposit, p12.monthly, p12.fullPayment]).toEqual(twelve[i])
      expect(priceReadyPlan(plan(slug), 6).monthly).toBe(shorter[i]![0])
      expect(priceReadyPlan(plan(slug), 9).monthly).toBe(shorter[i]![1])
    })
  })
})

describe('priceReadyPlan: how the numbers fit together', () => {
  it('price, deposit, financed, total and total payable (I Pass My Neighbour, 12 months)', () => {
    const p = priceReadyPlan(plan('i-pass-my-neighbour'), 12)
    expect(planPrice(plan('i-pass-my-neighbour'))).toBe(465_000)
    expect(p).toMatchObject({
      planPrice: 465_000,
      deposit: 93_000,
      financed: 372_000,
      total: 595_200,
      totalPayable: 688_200,
      upfront: 93_000,
      extra: 0,
      months: 12,
    })
  })
  it('payments add up exactly: the last one adjusts for rounding', () => {
    const p = priceReadyPlan(plan('level-up'), 12)
    expect(p.instalments).toHaveLength(12)
    expect(p.instalments.slice(0, 11).every((m) => m === 90_347)).toBe(true)
    expect(p.instalments.reduce((a, b) => a + b, 0)).toBe(p.total)
    expect(p.instalments[11]).toBe(p.total - 90_347 * 11)
  })
  it('a tenure the plan does not offer is refused', () => {
    expect(() => priceReadyPlan(plan('relax'), 24)).toThrow(/not offered/)
  })
  it('full payment is always off the 12-month total payable', () => {
    expect(priceReadyPlan(plan('relax'), 6).fullPayment).toBe(4_049_280)
  })
})

describe('delivery outside the included state', () => {
  const p = plan('oga-boss') // includes ₦20,000 delivery (Kaduna)
  it('the state price minus the included delivery, never below 0; none in the included state', () => {
    expect(deliveryExtra(p, 'Kaduna', 50_000)).toBe(0)
    expect(deliveryExtra(p, 'Lagos', 65_000)).toBe(45_000)
    expect(deliveryExtra(p, 'Kano', 15_000)).toBe(0)
    expect(deliveryExtra(p, 'Lagos', null)).toBe(0)
  })
  it('paid upfront with the deposit and with the full payment; not financed, no discount', () => {
    const base = priceReadyPlan(p, 12)
    const lagos = priceReadyPlan(p, 12, 45_000)
    expect(lagos.deposit).toBe(base.deposit)
    expect(lagos.upfront).toBe(base.deposit + 45_000)
    expect(lagos.monthly).toBe(base.monthly)
    expect(lagos.totalPayable).toBe(base.totalPayable + 45_000)
    expect(lagos.fullPayment).toBe(base.fullPayment + 45_000)
  })
})

describe('readyQuoteResult (the quote stored with the application)', () => {
  it('cost price is the vendor cost; system price is the total payable; payments as priced', () => {
    const p = plan('no-shaking')
    const priced = priceReadyPlan(p, 9, 30_000)
    const q = readyQuoteResult(p, priced, 'Lagos')
    expect(vendorTotal(p)).toBe(1_665_500)
    expect(q.costPrice).toBe(1_665_500 + 30_000)
    expect(q.systemPrice).toBe(priced.totalPayable)
    expect(q.deposit).toBe(priced.upfront)
    expect(q.balance).toBe(priced.total)
    expect(q.instalments).toEqual(priced.instalments)
    expect(q.monthly).toBe(priced.monthly)
    expect(q.snapshot).toMatchObject({ tenureMonths: 9, depositShare: 0.2 })
    // Equipment and the never-marked-up lines (installation, delivery, delivery extra).
    expect(q.noMarkup).toEqual([
      { label: 'Installation', amount: 50_000 },
      { label: 'Delivery (Kaduna)', amount: 20_000 },
      { label: 'Delivery to Lagos (extra)', amount: 30_000 },
    ])
    expect(q.lines.map((l) => l.category)).toContain('battery')
    expect(q.systemPrice).toBe(q.deposit + q.balance)
  })
})

describe('publicPlan (what may reach a browser)', () => {
  it('no vendor cost, no per-line price, no rate and no admin note', () => {
    const json = JSON.stringify(publicPlan(plan('oga-boss')))
    for (const word of ['vendorCost', '"price"', 'monthlyRate', 'adminNote', '400000', '470000']) {
      expect(json).not.toContain(word)
    }
    expect(publicPlan(plan('oga-boss')).lines[0]).toEqual({
      name: 'Battery',
      spec: '3.6 kWh lithium-ion 12 V',
      qty: 1,
    })
  })
})

describe('planSize (the system as stored with the quote)', () => {
  it('kVA, battery kWh and panels from the plan lines', () => {
    expect(planSize(plan('relax'))).toMatchObject({
      inverterKva: 5,
      batteryKwh: 10,
      panelCount: 8,
      panelKw: 5.2,
    })
    expect(planSize(plan('level-up'))).toMatchObject({
      inverterKva: 1,
      batteryKwh: 1.8,
      panelCount: 2,
      panelKw: 0.7,
    })
  })
})

describe('cardFigures (landing cards and the plan page)', () => {
  it('deposit and the 12-month monthly; per tenure: deposit, monthly, total payable', () => {
    const c = cardFigures(plan('i-pass-my-neighbour'))
    expect(c.card).toEqual({ deposit: 93_000, monthly: 49_600, months: 12 })
    expect(c.tenures).toEqual([
      { months: 6, deposit: 93_000, monthly: 80_600, totalPayable: 93_000 + 483_600 },
      { months: 9, deposit: 93_000, monthly: 59_933, totalPayable: 93_000 + 539_400 },
      { months: 12, deposit: 93_000, monthly: 49_600, totalPayable: 688_200 },
    ])
    expect(c.fullPayment).toBe(516_150)
  })
})

describe('fullPaymentQuoteResult (pay in full: one payment, no monthly schedule)', () => {
  it('the whole pay-in-full price is paid upfront; nothing financed; cost = vendor costs', () => {
    const p = plan('oga-boss')
    const q = fullPaymentQuoteResult(p, priceReadyPlan(p, 12), 'Kaduna')
    expect(q).toMatchObject({
      systemPrice: 1_450_770,
      deposit: 1_450_770,
      balance: 0,
      instalments: [],
      monthly: 0,
      costPrice: 1_102_500,
    })
    // The stored deposit share stays the plan's (records allow 20–95%); "pay in full" is marked
    // on the stored plan (fixed.payment), not by a 100% deposit.
    expect(q.snapshot).toMatchObject({ tenureMonths: 12, depositShare: 0.2 })
  })
  it('extra delivery is part of the one payment (never discounted)', () => {
    const p = plan('oga-boss')
    const q = fullPaymentQuoteResult(p, priceReadyPlan(p, 12, 45_000), 'Lagos')
    expect(q.systemPrice).toBe(1_450_770 + 45_000)
    expect(q.deposit).toBe(1_450_770 + 45_000)
    expect(q.costPrice).toBe(1_102_500 + 45_000)
    expect(q.noMarkup).toContainEqual({ label: 'Delivery to Lagos (extra)', amount: 45_000 })
  })
})

describe('Relax Max (the 7th plan, Semako 14 Nov)', () => {
  const p = () => plan('relax-max')
  it('price and vendor cost from the lines', () => {
    expect(planPrice(p())).toBe(6_082_000)
    expect(vendorTotal(p())).toBe(5_314_000)
  })
  it('deposit, monthly for 6/9/12, total payable and pay in full', () => {
    const p12 = priceReadyPlan(p(), 12)
    expect(p12.deposit).toBe(1_216_400)
    expect(p12.monthly).toBe(648_747)
    expect(p12.totalPayable).toBe(9_001_360)
    expect(p12.fullPayment).toBe(7_201_088)
    expect(priceReadyPlan(p(), 9).monthly).toBe(783_902)
    expect(priceReadyPlan(p(), 6).monthly).toBe(1_054_213)
  })
  it('48 V, after Relax, SAMPLE, Kaduna delivery included, only 6/9/12', () => {
    const relax = plan('relax')
    expect(p()).toMatchObject({
      systemVoltage: 48,
      inverterKva: 12,
      sample: true,
      active: true,
      deliveryState: 'Kaduna',
      fullDiscount: 0.2,
      tenures: [6, 9, 12],
    })
    expect(p().sortOrder).toBeGreaterThan(relax.sortOrder)
    expect(planSize(p())).toMatchObject({ inverterKva: 12, batteryKwh: 17.5, panelCount: 18 })
    expect(() => priceReadyPlan(p(), 18)).toThrow(/not offered/)
  })
})

describe("the inverter as customers read it (from the plan's inverter line)", () => {
  it('Relax Max says 12 kW; the others keep their kVA', () => {
    expect(planSize(plan('relax-max')).inverterLabel).toBe('12 kW')
    expect(planSize(plan('relax')).inverterLabel).toBe('5 kVA')
    expect(planSize(plan('i-pass-my-neighbour')).inverterLabel).toBe('500 W')
    expect(inverterText(planSize(plan('relax-max')))).toBe('12 kW')
  })
  it('sizes made by the sizing engine (no label) read "<n> kVA"', () => {
    expect(inverterText({ inverterKva: 3.5 })).toBe('3.5 kVA')
  })
})
