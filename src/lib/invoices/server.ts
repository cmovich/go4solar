import 'server-only'

import { isOwnSystem, OWN_SYSTEM_LABEL, storedBuild } from '@/lib/build/stored'
import { itemSizes, loadCatalogue } from '@/lib/catalogue/server'
import { loadCompany } from '@/lib/company/server'
import { isNgStateId, stateLabel } from '@/lib/nigeria/states'
import { offeredTenures } from '@/lib/pricing/tenures'
import type { QuoteResult, TenureMonths } from '@/lib/pricing/types'
import { PLAN_LABELS, type Estimate } from '@/lib/quotes/buildEstimate'
import { loadLeadForPlans, quoteValidityDays, type LeadRow } from '@/lib/quotes/leadForPlans'
import { priceVariant, quoteReference } from '@/lib/quotes/quote'
import type { Plan } from '@/lib/sizing/types'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Database, Json } from '@/lib/supabase/database.types'
import { siteAnswersSchema } from '@/lib/wizard/questions'
import { fetchRoofTypes } from '@/lib/wizard/server'

import { buildInvoice, newPublicCode, type InvoiceCustomer, type InvoiceData } from './build'

type QuoteRow = Database['public']['Tables']['quotes']['Row']
type ProfileRow = Database['public']['Tables']['profiles']['Row']

export type DocResult =
  | { ok: true; invoice: InvoiceData; id: string | null }
  | { ok: false; reason: 'not_found' | 'sample' | 'not_ready' }

/** What a quotation or invoice is drawn from. */
type Source = {
  result: QuoteResult
  title: string
  reference: string
  site: unknown
  builder: unknown
  customer: InvoiceCustomer
  isTest: boolean
}

const PLANS: Plan[] = ['essential', 'comfort', 'independence']

function customerFromLead(lead: LeadRow): InvoiceCustomer {
  const business = (lead.business as { businessName?: string } | null)?.businessName ?? null
  return {
    firstName: lead.first_name ?? 'Customer',
    name: [lead.first_name, lead.surname].filter(Boolean).join(' ') || 'Customer',
    phone: lead.phone_e164,
    email: lead.email,
    place: placeOf(lead.lga, lead.state),
    businessName: lead.applicant_type === 'business' ? business : null,
  }
}

/** Quotes made before every quote carried a lead: the customer's account details. */
function customerFromProfile(p: ProfileRow, state: string | null): InvoiceCustomer {
  const name = p.full_name?.trim() || 'Customer'
  return {
    firstName: name.split(/\s+/)[0] ?? 'Customer',
    name,
    phone: (p as ProfileRow & { phone_e164?: string | null }).phone_e164 ?? null,
    email: p.email,
    place: placeOf(null, p.state ?? state),
    businessName: null,
  }
}

function placeOf(lga: string | null, state: string | null): string | null {
  const s = state && isNgStateId(state) ? stateLabel(state) : state
  return [lga, s].filter(Boolean).join(', ') || null
}

