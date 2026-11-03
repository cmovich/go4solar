import 'server-only'

import { builderContext, builderItems } from '@/lib/build/server'
import { isOwnSystem, OWN_SYSTEM_LABEL } from '@/lib/build/stored'
import { loadCompany } from '@/lib/company/server'
import { stateLabel, isNgStateId } from '@/lib/nigeria/states'
import { offeredTenures } from '@/lib/pricing/tenures'
import type { QuoteResult, TenureMonths } from '@/lib/pricing/types'
import { PLAN_LABELS, type Estimate } from '@/lib/quotes/buildEstimate'
import { loadLeadForPlans, quoteValidityDays, type LeadRow } from '@/lib/quotes/leadForPlans'
import { priceVariant, quoteReference } from '@/lib/quotes/quote'
import type { Plan } from '@/lib/sizing/types'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Json } from '@/lib/supabase/database.types'
import { siteAnswersSchema } from '@/lib/wizard/questions'
import { fetchRoofTypes } from '@/lib/wizard/server'

import { buildInvoice, newPublicCode, type InvoiceData } from './build'

export type IssueResult =
  | { ok: true; invoice: InvoiceData; id: string }
  | { ok: false; reason: 'not_found' | 'sample' | 'not_ready' }

type Source = {
  sourceKey: string
  lead: LeadRow
  result: QuoteResult
  title: string
  reference: string
  site: unknown
  builder: unknown
  quoteId: string | null
  consumerId: string | null
}

/**
 * The invoice for a customer's own quote (My account, admin): the stored quote result is used as
 * it is, so later price changes never alter it. The caller checks who may see it.
 */
export async function invoiceForQuote(quoteId: string, origin: string): Promise<IssueResult> {
  const admin = createAdminClient()
  const { data: quote } = await admin.from('quotes').select('*').eq('id', quoteId).maybeSingle()
  if (!quote?.waitlist_id) return { ok: false, reason: 'not_found' }
  const { data: lead } = await admin
    .from('waitlist_consumers')
    .select('*')
    .eq('id', quote.waitlist_id)
    .maybeSingle()
  if (!lead) return { ok: false, reason: 'not_found' }
  const own = isOwnSystem(quote.builder)
  const sample = own
    ? (quote.builder as { sample?: boolean } | null)?.sample !== false
    : Boolean((lead.estimate as Estimate | null)?.sample)
  if (sample) return { ok: false, reason: 'sample' }
  const result = quote.result as unknown as QuoteResult
  return issue(
    {
      sourceKey: `quote:${quote.id}:${result.systemPrice}:${result.deposit}:${quote.tenure}`,
      lead,
      result,
      title: own ? OWN_SYSTEM_LABEL : `${PLAN_LABELS[quote.plan as Plan]} plan`,
      reference: quoteReference(quote.id),
      site: quote.site,
      builder: quote.builder,
      quoteId: quote.id,
      consumerId: quote.owner_id,
    },
    origin,
  )
}

/**
 * The invoice for one plan on the plans page, at the deposit and length the visitor chose. Only
 * the visitor whose cookie owns the lead gets it (loadLeadForPlans checks).
 */
export async function invoiceForPlan(
  input: { leadId: string; plan: Plan; depositShare: number; tenure: TenureMonths },
  origin: string,
): Promise<IssueResult> {
  const lfp = await loadLeadForPlans(input.leadId)
  if (!lfp) return { ok: false, reason: 'not_found' }
  if (lfp.estimate.sample) return { ok: false, reason: 'sample' }
  let result: QuoteResult
  try {
    result = priceVariant(
      lfp.estimate,
      input.plan,
      input.tenure,
      input.depositShare,
      offeredTenures(lfp.estimate.pricingRateByTenure, lfp.tenures),
    ).quote
  } catch {
    return { ok: false, reason: 'not_found' }
  }
  const lead = lfp.lead
  return issue(
    {
      sourceKey: `lead:${lead.id}:${input.plan}:${result.systemPrice}:${result.deposit}:${input.tenure}`,
      lead,
      result,
      title: `${PLAN_LABELS[input.plan]} plan`,
      reference: quoteReference(lead.id),
      site: lead.site,
      builder: null,
      quoteId: null,
      consumerId: null,
    },
    origin,
  )
}

