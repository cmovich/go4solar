'use server'

import { headers } from 'next/headers'
import { z } from 'zod'

import { launchMode } from '@/config/site'
import { adviseFromFacts } from '@/lib/build/advisor'
import { buildContactSchema, buildSelectionSchema } from '@/lib/build/schema'
import { saveBuild } from '@/lib/build/save'
import {
  builderContext,
  priceSelection,
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
    .object({ kva: z.number().min(0.3).max(100), selection: buildSelectionSchema })
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
 * goes on to the account step (/account?quote=…).
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
  return { ok: true, next: live && r.quoteId ? `/account?quote=${r.quoteId}` : '/build?done=1' }
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
