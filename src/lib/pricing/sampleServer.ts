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
  const energyValue = energy.data?.value
  return sampleItems({
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
