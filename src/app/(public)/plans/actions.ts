'use server'

import { z } from 'zod'

import { PLANS, type Estimate } from '@/lib/quotes/buildEstimate'
import { loadLeadForPlans, type LeadForPlans } from '@/lib/quotes/leadForPlans'
import { sendCashReferralNotice, sendSavedQuotes, type SavedQuoteLine } from '@/lib/quotes/messages'
import { cashPrice, priceVariant, quoteReference, validUntil } from '@/lib/quotes/quote'
import type { Plan } from '@/lib/sizing/types'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Json } from '@/lib/supabase/database.types'
import { currentVisitorHash } from '@/lib/waitlist/token'

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string }

const planSchema = z.enum(['essential', 'comfort', 'independence'])
const tenureSchema = z.union([z.literal(3), z.literal(6), z.literal(9), z.literal(12)])
const chooseSchema = z.object({
  leadId: z.uuid(),
  plan: planSchema,
  tenure: tenureSchema,
  depositShare: z.number().min(0.2).max(0.95),
})
const saveSchema = chooseSchema.omit({ plan: true })
const cashSchema = z.object({ leadId: z.uuid(), plan: planSchema })

const REMINDER_AFTER_MS = 2 * 24 * 60 * 60 * 1000
const EXPIRED = { ok: false, error: 'Your session expired. Please start again.' } as const

/** Common columns of a quote row built from the visitor's lead. */
function baseRow(ctx: LeadForPlans, hash: string, plan: Plan) {
  const est: Estimate = ctx.estimate
  return {
    waitlist_id: ctx.lead.id,
    anon_token_hash: hash,
    state: ctx.state,
    applicant_type: ctx.lead.applicant_type,
    load_items: ctx.lead.load_items,
    load_totals: ctx.lead.load_totals,
    energy: ctx.lead.energy,
    plan,
    system_size: est.plans[plan].size as unknown as Json,
    valid_until: validUntil(new Date(), ctx.validityDays).toISOString(),
  }
}

async function insertQuote(
  ctx: LeadForPlans,
  hash: string,
  plan: Plan,
  tenure: 3 | 6 | 9 | 12,
  depositShare: number,
): Promise<{ id: string; line: SavedQuoteLine } | null> {
  const v = priceVariant(ctx.estimate, plan, tenure, depositShare)
  const { data, error } = await createAdminClient()
    .from('quotes')
    .insert({
      ...baseRow(ctx, hash, plan),
      tenure,
      deposit_share: depositShare,
      result: v.quote as unknown as Json,
      status: 'draft',
    })
    .select('id')
    .single()
  if (error) {
    console.error('[quotes] insert failed:', error.message)
    return null
  }
  return {
    id: data.id,
    line: {
      reference: quoteReference(data.id),
      plan,
      systemPrice: v.quote.systemPrice,
      deposit: v.quote.deposit,
      monthly: v.quote.monthly,
      tenureMonths: tenure,
      depositShare,
    },
  }
}

async function context(leadId: string): Promise<{ ctx: LeadForPlans; hash: string } | null> {
  const [ctx, hash] = await Promise.all([loadLeadForPlans(leadId), currentVisitorHash()])
  return ctx && hash ? { ctx, hash } : null
}

/** "Choose this plan": store the quote (draft until the phone is verified) and go to the account step. */
export async function chooseQuote(input: unknown): Promise<Result<{ quoteId: string }>> {
  const parsed = chooseSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Please pick a plan, tenure and deposit.' }
  const c = await context(parsed.data.leadId)
  if (!c) return EXPIRED
  const q = await insertQuote(
    c.ctx,
    c.hash,
    parsed.data.plan,
    parsed.data.tenure,
    parsed.data.depositShare,
  )
  if (!q) return { ok: false, error: 'Could not save your plan. Please try again.' }
  return { ok: true, quoteId: q.id }
}

/** "Save and decide later": all three plans to WhatsApp/email, plus a reminder in two days. */
export async function saveForLater(input: unknown): Promise<Result<{ references: string[] }>> {
  const parsed = saveSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Please pick a tenure and deposit.' }
  const c = await context(parsed.data.leadId)
  if (!c) return EXPIRED

  const saved = []
  for (const plan of PLANS) {
    const q = await insertQuote(c.ctx, c.hash, plan, parsed.data.tenure, parsed.data.depositShare)
    if (!q) return { ok: false, error: 'Could not save your plans. Please try again.' }
    saved.push(q)
  }
  const lead = c.ctx.lead
  const recipient = {
    firstName: lead.first_name ?? '',
    phoneE164: lead.phone_e164,
    whatsappE164: lead.whatsapp_e164,
    email: lead.email,
  }
  const targets = await sendSavedQuotes(
    recipient,
    saved.map((s) => s.line),
    validUntil(new Date(), c.ctx.validityDays),
  )
  const anchor = saved.find((s) => s.line.plan === 'comfort') ?? saved[0]!
  const dueAt = new Date(Date.now() + REMINDER_AFTER_MS).toISOString()
  const { error } = await createAdminClient()
    .from('reminders')
    .insert(
      targets.map((t) => ({ quote_id: anchor.id, channel: t.channel, to: t.to, due_at: dueAt })),
    )
  if (error) console.error('[quotes] reminder insert failed:', error.message)
  return { ok: true, references: saved.map((s) => s.line.reference) }
}

/** "I'll pay in full": record a cash referral; a verified vendor near them will be in touch. */
export async function payInFull(
  input: unknown,
): Promise<Result<{ reference: string; cashPrice: number }>> {
  const parsed = cashSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Please pick a plan.' }
  const c = await context(parsed.data.leadId)
  if (!c) return EXPIRED

  const plan = parsed.data.plan
  const price = cashPrice(c.ctx.estimate.plans[plan].quote.snapshot)
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('quotes')
    .insert({
      ...baseRow(c.ctx, c.hash, plan),
      tenure: null,
      deposit_share: 1,
      result: {
        cash: true,
        cashPrice: price,
        snapshot: c.ctx.estimate.plans[plan].quote.snapshot,
      } as unknown as Json,
      status: 'draft',
    })
    .select('id')
    .single()
  if (error) return { ok: false, error: 'Could not record your request. Please try again.' }
  await admin.from('cash_referrals').insert({ quote_id: data.id })
  const reference = quoteReference(data.id)
  const lead = c.ctx.lead
  await sendCashReferralNotice(
    {
      firstName: lead.first_name ?? '',
      phoneE164: lead.phone_e164,
      whatsappE164: lead.whatsapp_e164,
      email: lead.email,
    },
    reference,
  )
  return { ok: true, reference, cashPrice: price }
}
