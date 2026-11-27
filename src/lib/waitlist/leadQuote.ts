import { storedBuild } from '@/lib/build/stored'
import type { QuoteResult } from '@/lib/pricing/types'
import { PLAN_LABELS, PLANS } from '@/lib/quotes/buildEstimate'
import { usableQuote } from '@/lib/quotes/usable'
import type { Plan } from '@/lib/sizing/types'

/**
 * The quote a waiting-list person has (Admin → Waiting list → "View quote" / "Download PDF"),
 * from their row. Pure. In order: their own system (the builder, a ready-made plan, or an
 * accepted staff quotation, all stored in `builder`); the plan chosen at the deposit step; a
 * plan picked before the deposit step, as priced. Null when there is none ("No quote yet") or
 * the stored quote is broken.
 */
export type LeadQuote = { result: QuoteResult; title: string; sample: boolean; builder: unknown }

type Row = { builder: unknown; chosen_plan: string | null; estimate: unknown }

export function leadQuote(row: Row): LeadQuote | null {
  const own = storedBuild(row.builder)
  if (own) {
    const result = usableQuote((row.builder as { quote?: unknown }).quote)
    return result ? { result, title: own.title, sample: own.sample, builder: row.builder } : null
  }
  const est = (row.estimate ?? null) as {
    sample?: boolean
    plans?: Partial<Record<Plan, { quote?: unknown }>>
    chosen?: { plan?: string; quote?: unknown }
  } | null
  const plan = (est?.chosen?.plan ?? row.chosen_plan) as Plan | null
  if (!est || !plan || !PLANS.includes(plan)) return null
  const stored = est.chosen?.plan === plan ? est.chosen.quote : est.plans?.[plan]?.quote
  const result = usableQuote(stored)
  if (!result) return null
  return { result, title: `${PLAN_LABELS[plan]} plan`, sample: Boolean(est.sample), builder: null }
}
