import 'server-only'

import type { QuoteResult } from '@/lib/pricing/types'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Json } from '@/lib/supabase/database.types'

import { depositShareOf, type QueueDecision } from './rules'
import { routeByRules, ruleFromSetting, rulesFromRows, type RoutingRule } from './routingRules'

/**
 * The routing rules (Admin → Funders → Routing rules). Before migration 0039 the table does not
 * exist: the PR #44 setting (settings.funder_routing) is used as one rule.
 */
export async function loadRoutingRules(): Promise<RoutingRule[]> {
  const admin = createAdminClient()
  const { data, error } = await admin.from('funder_routing_rules').select('*')
  if (!error) return rulesFromRows(data ?? [])
  const { data: s } = await admin
    .from('settings')
    .select('value')
    .eq('key', 'funder_routing')
    .maybeSingle()
  const r = ruleFromSetting(s?.value)
  return r ? [r] : []
}

/** The funder name for page titles ("SPEWA programme funds"), or null when nothing is routed. */
export async function routedFunderName(): Promise<string | null> {
  const rules = await loadRoutingRules()
  const rule = rules.find((r) => r.active && r.offer === 'spewa') ?? rules.find((r) => r.active)
  if (!rule) return null
  const { data } = await createAdminClient()
    .from('funders')
    .select('name')
    .eq('id', rule.funderId)
    .maybeSingle()
  return data?.name ?? null
}

/**
 * Deposit paid (every onboarding step done): a business with a deposit of 30% or more goes to the
 * SPEWA queue. Safe to repeat (one row per application). Never throws: a failure here must not
 * stop the deposit from being recorded; the file then stays in the general queue.
 */
export async function routeAfterDeposit(applicationId: string): Promise<void> {
  try {
    const admin = createAdminClient()
    const { data: app } = await admin
      .from('applications')
      .select('id, consumer_id, applicant_type, quote_id')
      .eq('id', applicationId)
      .maybeSingle()
    if (!app?.quote_id) return
    const [{ data: quote }, { data: profile }, routing] = await Promise.all([
      admin.from('quotes').select('result').eq('id', app.quote_id).maybeSingle(),
      admin.from('profiles').select('is_test').eq('id', app.consumer_id).maybeSingle(),
      loadRoutingRules(),
    ])
    const result = quote?.result as unknown as QuoteResult | undefined
    if (!result) return
    const depositShare = depositShareOf({
      deposit: Number(result.deposit),
      systemPrice: Number(result.systemPrice),
      snapshot: result.snapshot,
    })
    const funderId = routeByRules(routing, {
      applicantType: app.applicant_type,
      depositShare,
      tenureMonths: result.snapshot?.tenureMonths,
    })
    if (!funderId) return
    const { data: inserted } = await admin
      .from('funder_queue')
      .upsert(
        {
          application_id: app.id,
          funder_id: funderId,
          decision: 'pending',
          deposit_share: Math.round(depositShare * 10_000) / 10_000,
          is_test: Boolean(profile?.is_test),
        },
        { onConflict: 'application_id', ignoreDuplicates: true },
      )
      .select('application_id')
    if (inserted?.length)
      await admin.from('audit_log').insert({
        actor_id: null,
        action: 'application.route_funder',
        entity: 'applications',
        entity_id: app.id,
        after: { funderId, depositShare } as Json,
      })
  } catch (e) {
    console.error('[funder-queue] routing failed:', e instanceof Error ? e.message : 'unknown')
  }
}

/** Ids of applications routed to a funder, with their decision (empty before migration 0038). */
export async function routedDecisions(): Promise<Map<string, QueueDecision>> {
  const { data } = await createAdminClient().from('funder_queue').select('application_id, decision')
  return new Map((data ?? []).map((r) => [r.application_id, r.decision as QueueDecision]))
}
