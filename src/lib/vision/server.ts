import 'server-only'

import { photoLookupAvailable } from '@/lib/providers/vision/available'
import { createAdminClient } from '@/lib/supabase/admin'
import { hasSupabaseEnv } from '@/lib/supabase/env'

import { capReached, lagosDay, visionSettingsFrom, type VisionSettings } from './spend'

export async function loadVisionSettings(): Promise<VisionSettings> {
  if (!hasSupabaseEnv()) return visionSettingsFrom(null)
  const { data } = await createAdminClient()
    .from('settings')
    .select('value')
    .eq('key', 'vision')
    .maybeSingle()
  return visionSettingsFrom(data?.value)
}

/** Today's (Lagos) lookups and spend; null when the usage table cannot be read (before 0031). */
export async function usageToday(
  now = new Date(),
): Promise<{ lookups: number; spent: number } | null> {
  if (!hasSupabaseEnv()) return null
  const { data, error } = await createAdminClient()
    .from('vision_usage')
    .select('lookups, cost_naira')
    .eq('day', lagosDay(now))
    .maybeSingle()
  if (error) {
    console.error('[vision] usage not available:', error.message)
    return null
  }
  return { lookups: data?.lookups ?? 0, spent: Number(data?.cost_naira ?? 0) }
}

/**
 * Whether the photo button shows right now: a provider with a key (never the mock in
 * production) and today's spend under the cap.
 */
export async function photoLookupOpen(): Promise<{ open: boolean; settings: VisionSettings }> {
  const settings = await loadVisionSettings()
  if (!photoLookupAvailable()) return { open: false, settings }
  const usage = await usageToday()
  return { open: !capReached(usage?.spent ?? 0, settings), settings }
}

/** Adds one lookup and its cost to today's total (never blocks the answer). */
export async function recordLookup(costNaira: number, now = new Date()): Promise<void> {
  const { error } = await createAdminClient().rpc('add_vision_usage', {
    p_day: lagosDay(now),
    p_cost: costNaira,
  })
  if (error) console.error('[vision] could not record usage:', error.message)
}