/** A stored quote as a document source (customer from its lead, else from its owner's account). */
async function sourceFromQuote(quote: QuoteRow): Promise<Source | null> {
  const admin = createAdminClient()
  const [{ data: lead }, { data: profile }] = await Promise.all([
    quote.waitlist_id
      ? admin.from('waitlist_consumers').select('*').eq('id', quote.waitlist_id).maybeSingle()
      : Promise.resolve({ data: null }),
    quote.owner_id
      ? admin.from('profiles').select('*').eq('id', quote.owner_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])
  const customer = lead
    ? customerFromLead(lead)
    : profile
      ? customerFromProfile(profile, quote.state)
      : null
  if (!customer) return null
  return {
    result: quote.result as unknown as QuoteResult,
    title: isOwnSystem(quote.builder)
      ? OWN_SYSTEM_LABEL
      : `${PLAN_LABELS[quote.plan as Plan]} plan`,
    reference: quoteReference(quote.id),
    site: quote.site,
    builder: quote.builder,
    customer,
    isTest: Boolean(lead?.is_test || profile?.is_test),
  }
}

/** Prices on a not-yet-accepted quote that were SAMPLE values are never printed. */
function quoteIsSample(quote: QuoteRow, lead: { estimate: unknown } | null): boolean {
  if (isOwnSystem(quote.builder)) return storedBuild(quote.builder)?.sample ?? true
  return Boolean((lead?.estimate as Estimate | null)?.sample)
}

async function prepare(
  src: Source,
  kind: 'quotation' | 'invoice',
  number: string,
  publicCode: string,
  verifyUrl: string | null,
): Promise<InvoiceData> {
  // Only the item sizes are needed here (not the price settings), so the catalogue alone.
  const [company, validityDays, roofTypes, catalogue] = await Promise.all([
    loadCompany(),
    quoteValidityDays(),
    fetchRoofTypes(),
    // installByState is not used for sizes.
    loadCatalogue(createAdminClient(), { Other: { small: 0, medium: 0, large: 0 } }),
  ])
  const items = catalogue ? itemSizes(catalogue) : {}
  const site = siteAnswersSchema.safeParse(src.site ?? {}).data ?? {}
  const roof = roofTypes.find((r) => r.id === site.roofTypeId)
  const selection = (src.builder as { selection?: { installer?: string } } | null)?.selection
  return buildInvoice({
    kind,
    number,
    publicCode,
    verifyUrl,
    issuedAt: new Date(),
    validityDays,
    company,
    customer: src.customer,
    title: src.title,
    reference: src.reference,
    result: src.result,
    items,
    site,
    roofNeedsRack: roof?.needsRack ?? false,
    installer: selection?.installer === 'own' ? 'own' : 'go4solar',
    packIncluded: src.result.lines.some((l) => items[l.sku]?.pack),
  })
}

const quotation = async (src: Source): Promise<DocResult> => ({
  ok: true,
  id: null,
  invoice: await prepare(src, 'quotation', src.reference, '', null),
})

// ------------------------------------------------------------------ quotations (no number)

/**
 * "Your quotation" for a live quote, before Accept. The caller checks the visitor owns it.
 * Nothing is saved and no invoice number is used.
 */
export async function quotationForQuote(quoteId: string): Promise<DocResult> {
  const admin = createAdminClient()
  const { data: quote } = await admin.from('quotes').select('*').eq('id', quoteId).maybeSingle()
  if (!quote) return { ok: false, reason: 'not_found' }
  const { data: lead } = quote.waitlist_id
    ? await admin
        .from('waitlist_consumers')
        .select('estimate')
        .eq('id', quote.waitlist_id)
        .maybeSingle()
    : { data: null }
  if (quoteIsSample(quote, lead)) return { ok: false, reason: 'sample' }
  const src = await sourceFromQuote(quote)
  return src ? quotation(src) : { ok: false, reason: 'not_found' }
}

/** The plans page: one plan at a deposit and length (visitor cookie checked by loadLeadForPlans). */
export async function quotationForPlan(input: {
  leadId: string
  plan: Plan
  depositShare: number
  tenure: TenureMonths
}): Promise<DocResult> {
  const lfp = await loadLeadForPlans(input.leadId)
  if (!lfp) return { ok: false, reason: 'not_found' }
  if (lfp.estimate.sample) return { ok: false, reason: 'sample' }
  if (!PLANS.includes(input.plan)) return { ok: false, reason: 'not_found' }
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
  return quotation({
    result,
    title: `${PLAN_LABELS[input.plan]} plan`,
    reference: quoteReference(lfp.lead.id),
    site: lfp.lead.site,
    builder: null,
    customer: customerFromLead(lfp.lead),
    isTest: Boolean(lfp.lead.is_test),
  })
}

/** Prelaunch builder: the system the visitor submitted (lead.builder), visitor cookie checked. */
export async function quotationForBuilderLead(
  leadId: string,
  visitorHash: string,
): Promise<DocResult> {
  const { data: lead } = await createAdminClient()
    .from('waitlist_consumers')
    .select('*')
    .eq('id', leadId)
    .eq('visitor_token_hash', visitorHash)
    .maybeSingle()
  const stored = lead ? storedBuild(lead.builder) : null
  if (!lead || !stored) return { ok: false, reason: 'not_found' }
  if (stored.sample) return { ok: false, reason: 'sample' }
  return quotation({
    result: (lead.builder as unknown as { quote: QuoteResult }).quote,
    title: OWN_SYSTEM_LABEL,
    reference: quoteReference(lead.id),
    site: lead.site,
    builder: lead.builder,
    customer: customerFromLead(lead),
    isTest: Boolean(lead.is_test),
  })
}

// ------------------------------------------------------------------ invoices (numbered)

/**
 * The numbered invoice for a quote: the one already issued, else a new one (on Accept, or the
 * first time an older accepted quote is opened from My account or admin). The stored quote
 * result is printed as it is, so later price changes never alter it. Callers check access.
 */
export async function ensureInvoiceForQuote(quoteId: string, origin: string): Promise<DocResult> {
  const admin = createAdminClient()
  const existing = await admin
    .from('invoices')
    .select('id, data')
    .eq('quote_id', quoteId)
    .order('issued_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (existing.error) {
    console.error('[invoices] not available:', existing.error.message)
    return { ok: false, reason: 'not_ready' }
  }
  if (existing.data) {
    return { ok: true, id: existing.data.id, invoice: existing.data.data as unknown as InvoiceData }
  }
  const { data: quote } = await admin.from('quotes').select('*').eq('id', quoteId).maybeSingle()
  if (!quote) return { ok: false, reason: 'not_found' }
  const src = await sourceFromQuote(quote)
  if (!src) return { ok: false, reason: 'not_found' }

  const { data: number, error: numberError } = await admin.rpc('next_invoice_number', {
    p_test: src.isTest,
  })
  if (numberError || !number) {
    console.error('[invoices] no invoice number:', numberError?.message)
    return { ok: false, reason: 'not_ready' }
  }
  const publicCode = newPublicCode()
  const invoice = await prepare(
    src,
    'invoice',
    number,
    publicCode,
    `${origin}/verify/${publicCode}`,
  )
  const { data: row, error } = await admin
    .from('invoices')
    .insert({
      number,
      public_code: publicCode,
      quote_id: quote.id,
      waitlist_id: quote.waitlist_id,
      consumer_id: quote.owner_id,
      source_key: `quote:${quote.id}`,
      data: invoice as unknown as Json,
      total: invoice.totals.total,
      first_name: src.customer.firstName,
      issued_at: invoice.issuedAt,
      valid_until: invoice.validUntil,
      is_test: src.isTest,
    })
    .select('id')
    .single()
  if (error) {
    // Two requests at the same moment: use the invoice that was saved first.
    const again = await admin
      .from('invoices')
      .select('id, data')
      .eq('source_key', `quote:${quote.id}`)
      .maybeSingle()
    if (again.data) {
      return { ok: true, id: again.data.id, invoice: again.data.data as unknown as InvoiceData }
    }
    console.error('[invoices] could not save:', error.message)
    return { ok: false, reason: 'not_ready' }
  }
  return { ok: true, id: row.id, invoice }
}

/** A saved invoice by id (the signed PDF link). */
export async function invoiceById(id: string): Promise<InvoiceData | null> {
  const { data } = await createAdminClient()
    .from('invoices')
    .select('data')
    .eq('id', id)
    .maybeSingle()
  return (data?.data as unknown as InvoiceData | undefined) ?? null
}
