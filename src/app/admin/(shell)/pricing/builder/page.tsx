import type { Metadata } from 'next'

import { BuilderAdmin } from '@/components/admin/builder/BuilderAdmin'
import { NG_STATE_IDS } from '@/lib/nigeria/states'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Builder pricing' }
export const dynamic = 'force-dynamic'

const n = (v: unknown) => Number(v ?? 0)

/** Super admin (the pricing layout checks): delivery, racks, extras and auto-pick rules. */
export default async function BuilderPricingPage() {
  const supabase = await createClient()
  const [logistics, racks, settings, rules] = await Promise.all([
    supabase.from('logistics_costs').select('*'),
    supabase.from('rack_prices').select('*'),
    supabase.from('settings').select('value').eq('key', 'builder').maybeSingle(),
    supabase.from('accessory_rules').select('*').order('max_kva'),
  ])
  if (logistics.error || racks.error || rules.error) {
    return (
      <p className="text-destructive text-sm" role="alert">
        The builder catalogue is not set up yet (migration 0027 has not been applied).
      </p>
    )
  }
  const rack = (m: string) => racks.data?.find((r) => r.material === m)
  const sv = (settings.data?.value ?? {}) as Record<string, unknown>
  return (
    <BuilderAdmin
      states={[...NG_STATE_IDS]}
      logistics={(logistics.data ?? []).map((r) => ({
        state: r.state,
        amount: n(r.amount),
        extraPerPanel: n(r.extra_per_panel),
        localVendorsAvailable: r.local_vendors_available,
        sample: r.sample,
      }))}
      rackPrices={{
        metal: n(rack('metal')?.price_per_cm),
        aluminium: n(rack('aluminium')?.price_per_cm),
        sample: Boolean(rack('metal')?.sample || rack('aluminium')?.sample),
      }}
      settings={{
        railsPerPanel: n(sv.railsPerPanel ?? 1),
        clampPricePerPanel: n(sv.clampPricePerPanel),
        extraPerStorey: n(sv.extraPerStorey),
        maxDcVoltageDrop: n(sv.maxDcVoltageDrop ?? 0.03),
        sample: sv.sample === true,
      }}
      rules={(rules.data ?? []).map((r) => ({
        maxKva: n(r.max_kva),
        dcBreakerA: n(r.dc_breaker_a),
        acBreakerA: n(r.ac_breaker_a),
        dcSurgeV: n(r.dc_surge_v),
        acSurgeKa: n(r.ac_surge_ka),
        batteryBreakerA: n(r.battery_breaker_a),
        changeoverA: n(r.changeover_a),
        regulatorKva: n(r.regulator_kva),
        boxWays: n(r.box_ways),
        trunkPipeMm: n(r.trunk_pipe_mm),
        flexPipeMm: n(r.flex_pipe_mm),
        acWireMm2: n(r.ac_wire_mm2),
        dcWireMm2: n(r.dc_wire_mm2),
        trunkPipeM: n(r.trunk_pipe_m),
        flexPipeM: n(r.flex_pipe_m),
        sample: r.sample,
      }))}
    />
  )
}
