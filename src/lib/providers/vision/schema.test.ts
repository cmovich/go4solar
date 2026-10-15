import { describe, expect, it } from 'vitest'

import { extractJson, visionResultSchema } from './schema'

describe('visionResultSchema', () => {
  it('accepts a label reading', () => {
    const r = visionResultSchema.parse({ watts: 150, method: 'label', appliance: 'Refrigerator' })
    expect(r).toEqual({ watts: 150, method: 'label', appliance: 'Refrigerator' })
  })

  it('accepts an estimate with a range', () => {
    const r = visionResultSchema.parse({
      watts: 1300,
      method: 'estimate',
      low: 1100,
      high: 1500,
      appliance: 'Split AC 1.5 HP',
    })
    expect(r.method).toBe('estimate')
    expect(r.low).toBe(1100)
    expect(r.high).toBe(1500)
  })

  it('accepts unreadable with null watts', () => {
    const r = visionResultSchema.parse({ watts: null, method: 'unreadable' })
    expect(r.watts).toBeNull()
  })

  it('rounds fractional watts to whole numbers', () => {
    expect(visionResultSchema.parse({ watts: 149.6, method: 'label' }).watts).toBe(150)
  })

  it('rejects watts outside 1–10000, unknown methods and junk', () => {
    expect(() => visionResultSchema.parse({ watts: 0, method: 'label' })).toThrow()
    expect(() => visionResultSchema.parse({ watts: 20000, method: 'label' })).toThrow()
    expect(() => visionResultSchema.parse({ watts: 100, method: 'guess' })).toThrow()
    expect(() => visionResultSchema.parse({ method: 'label' })).toThrow()
    expect(() => visionResultSchema.parse('150')).toThrow()
  })

  it('requires low ≤ watts ≤ high when a range is given', () => {
    expect(() =>
      visionResultSchema.parse({ watts: 100, method: 'estimate', low: 200, high: 300 }),
    ).toThrow()
  })
})

describe('extractJson', () => {
  it('returns the first JSON object in free text', () => {
    expect(extractJson('Sure! {"watts": 150, "method": "label"} hope that helps')).toEqual({
      watts: 150,
      method: 'label',
    })
  })

  it('handles fenced code blocks', () => {
    expect(extractJson('```json\n{"watts": null, "method": "unreadable"}\n```')).toEqual({
      watts: null,
      method: 'unreadable',
    })
  })

  it('returns null when there is no JSON', () => {
    expect(extractJson('I cannot see a label.')).toBeNull()
  })
})
