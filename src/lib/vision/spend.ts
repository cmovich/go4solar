import { z } from 'zod'

/** settings.vision: the photo watts lookup's daily spend cap and prices (admin "Photo lookup"). */
export const visionSettingsSchema = z.object({
  /** Naira a day across all visitors; 0 switches the photo lookup off. */
  dailyCapNaira: z.number().min(0).max(10_000_000),
  /** Lookups per visitor (connection) per Lagos day. */
  perVisitorPerDay: z.number().int().min(1).max(100),
  nairaPerUsd: z.number().positive().max(100_000),
  /** API prices in US dollars (per million tokens; per web search). */
  inputUsdPerMTok: z.number().positive().max(1000),
  outputUsdPerMTok: z.number().positive().max(1000),
  webSearchUsd: z.number().min(0).max(10),
  sample: z.boolean().optional(),
})
export type VisionSettings = z.infer<typeof visionSettingsSchema>

export const DEFAULT_VISION_SETTINGS: VisionSettings = {
  dailyCapNaira: 5000,
  perVisitorPerDay: 10,
  nairaPerUsd: 1600,
  inputUsdPerMTok: 1,
  outputUsdPerMTok: 5,
  webSearchUsd: 0.01,
  sample: true,
}

/** The saved setting, field by field (anything missing or broken uses the default). Pure. */
export function visionSettingsFrom(value: unknown): VisionSettings {
  const v = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>
  const shape = visionSettingsSchema.shape
  const out = { ...DEFAULT_VISION_SETTINGS } as Record<string, unknown>
  for (const key of Object.keys(shape) as (keyof typeof shape)[]) {
    const p = shape[key].safeParse(v[key])
    if (p.success && p.data !== undefined) out[key] = p.data
  }
  return out as VisionSettings
}

export type LookupUsage = { inputTokens: number; outputTokens: number; webSearches: number }

/** What one lookup cost, in naira (2 dp). Pure. */
export function lookupCostNaira(u: LookupUsage, s: VisionSettings): number {
  const usd =
    (u.inputTokens * s.inputUsdPerMTok + u.outputTokens * s.outputUsdPerMTok) / 1_000_000 +
    u.webSearches * s.webSearchUsd
  return Math.round(usd * s.nairaPerUsd * 100) / 100
}

/** No more lookups today once the day's spend reaches the cap (a cap of 0 means off). Pure. */
export function capReached(spentTodayNaira: number, s: VisionSettings): boolean {
  return spentTodayNaira >= s.dailyCapNaira
}

/** From an estimated range, the figure used for sizing: 70% of the way from low to high. */
export function p70(low: number, high: number): number {
  return Math.round(low + 0.7 * (high - low))
}

/** Today's date in Lagos (UTC+1), "YYYY-MM-DD". */
export function lagosDay(now: Date): string {
  return new Date(now.getTime() + 60 * 60_000).toISOString().slice(0, 10)
}
