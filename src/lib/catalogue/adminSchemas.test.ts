import { describe, expect, it } from 'vitest'

import { accessoryRulesSchema, logisticsSchema } from './adminSchemas'

const rule = {
  maxKva: 5,
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
}

describe('builder admin forms', () => {
  it('rules: one per "up to kVA", box 2–12 ways', () => {
    expect(accessoryRulesSchema.safeParse([rule]).success).toBe(true)
    expect(accessoryRulesSchema.safeParse([rule, rule]).success).toBe(false)
    expect(accessoryRulesSchema.safeParse([{ ...rule, boxWays: 14 }]).success).toBe(false)
  })
  it('delivery: "Other" must stay', () => {
    const other = { state: 'Other', amount: 50000, extraPerPanel: 0, localVendorsAvailable: false }
    expect(logisticsSchema.safeParse([other]).success).toBe(true)
    expect(logisticsSchema.safeParse([{ ...other, state: 'Lagos' }]).success).toBe(false)
  })
})
