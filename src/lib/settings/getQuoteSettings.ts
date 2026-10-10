import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'

import type { Database } from '@/lib/supabase/database.types'
import { hasSupabaseEnv, publicSupabaseEnv } from '@/lib/supabase/env'

import {
  DEFAULT_QUOTE_SETTINGS,
  energySettingsSchema,
  priceListSchema,
  pricingSettingsSchema,
  sizingSettingsSchema,
  type QuoteSettings,
} from './schemas'

/**
 * Everything the estimate engine needs, read from the `settings` table (readable by all)
 * with the anon key. Any row that is missing or malformed falls back to the seeded defaults,
 * and the problem is logged, so a bad admin edit never takes the site down.
 */
export async function getQuoteSettings(): Promise<QuoteSettings> {
  if (!hasSupabaseEnv()) return DEFAULT_QUOTE_SETTINGS

  const { url, anonKey } = publicSupabaseEnv()
  const supabase = createClient<Database>(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await supabase
    .from('settings')
    .select('key, value')
    .in('key', ['sizing', 'price_list', 'pricing', 'min_deposit_share', 'energy'])
  if (error) {
    console.error('[settings] could not read settings:', error.message)
    return DEFAULT_QUOTE_SETTINGS
  }

  const byKey = Object.fromEntries(data.map((r) => [r.key, r.value]))
  return {
    sizing: pick('sizing', sizingSettingsSchema, byKey.sizing, DEFAULT_QUOTE_SETTINGS.sizing),
    priceList: pick(
      'price_list',
      priceListSchema,
      byKey.price_list,
      DEFAULT_QUOTE_SETTINGS.priceList,
    ),
    pricing: pick('pricing', pricingSettingsSchema, byKey.pricing, DEFAULT_QUOTE_SETTINGS.pricing),
    minDepositShare: pick(
      'min_deposit_share',
      z.number().min(0).max(0.95),
      byKey.min_deposit_share,
      DEFAULT_QUOTE_SETTINGS.minDepositShare,
    ),
    energy: pick('energy', energySettingsSchema, byKey.energy, DEFAULT_QUOTE_SETTINGS.energy),
  }
}

function pick<T>(key: string, schema: z.ZodType<T>, value: unknown, fallback: T): T {
  if (value === undefined) return fallback
  const parsed = schema.safeParse(value)
  if (parsed.success) return parsed.data
  console.error(
    `[settings] "${key}" is malformed; using the default`,
    parsed.error.issues[0]?.message,
  )
  return fallback
}
