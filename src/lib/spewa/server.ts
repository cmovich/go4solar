import 'server-only'

import { loadRoutingRules } from '@/lib/funderQueue/route'
import { offerRuleFor } from '@/lib/funderQueue/routingRules'
import type { PriceList } from '@/lib/settings/schemas'
import { createAdminClient } from '@/lib/supabase/admin'

import { businessOfferFrom, offerTermsFrom, type BusinessOffer, type OfferTerms } from './offer'
import { itemFromRow, type SpewaItem } from './priceList'

/** SPEWA's price list (service role; partner prices never reach a browser). [] before 0039. */
export async function loadSpewaItems(): Promise<SpewaItem[]> {
  const { data, error } = await createAdminClient()
    .from('spewa_price_items')
    .select('*')
    .order('sort_order')
  if (error) return []
  return (data ?? []).map((r) => itemFromRow(r))
}

export async function loadOfferTerms(): Promise<OfferTerms> {
  const { data } = await createAdminClient()
    .from('settings')
    .select('value')
    .eq('key', 'spewa_offer')
    .maybeSingle()
  return offerTermsFrom(data?.value)
}

/**
 * The SPEWA offer for businesses and institutions, or null (businesses priced normally) before
 * migration 0039, without an active default offer rule, or without quotable SPEWA equipment.
 * Never throws: a failure here must not take quotes down.
 */
export async function loadBusinessOffer(base: PriceList): Promise<BusinessOffer | null> {
  try {
    const [items, terms, rules] = await Promise.all([
      loadSpewaItems(),
      loadOfferTerms(),
      loadRoutingRules(),
    ])
    const rule = offerRuleFor(rules, 'business')
    if (!rule || items.length === 0) return null
    return businessOfferFrom({ items, terms, rule, base })
  } catch (e) {
    console.error('[spewa] offer unavailable:', e instanceof Error ? e.message : 'unknown')
    return null
  }
}
