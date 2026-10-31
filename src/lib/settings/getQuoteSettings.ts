import 'server-only'

import { z } from 'zod'

import { loadCatalogue } from '@/lib/catalogue/server'
import { priceListFromRows, pricingFromRows } from '@/lib/pricing/tables'
import { DEFAULT_WIRING, wiringSchema } from '@/lib/wizard/questions'
import { createAdminClient } from '@/lib/supabase/admin'
import { hasSupabaseEnv } from '@/lib/supabase/env'

import {
  DEFAULT_QUOTE_SETTINGS,
  energySettingsSchema,
  sizingSettingsSchema,
  type QuoteSettings,
} from './schemas'

/**
 * Everything the estimate engine needs: sizing/energy/min-deposit from `settings`, and the
 * price list from the pricing tables (components, category_margins, pricing_rates,
 * installation_costs — the single source of truth since Prompt 8). Cost prices and margins
 * are confidential, so this reads with the service role and is server-only. Any part that is
 * missing or malformed falls back to the seeded defaults and is logged, so a bad admin edit
 * never takes the site down.
 */
export async function getQuoteSettings(): Promise<QuoteSettings> {
  if (!hasSupabaseEnv() || !process.env.SUPABASE_SERVICE_ROLE_KEY) return DEFAULT_QUOTE_SETTINGS
  const admin = createAdminClient()

  const [settings, components, margins, rates, installs, sun] = await Promise.all([
    admin
      .from('settings')
      .select('key, value')
      .in('key', ['sizing', 'min_deposit_share', 'energy']),
    admin
      .from('components')
      // Every column: nominal_voltage and specs exist from migration 0022.
      .select('*')
      .eq('active', true),
    admin.from('category_margins').select('category, margin, sample'),
    // Every column: `enabled` exists from migration 0019 (rows without it count as switched on).
    admin.from('pricing_rates').select('*'),
    admin.from('installation_costs').select('state, size_band, amount, sample'),
    // From migration 0024; before it the query fails and every state uses the default.
    admin.from('sun_hours').select('*'),
  ])
  for (const r of [settings, components, margins, rates, installs]) {
    if (r.error) {
      console.error('[settings] could not read pricing data:', r.error.message)
      return DEFAULT_QUOTE_SETTINGS
    }
  }

  const byKey = Object.fromEntries((settings.data ?? []).map((r) => [r.key, r.value]))
  const sizing = pick('sizing', sizingSettingsSchema, byKey.sizing, DEFAULT_QUOTE_SETTINGS.sizing)

  let priceList = DEFAULT_QUOTE_SETTINGS.priceList
  try {
    priceList = priceListFromRows({
      components: (components.data ?? []).map((c) => ({ ...c, unit_cost: Number(c.unit_cost) })),
      installs: (installs.data ?? []).map((i) => ({ ...i, amount: Number(i.amount) })),
      panelWatts: sizing.panelWatts,
    })
  } catch (err) {
    console.error('[settings] price list unusable; using SAMPLE defaults:', (err as Error).message)
  }

  let pricing = DEFAULT_QUOTE_SETTINGS.pricing
  try {
    pricing = pricingFromRows({
      margins: (margins.data ?? []).map((m) => ({ ...m, margin: Number(m.margin) })),
      rates: (rates.data ?? []).map((r) => ({
        ...r,
        expected_funder_rate: Number(r.expected_funder_rate),
        spread: Number(r.spread),
        default_buffer: Number(r.default_buffer),
        pricing_rate: r.pricing_rate === null ? null : Number(r.pricing_rate),
      })),
    })
  } catch (err) {
    console.error(
      '[settings] pricing rates unusable; using SAMPLE defaults:',
      (err as Error).message,
    )
  }

  if (sun.error) console.error('[settings] could not read sun hours:', sun.error.message)
  const sunHours = Object.fromEntries(
    (sun.data ?? []).map((r: { state: string; annual_psh: unknown; rainy_psh: unknown }) => [
      r.state,
      { annual: Number(r.annual_psh), rainy: Number(r.rainy_psh) },
    ]),
  )

  // Part F: the builder catalogue (null before migration 0027: quotes keep the pack).
  const full = await loadCatalogue(admin, priceList.installByState)
  const panelLength = priceList.panel.specs?.lengthCm
  const catalogue = full
    ? {
        accessories: full.accessories,
        rules: full.rules,
        rackPrices: full.rackPrices,
        settings: full.settings,
        logistics: full.logistics,
        roofTypes: full.roofTypes,
        panelLengthCm: typeof panelLength === 'number' ? panelLength : null,
      }
    : undefined
  const { data: wiringRow } = await admin
    .from('settings')
    .select('value')
    .eq('key', 'wiring')
    .maybeSingle()

  return {
    sizing,
    catalogue,
    wiring: wiringSchema.safeParse(wiringRow?.value).data ?? DEFAULT_WIRING,
    sunHours,
    // SAMPLE delivery or rack prices feed customer prices, so they hide them too (sampleStatus.ts).
    priceList: full?.sample ? { ...priceList, sample: true } : priceList,
    pricing,
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
