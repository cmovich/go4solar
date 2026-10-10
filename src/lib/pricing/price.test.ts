import { describe, expect, it } from 'vitest'

import { DepositOutOfRangeError, priceQuote } from './price'
import { sampleQuoteInput } from './pricing.fixture'
import type { TenureMonths } from './types'

const quote = (tenureMonths: TenureMonths, depositShare: number) =>
  priceQuote({ ...sampleQuoteInput, tenureMonths, depositShare })

describe('priceQuote — PRD illustration', () => {
  it('12 months, 20% deposit', () => {
    const q = quote(12, 0.2)
    expect(q.costPrice).toBe(1800000)
    expect(q.systemPrice).toBe(2475248)
    expect(q.markupShare).toBeCloseTo(0.42203, 5)
    expect(q.lines.map((l) => l.lineTotal)).toEqual([853248, 853200, 426600, 142200])
    expect(q.installCost).toBe(200000)
    expect(q.deposit).toBe(495050)
    expect(q.balance).toBe(1980198)
    expect(q.monthly).toBe(165017)
    expect(q.instalments).toHaveLength(12)
    expect(q.instalments.reduce((a, b) => a + b, 0)).toBe(1980198)
    expect(q.instalments.slice(0, 11).every((i) => i === 165017)).toBe(true)
    expect(q.instalments[11]).toBe(1980198 - 165017 * 11)
  })

  it('12 months, 50% deposit', () => {
    const q = quote(12, 0.5)
    expect(q.systemPrice).toBe(2272727)
    expect(q.deposit).toBe(1136364)
    expect(q.monthly).toBe(94697)
  })

  it('12 months, 95% deposit', () => {
    const q = quote(12, 0.95)
    expect(q.systemPrice).toBe(2024291)
    expect(q.deposit).toBe(1923076)
  })

  it('3 months, 20% deposit', () => {
    const q = quote(3, 0.2)
    expect(q.systemPrice).toBe(2100840)
    expect(q.monthly).toBe(560224)
    expect(q.instalments).toHaveLength(3)
  })

  it('6 and 9 months match the PRD tenure table', () => {
    expect(quote(6, 0.2).systemPrice).toBe(2212389)
    expect(quote(6, 0.2).monthly).toBe(294985)
    expect(quote(9, 0.2).systemPrice).toBe(2336449)
    expect(quote(9, 0.2).monthly).toBe(207684)
  })
})

describe('priceQuote — invariants', () => {
  const cases: [TenureMonths, number][] = [
    [12, 0.2],
    [12, 0.5],
    [12, 0.95],
    [3, 0.2],
    [6, 0.35],
    [9, 0.6],
    [12, 0.2001],
  ]

  it.each(cases)('%i months at %f: lines + installation === system price', (t, d) => {
    const q = quote(t, d)
    const sumLines = q.lines.reduce((a, l) => a + l.lineTotal, 0)
    expect(sumLines + q.installCost).toBe(q.systemPrice)
  })

  it.each(cases)('%i months at %f: deposit + instalments === system price', (t, d) => {
    const q = quote(t, d)
    expect(q.deposit + q.instalments.reduce((a, b) => a + b, 0)).toBe(q.systemPrice)
    expect(q.instalments).toHaveLength(t)
  })

  it('markup falls as the deposit rises and never goes below the base margin', () => {
    const m20 = quote(12, 0.2).markupShare
    const m50 = quote(12, 0.5).markupShare
    const m95 = quote(12, 0.95).markupShare
    expect(m20).toBeGreaterThan(m50)
    expect(m50).toBeGreaterThan(m95)
    expect(m95).toBeGreaterThanOrEqual(0.125)
  })

  it('all lines are multiples of ₦100 except the one carrying the rounding remainder', () => {
    const q = quote(12, 0.2)
    const offStep = q.lines.filter((l) => l.lineTotal % 100 !== 0)
    expect(offStep.length).toBeLessThanOrEqual(1)
  })

  it('puts the rounding remainder on the first of tied largest lines', () => {
    const q = quote(12, 0.2) // panels and battery both cost 600,000
    expect(q.lines[0]?.lineTotal).toBe(853248)
    expect(q.lines[1]?.lineTotal).toBe(853200)
  })

  it('unitPrice × qty equals lineTotal for multi-unit lines (whole naira)', () => {
    const q = priceQuote({
      ...sampleQuoteInput,
      lines: [
        { sku: 'PNL', name: 'Panel', category: 'panels', unitCost: 150000, qty: 4 },
        { sku: 'INV', name: 'Inverter', category: 'inverter', unitCost: 300000, qty: 1 },
      ],
    })
    for (const l of q.lines) {
      expect(l.unitPrice).toBe(Math.round(l.lineTotal / l.qty))
    }
  })

  it('installation is never marked up', () => {
    expect(quote(12, 0.2).installCost).toBe(sampleQuoteInput.installCost)
    expect(quote(3, 0.95).installCost).toBe(sampleQuoteInput.installCost)
  })

  it('stores a snapshot of every input used', () => {
    const q = quote(12, 0.2)
    expect(q.snapshot).toMatchObject({
      version: 1,
      installCost: 200000,
      pricingRateAnnual: 0.24,
      tenureMonths: 12,
      depositShare: 0.2,
      minDepositShare: 0.2,
      roundingStep: 100,
    })
    expect(q.snapshot.lines).toEqual(sampleQuoteInput.lines)
    expect(q.snapshot.marginByCategory).toEqual(sampleQuoteInput.marginByCategory)
  })

  it('does not mutate its input', () => {
    const input = structuredClone(sampleQuoteInput)
    priceQuote(input)
    expect(input).toEqual(sampleQuoteInput)
  })
})

describe('priceQuote — deposit range', () => {
  it('rejects a deposit below the minimum (default 20%)', () => {
    expect(() => quote(12, 0.19)).toThrow(DepositOutOfRangeError)
    expect(() => quote(12, 0)).toThrow(DepositOutOfRangeError)
  })

  it('rejects a deposit above 95%', () => {
    expect(() => quote(12, 0.951)).toThrow(DepositOutOfRangeError)
    expect(() => quote(12, 1)).toThrow(DepositOutOfRangeError)
  })

  it('accepts exactly 20% and exactly 95%', () => {
    expect(() => quote(12, 0.2)).not.toThrow()
    expect(() => quote(12, 0.95)).not.toThrow()
  })

  it('honours a different minimum from settings', () => {
    expect(() =>
      priceQuote({ ...sampleQuoteInput, depositShare: 0.1, minDepositShare: 0.1 }),
    ).not.toThrow()
    expect(() =>
      priceQuote({ ...sampleQuoteInput, depositShare: 0.25, minDepositShare: 0.3 }),
    ).toThrow(DepositOutOfRangeError)
  })
})