/** The same source (plan, deposit, length, price) still valid → the same invoice; else a new one. */
async function issue(src: Source, origin: string): Promise<IssueResult> {
  const admin = createAdminClient()
  const latest = await admin
    .from('invoices')
    .select('id, data, valid_until, source_key')
    .like('source_key', `${src.sourceKey}%`)
    .order('issued_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (latest.error) {
    console.error('[invoices] not available:', latest.error.message)
    return { ok: false, reason: 'not_ready' }
  }
  if (latest.data && new Date(latest.data.valid_until).getTime() > Date.now()) {
    return { ok: true, id: latest.data.id, invoice: latest.data.data as unknown as InvoiceData }
  }

  const [company, validityDays, roofTypes, ctx] = await Promise.all([
    loadCompany(),
    quoteValidityDays(),
    fetchRoofTypes(),
    builderContext(),
  ])
  const items = Object.fromEntries(
    builderItems(ctx).map((i) => [i.sku, { spec: i.size, unit: i.unit, pack: i.kind === 'pack' }]),
  )
  const site = siteAnswersSchema.safeParse(src.site ?? {}).data ?? {}
  const roof = roofTypes.find((r) => r.id === site.roofTypeId)
  const selection = (src.builder as { selection?: { installer?: string } } | null)?.selection
  const lead = src.lead
  const business = (lead.business as { businessName?: string } | null)?.businessName ?? null
  const isTest = Boolean(lead.is_test)

  const { data: number, error: numberError } = await admin.rpc('next_invoice_number', {
    p_test: isTest,
  })
  if (numberError || !number) {
    console.error('[invoices] no invoice number:', numberError?.message)
    return { ok: false, reason: 'not_ready' }
  }
  const publicCode = newPublicCode()
  const invoice = buildInvoice({
    number,
    publicCode,
    verifyUrl: `${origin}/verify/${publicCode}`,
    issuedAt: new Date(),
    validityDays,
    company,
    customer: {
      firstName: lead.first_name ?? 'Customer',
      name: [lead.first_name, lead.surname].filter(Boolean).join(' ') || 'Customer',
      phone: lead.phone_e164,
      email: lead.email,
      place:
        [lead.lga, lead.state && isNgStateId(lead.state) ? stateLabel(lead.state) : lead.state]
          .filter(Boolean)
          .join(', ') || null,
      businessName: lead.applicant_type === 'business' ? business : null,
    },
    title: src.title,
    reference: src.reference,
    result: src.result,
    items,
    site,
    roofNeedsRack: roof?.needsRack ?? false,
    installer: selection?.installer === 'own' ? 'own' : 'go4solar',
    packIncluded: src.result.lines.some((l) => items[l.sku]?.pack),
  })
  const sourceKey = latest.data ? `${src.sourceKey}:${Date.now()}` : src.sourceKey
  const { data: row, error } = await admin
    .from('invoices')
    .insert({
      number,
      public_code: publicCode,
      quote_id: src.quoteId,
      waitlist_id: lead.id,
      consumer_id: src.consumerId,
      source_key: sourceKey,
      data: invoice as unknown as Json,
      total: invoice.totals.total,
      first_name: lead.first_name,
      issued_at: invoice.issuedAt,
      valid_until: invoice.validUntil,
      is_test: isTest,
    })
    .select('id')
    .single()
  if (error) {
    // Two downloads at the same moment: use the one that was saved first.
    const again = await admin
      .from('invoices')
      .select('id, data')
      .eq('source_key', sourceKey)
      .maybeSingle()
    if (again.data) {
      return { ok: true, id: again.data.id, invoice: again.data.data as unknown as InvoiceData }
    }
    console.error('[invoices] could not save:', error.message)
    return { ok: false, reason: 'not_ready' }
  }
  return { ok: true, id: row.id, invoice }
}
