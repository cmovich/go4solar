import 'server-only'

import { z } from 'zod'

import {
  DEFAULT_ENERGY_SETTINGS,
  DEFAULT_QUOTE_SETTINGS,
  energySettingsSchema,
  sizingSettingsSchema,
} from '@/lib/settings/schemas'
import { DEFAULT_SIZING_SETTINGS } from '@/lib/sizing/defaults'
import { createClient } from '@/lib/supabase/server'

import { INSTALL_STATES, SIZE_KEY, type PricingDraft } from './adminSchemas'
import { TENURES, type TenureMonths } from './types'

function num(v: unknown): number {
  const n = typeof v === 'string' ? parseFloat(v) : Number(v)
  return Number.isFinite(n) ? n : 0
}

function sizeFrom(category: keyof typeof SIZE_KEY, sizes: unknown): number {
  if (typeof sizes !== 'object' || sizes === null) return 0
  return num((sizes as Record<string, unknown>)[SIZE_KEY[category]])
}

/** Loads every pricing table and the relevant settings rows as the signed-in staff user (RLS). */
/** Test funders (is_test) only appear when asked (Funders page "Show test data"). */
export async function loadPricingDraft(includeTestFunders = false): Promise<PricingDraft> {
  const supabase = await createClient()
  const [components, margins, rates, installs, unitCosts, funders, settings] = await Promise.all([
    supabase.from('components').select('*').order('category').order('unit_cost'),
    supabase.from('category_margins').select('*'),
    supabase.from('pricing_rates').select('*').order('tenure_months'),
    supabase.from('installation_costs').select('*'),
    supabase.from('unit_costs').select('*').eq('id', 1).maybeSingle(),
    includeTestFunders
      ? supabase.from('funders').select('*').order('created_at')
      : supabase.from('funders').select('*').eq('is_test', false).order('created_at'),
    supabase
      .from('settings')
      .select('key, value')
      .in('key', [
        'sizing',
        'energy',
        'late_fee_daily',
        'late_fee_cap_share',
        'lock_after_days_overdue',
        'min_deposit_share',
      ]),
  ])
  for (const r of [components, margins, rates, installs, unitCosts, funders, settings]) {
    if (r.error) throw new Error(`pricing data: ${r.error.message}`)
  }
  const byKey = Object.fromEntries((settings.data ?? []).map((r) => [r.key, r.value]))
  const marginOf = (c: string) => margins.data?.find((m) => m.category === c)
  const rateOf = (t: TenureMonths) => rates.data?.find((r) => r.tenure_months === t)
  const sizing = sizingSettingsSchema.safeParse(byKey.sizing)
  const energy = energySettingsSchema.safeParse(byKey.energy)

  return {
    components: (components.data ?? []).map((c) => ({
      id: c.id,
      sku: c.sku,
      name: c.name,
      category: c.category,
      unitCost: num(c.unit_cost),
      size: sizeFrom(c.category, c.stock_sizes),
      source: c.source,
      active: c.active,
      sample: c.sample,
    })),
    margins: {
      panels: num(marginOf('panels')?.margin ?? 0),
      battery: num(marginOf('battery')?.margin ?? 0),
      inverter: num(marginOf('inverter')?.margin ?? 0),
      accessories: num(marginOf('accessories')?.margin ?? 0),
    },
    // Every tenure; one without a row yet (before migration 0019) shows as off and blank.
    rates: TENURES.map((t) => {
      const r = rateOf(t)
      const part = (v: number | string | null | undefined) =>
        v === null || v === undefined ? null : num(v)
      return {
        tenureMonths: t,
        enabled: r ? (r.enabled ?? true) : false,
        expectedFunderRate: part(r?.expected_funder_rate),
        spread: part(r?.spread),
        defaultBuffer: part(r?.default_buffer),
      }
    }),
    installation: INSTALL_STATES.flatMap((state) =>
      (['small', 'medium', 'large'] as const).map((sizeBand) => ({
        state,
        sizeBand,
        // A state without its own price yet starts as a copy of "Other" (what it is charged today).
        amount: num(
          (
            installs.data?.find((i) => i.state === state && i.size_band === sizeBand) ??
            installs.data?.find((i) => i.state === 'Other' && i.size_band === sizeBand)
          )?.amount ?? 0,
        ),
      })),
    ),
    unitCosts: {
      kycPerLoan: num(unitCosts.data?.kyc_per_loan ?? 0),
      feePerInstalment: num(unitCosts.data?.fee_per_instalment ?? 0),
      lossProvisionShare: num(unitCosts.data?.loss_provision_share ?? 0),
      minNetMarginShare: num(unitCosts.data?.min_net_margin_share ?? 0),
    },
    lateFee: {
      dailyRate: z.number().safeParse(byKey.late_fee_daily).data ?? 0.0075,
      capShare: z.number().safeParse(byKey.late_fee_cap_share).data ?? 0.25,
      lockAfterDays: z.number().int().safeParse(byKey.lock_after_days_overdue).data ?? 7,
    },
    energy: energy.success ? energy.data : DEFAULT_ENERGY_SETTINGS,
    sizing: sizing.success ? sizing.data : DEFAULT_SIZING_SETTINGS,
    minDepositShare:
      z.number().safeParse(byKey.min_deposit_share).data ?? DEFAULT_QUOTE_SETTINGS.minDepositShare,
    sample: {
      components: (components.data ?? []).some((c) => c.active && c.sample),
      margins: (margins.data ?? []).some((m) => m.sample),
      rates: (rates.data ?? []).some((r) => r.sample),
      installation: (installs.data ?? []).some((i) => i.sample),
      unitCosts: unitCosts.data?.sample ?? false,
    },
    funders: (funders.data ?? []).map((f) => ({
      id: f.id,
      name: f.name,
      kind: f.kind,
      annualRate: num(f.annual_rate),
      method: f.method,
      upfrontFeeShare: num(f.upfront_fee_share),
      minAmount: num(f.min_amount),
      maxAmount: f.max_amount === null ? null : num(f.max_amount),
      maxTenure: f.max_tenure as TenureMonths,
      balanceAvailable: num(f.balance_available),
      status: f.status,
      sample: f.sample,
    })),
  }
}
