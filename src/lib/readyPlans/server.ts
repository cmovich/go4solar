import 'server-only'

import type { StoredSystem } from '@/lib/build/save'
import { logisticsFor, type LogisticsRow } from '@/lib/catalogue/extras'
import { NG_STATE_IDS, type NgStateId } from '@/lib/nigeria/states'
import { createAdminClient } from '@/lib/supabase/admin'
import type { SiteAnswers } from '@/lib/wizard/questions'

import {
  cardFigures,
  deliveryExtra,
  planSize,
  priceReadyPlan,
  publicPlan,
  readyQuoteResult,
  type PublicReadyPlan,
  type TenureFigures,
} from './price'
import { planFromRow } from './schema'
import type { ReadyPlan } from './types'

/**
 * Ready-made plans on the server: always read with the service role (customers never read the
 * table: it holds vendor costs) and handed to pages only as customer figures.
 */

/** Every plan (admin), or the switched-on ones in order (customers). [] before migration 0034. */
export async function loadReadyPlans(opts: { activeOnly: boolean }): Promise<ReadyPlan[]> {
  let q = createAdminClient().from('ready_plans').select('*').order('sort_order').order('name')
  if (opts.activeOnly) q = q.eq('active', true)
  const { data, error } = await q
  if (error) {
    console.error('[ready-plans] not available:', error.message)
    return []
  }
  return data.map(planFromRow)
}

export async function loadReadyPlan(slug: string, activeOnly = true): Promise<ReadyPlan | null> {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) return null
  let q = createAdminClient().from('ready_plans').select('*').eq('slug', slug)
  if (activeOnly) q = q.eq('active', true)
  const { data } = await q.maybeSingle()
  return data ? planFromRow(data) : null
}

/** Admin → Pricing → Builder delivery table (state rows + "Other"); SAMPLE rows are not used. */
export async function loadDeliveryRows(): Promise<(LogisticsRow & { sample: boolean })[]> {
  const { data, error } = await createAdminClient().from('logistics_costs').select('*')
  if (error) return []
  return data.map((r) => ({
    state: r.state,
    amount: Number(r.amount),
    extraPerPanel: Number(r.extra_per_panel),
    localVendorsAvailable: r.local_vendors_available,
    sample: r.sample,
  }))
}

const panelCount = (p: ReadyPlan) =>
  p.lines.filter((l) => l.kind === 'panels').reduce((t, l) => t + l.qty, 0)

/**
 * The extra delivery to a state, or null while that state's delivery price is still SAMPLE (then
 * the customer is told it is confirmed when we contact them).
 */
export function extraFor(
  p: ReadyPlan,
  state: string,
  rows: (LogisticsRow & { sample: boolean })[],
): number | null {
  if (state === p.deliveryState) return 0
  const row = rows.find((r) => r.state === state) ?? rows.find((r) => r.state === 'Other')
  if (!row) return 0
  if (row.sample) return null
  return deliveryExtra(p, state, logisticsFor(state, panelCount(p), rows)?.amount ?? null)
}

/** What a plan card or plan page may show. Prices are left out while the plan is SAMPLE. */
export type ReadyPlanOffer = {
  plan: PublicReadyPlan
  card: { deposit: number; monthly: number; months: number } | null
  tenures: TenureFigures[] | null
  fullPayment: number | null
  /** Extra delivery per state (null: confirmed when we contact you). */
  extras: Partial<Record<NgStateId, number | null>>
}

export function offerFor(
  p: ReadyPlan,
  rows: (LogisticsRow & { sample: boolean })[],
): ReadyPlanOffer {
  const figures = p.sample ? null : cardFigures(p)
  return {
    plan: publicPlan(p),
    card: figures?.card ?? null,
    tenures: figures?.tenures ?? null,
    fullPayment: figures?.fullPayment ?? null,
    extras: Object.fromEntries(NG_STATE_IDS.map((s) => [s, extraFor(p, s, rows)])),
  }
}

/**
 * A chosen plan as the stored system every later step reads (quote, lead, staff quotation): its
 * priced quote (cost = vendor costs), its name, pay-in-full price and any extra delivery.
 */
export function storedReadyPlan(
  p: ReadyPlan,
  months: number,
  state: NgStateId,
  site: SiteAnswers,
  rows: (LogisticsRow & { sample: boolean })[],
): StoredSystem & { kind: 'ready' } {
  const extra = extraFor(p, state, rows)
  const priced = priceReadyPlan(p, months, extra ?? 0)
  return {
    kind: 'ready',
    plan: { slug: p.slug, name: p.name },
    fixed: {
      fullPayment: priced.fullPayment,
      fullDiscount: p.fullDiscount,
      extra: priced.extra > 0 ? { state, amount: priced.extra } : null,
    },
    selection: { scope: 'complete', state, items: [], site, installer: 'go4solar' },
    notes: [
      'Subject to a site check.',
      ...(extra === null ? [`Delivery to ${state} is confirmed when we contact you.`] : []),
    ],
    size: planSize(p),
    quote: readyQuoteResult(p, priced, state),
    // A SAMPLE plan, or a delivery price still SAMPLE: no naira is shown.
    sample: p.sample || extra === null,
  }
}
