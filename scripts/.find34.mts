import { createAdminClient } from '@/lib/supabase/admin'
import { needsHomeTerms } from '@/lib/quotes/leadForPlans'
import type { Estimate } from '@/lib/quotes/buildEstimate'
const admin = createAdminClient()
const { data, error } = await admin.from('waitlist_consumers').select('id, first_name, surname, state, status, applicant_type, estimate, builder, created_at').eq('is_test', false).is('cleared_at', null).limit(1000)
if (error) throw error
const old = (data ?? []).filter((l) => l.estimate && needsHomeTerms(l.estimate as unknown as Estimate))
const builderOld = (data ?? []).filter((l) => !l.estimate && l.builder)
console.log('real entries', data!.length, '| home estimates on old terms', old.length, '| builder-only entries', builderOld.length)
for (const l of old.filter((l) => /^(sakiru|ekene|umar)/i.test(l.first_name ?? ''))) {
  const e = l.estimate as unknown as Estimate & { chosen?: unknown }
  console.log(JSON.stringify({ id: l.id, name: `${l.first_name} ${l.surname ?? ''}`, state: l.state, status: l.status, type: l.applicant_type, chosen: e.chosen ?? null, sample: (e as { sample?: boolean }).sample, created: l.created_at, plans: Object.fromEntries(Object.entries(e.plans).map(([k, p]) => [k, { kva: p.size.inverterKva, kwh: p.size.batteryKwh, panels: p.size.panelCount, price: p.quote.systemPrice, deposit: p.quote.deposit, monthly: p.quote.monthly, months: p.quote.snapshot.tenureMonths, share: p.quote.snapshot.depositShare }])) }))
}
