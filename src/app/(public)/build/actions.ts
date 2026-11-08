'use server'

import { headers } from 'next/headers'
import { z } from 'zod'
import { currentVisitorHash } from '@/lib/waitlist/token'
import type { Json } from '@/lib/supabase/database.types'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Estimate } from '@/lib/quotes/buildEstimate'
import { adjustPlan } from '@/lib/quotes/adjust'

import { launchMode } from '@/config/site'
import { adviseFromFacts } from '@/lib/build/advisor'
import { buildContactSchema, buildSelectionSchema } from '@/lib/build/schema'
import { saveBuild } from '@/lib/build/save'
import {
  builderContext,
  priceSelection,
  selectionSummary,
  suggestAccessories,
  suggestForLoad,
  type PricedBuild,
} from '@/lib/build/server'
import { TENURES, type TenureMonths } from '@/lib/pricing/types'
import { quoteValidityDays } from '@/lib/quotes/leadForPlans'
import { clientIp } from '@/lib/ratelimit/clientIp'
import { hitRateLimit } from '@/lib/ratelimit/hitRateLimit'

type Result<T> = ({ ok: true } & T) | { ok: false; error: string; field?: string }

const priceSchema = z.object({
  selection: buildSelectionSchema,
  depositShare: z.number().min(0.2).max(0.95),
  tenure: z.number().refine((t): t is TenureMonths => (TENURES as readonly number[]).includes(t)),
})

/** Live price of the builder selection (customer figures only). */
export async function priceBuild(input: unknown): Promise<Result<{ priced: PricedBuild | null }>> {
  const p = priceSchema.safeParse(input)
  if (!p.success) return { ok: false, error: 'Check your choices.' }
  const ctx = await builderContext()
  try {
    const { priced } = priceSelection(
      ctx,
      p.data.selection,
      p.data.depositShare,
      p.data.tenure as TenureMonths,
    )
    return { ok: true, priced }
  } catch {
    return { ok: false, error: 'We could not price this combination. Please change an item.' }
  }
}

/** "I know my load (kVA)": a starting inverter, battery, panels and accessories. */
export async function suggestFromLoad(
  input: unknown,
): Promise<Result<{ items: { sku: string; qty: number }[] }>> {
  const p = z
    .object({ kva: z.number().min(0.1).max(100), selection: buildSelectionSchema })
    .safeParse(input)
  if (!p.success)
    return { ok: false, error: 'Enter your load in kVA (for example 3.5).', field: 'kva' }
  const ctx = await builderContext()
  return { ok: true, items: suggestForLoad(ctx, p.data.kva, p.data.selection) }
}

/** The accessories that go with the chosen inverter and panels. */
export async function suggestBuildAccessories(
  input: unknown,
): Promise<Result<{ items: { sku: string; qty: number }[] }>> {
  const p = buildSelectionSchema.safeParse(input)
  if (!p.success) return { ok: false, error: 'Check your choices.' }
  const ctx = await builderContext()
  return { ok: true, items: suggestAccessories(ctx, p.data) }
}

const submitSchema = priceSchema.extend({ contact: buildContactSchema })

/**
 * Prelaunch: "Submit" signs the customer up with their system. Live: "Apply" saves the quote and
 * goes on to "Your quotation" (/quotation/…), then the account step.
 */
export async function submitBuild(input: unknown): Promise<Result<{ next: string }>> {
  const p = submitSchema.safeParse(input)
  if (!p.success) {
    const issue = p.error.issues[0]
    return {
      ok: false,
      error: issue?.message ?? 'Check your details',
      field: issue?.path.at(-1)?.toString(),
    }
  }
  const ip = clientIp(await headers())
  if (!(await hitRateLimit(`build:${ip}`, 20, '1 hour'))) {
    return {
      ok: false,
      error: 'Too many requests from your connection. Please try again in an hour.',
    }
  }
  const live = launchMode() === 'live'
  const r = await saveBuild({
    ctx: await builderContext(),
    sel: p.data.selection,
    contact: p.data.contact,
    depositShare: p.data.depositShare,
    tenure: p.data.tenure as TenureMonths,
    live,
    ip,
    validityDays: await quoteValidityDays(),
  })
  if (!r.ok) return r
  // Both modes show "Your quotation" next (live: /quotation; prelaunch: on /build).
  return {
    ok: true,
    next: live && r.quoteId ? `/quotation/${r.quoteId}` : `/build?quotation=${r.leadId}`,
  }
}

/** The advisor under the builder: facts from the engine, worded by AI when connected. */
export async function adviseBuild(input: unknown): Promise<Result<{ text: string; ai: boolean }>> {
  const p = z.object({ facts: z.array(z.string().max(400)).max(12) }).safeParse(input)
  if (!p.success) return { ok: false, error: 'Check the request.' }
  const ip = clientIp(await headers())
  if (!(await hitRateLimit(`advice:${ip}`, 60, '1 hour'))) {
    return { ok: true, text: p.data.facts.join(' '), ai: false }
  }
  return { ok: true, ...(await adviseFromFacts(p.data.facts)) }
}

/**
 * "Adjust this quote" → "Update my plans": the builder selection replaces that plan in the
 * visitor's own estimate (priced like every plan: lowest deposit, 12 months). No details are
 * asked; the customer goes straight back to the plans.
 */
export async function adjustPlanFromBuilder(input: unknown): Promise<Result<{ next: string }>> {
  const p = z
    .object({
      leadId: z.uuid(),
      plan: z.enum(['essential', 'comfort', 'independence']),
      selection: buildSelectionSchema,
    })
    .safeParse(input)
  if (!p.success) return { ok: false, error: 'Check your choices.' }
  const hash = await currentVisitorHash()
  if (!hash) return { ok: false, error: 'Your session expired. Please start again.' }
  const admin = createAdminClient()
  const { data: lead } = await admin
    .from('waitlist_consumers')
    .select('id, estimate')
    .eq('id', p.data.leadId)
    .eq('visitor_token_hash', hash)
    .maybeSingle()
  const estimate = lead?.estimate as Estimate | null
  if (!lead || !estimate) return { ok: false, error: 'Your session expired. Please start again.' }
  const ctx = await builderContext()
  const { priced, quote } = priceSelection(ctx, p.data.selection, ctx.settings.minDepositShare, 12)
  if (!priced || !quote) return { ok: false, error: 'Choose at least one item first.' }
  if (priced.blocking.length > 0) return { ok: false, error: priced.blocking[0]! }
  const { size, panelWatts } = selectionSummary(ctx, p.data.selection)
  const next = adjustPlan(estimate, p.data.plan, quote, size, panelWatts)
  const { error } = await admin
    .from('waitlist_consumers')
    .update({ estimate: next as unknown as Json })
    .eq('id', lead.id)
  if (error) return { ok: false, error: 'Could not update your plans. Please try again.' }
  return {
    ok: true,
    next:
      launchMode() === 'live'
        ? `/plans?estimate=${lead.id}`
        : `/waitlist?resume=${lead.id}&at=plans`,
  }
}
