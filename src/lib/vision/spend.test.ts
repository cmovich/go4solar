import { describe, expect, it } from 'vitest'

import {
  capReached,
  DEFAULT_VISION_SETTINGS,
  lagosDay,
  lookupCostNaira,
  p70,
  visionSettingsFrom,
  visionSettingsSchema,
} from './spend'

describe('photo lookup spend (daily cap in naira)', () => {
  it('defaults: ₦5,000 a day, 10 lookups per visitor a day, SAMPLE prices', () => {
    expect(DEFAULT_VISION_SETTINGS).toMatchObject({
      dailyCapNaira: 5000,
      perVisitorPerDay: 10,
      sample: true,
    })
  })

  it('cost of one lookup = tokens × price + web searches, in naira', () => {
    const s = {
      ...DEFAULT_VISION_SETTINGS,
      nairaPerUsd: 1600,
      inputUsdPerMTok: 1,
      outputUsdPerMTok: 5,
      webSearchUsd: 0.01,
    }
    // 2,000 input tokens ($0.002) + 300 output ($0.0015) = $0.0035 → ₦5.60
    expect(lookupCostNaira({ inputTokens: 2000, outputTokens: 300, webSearches: 0 }, s)).toBe(5.6)
    // + 1 web search ($0.01 → ₦16)
    expect(lookupCostNaira({ inputTokens: 2000, outputTokens: 300, webSearches: 1 }, s)).toBe(21.6)
  })

  it('the cap is reached when today’s spend is at or over it; a cap of 0 switches the photo off', () => {
    expect(capReached(4999.99, DEFAULT_VISION_SETTINGS)).toBe(false)
    expect(capReached(5000, DEFAULT_VISION_SETTINGS)).toBe(true)
    expect(capReached(0, { ...DEFAULT_VISION_SETTINGS, dailyCapNaira: 0 })).toBe(true)
  })

  it('a missing or broken setting uses the defaults, field by field', () => {
    expect(visionSettingsFrom(null)).toEqual(DEFAULT_VISION_SETTINGS)
    expect(visionSettingsFrom({ dailyCapNaira: 2000, perVisitorPerDay: 'x' })).toEqual({
      ...DEFAULT_VISION_SETTINGS,
      dailyCapNaira: 2000,
    })
  })

  it('the admin form: cap ≥ 0, 1–100 lookups per visitor, positive prices', () => {
    const ok = { ...DEFAULT_VISION_SETTINGS }
    expect(visionSettingsSchema.safeParse(ok).success).toBe(true)
    expect(visionSettingsSchema.safeParse({ ...ok, dailyCapNaira: -1 }).success).toBe(false)
    expect(visionSettingsSchema.safeParse({ ...ok, perVisitorPerDay: 0 }).success).toBe(false)
    expect(visionSettingsSchema.safeParse({ ...ok, nairaPerUsd: 0 }).success).toBe(false)
  })
})

describe('p70 (the figure used for sizing from an estimated range)', () => {
  it('70% of the way from low to high, whole watts', () => {
    expect(p70(100, 200)).toBe(170)
    expect(p70(1000, 1500)).toBe(1350)
    expect(p70(60, 60)).toBe(60)
  })
})

describe('lagosDay (the cap resets at midnight in Lagos)', () => {
  it('UTC+1', () => {
    expect(lagosDay(new Date('2026-11-07T22:59:00Z'))).toBe('2026-11-07')
    expect(lagosDay(new Date('2026-11-07T23:01:00Z'))).toBe('2026-11-08')
  })
})
