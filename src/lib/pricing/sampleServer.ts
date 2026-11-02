import 'server-only'

import { createClient } from '@/lib/supabase/server'

import { sampleItems, type SampleItem } from './sampleStatus'

/** Every SAMPLE row across the pricing sections, read as the signed-in super admin. */
export async function loadSampleItems(): Promise<SampleItem[]> {
  const supabase = await createClient()
  const [components, margins, rates, installs, unitCosts, energy] = await Promise.all([
    supabase
      .from('components')
      .select('id, sku, name, active, sample')
      .order('category')
      .order('sku'),
    supabase.from('category_margins').select('category, sample'),
    supabase.from('pricing_rates').select('*').order('tenure_months'),
    supabase.from('installation_costs').select('state, size_band, sample').order('state'),
    supabase.from('unit_costs').select('sample').eq('id', 1).maybeSingle(),
    supabase.from('settings').select('value').eq('key', 'energy').maybeSingle(),
  ])
  // Part F tables (missing before migration 0027: nothing listed).
  const [logistics, racks, rules, builder] = await Promise.all([
    supabase.from('logistics_costs').select('state, sample').order('state'),
    supabase.from('rack_prices').select('sample'),
    supabase.from('accessory_rules').select('sample'),
    supabase.from('settings').select('value').eq('key', 'builder').maybeSingle(),
  ])
  const energyValue = energy.data?.value
  const builderValue = builder.data?.value
  return sampleItems({
    logistics: logistics.error ? [] : (logistics.data ?? []),
    rackSample: !racks.error && (racks.data ?? []).some((r) => r.sample),
    rulesSample: !rules.error && (rules.data ?? []).some((r) => r.sample),
    builderSettingsSample:
      typeof builderValue === 'object' &&
      builderValue !== null &&
      !Array.isArray(builderValue) &&
      (builderValue as { sample?: unknown }).sample === true,
    components: components.data ?? [],
    margins: margins.data ?? [],
    rates: (rates.data ?? []).map((r) => ({
      tenureMonths: r.tenure_months,
      enabled: r.enabled ?? true,
      sample: r.sample,
    })),
    installation: (installs.data ?? []).map((r) => ({
      state: r.state,
      sizeBand: r.size_band,
      sample: r.sample,
    })),
    unitCostsSample: unitCosts.data?.sample ?? false,
    energySample:
      typeof energyValue === 'object' &&
      energyValue !== null &&
      !Array.isArray(energyValue) &&
      (energyValue as { sample?: unknown }).sample === true,
  })
}
