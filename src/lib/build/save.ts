import 'server-only'

import { recordConsents } from '@/lib/consent/server'
import { consentRecord } from '@/lib/consent/texts'
import type { TenureMonths } from '@/lib/pricing/types'
import { validUntil } from '@/lib/quotes/quote'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Json } from '@/lib/supabase/database.types'
import { sendWaitlistConfirmation } from '@/lib/waitlist/messages'
import { getOrCreateVisitorToken } from '@/lib/waitlist/token'
import { gridFromAnswers } from '@/lib/wizard/questions'

import type { BuildSelectionInput } from './schema'
import { systemSummary } from './schema'
import { OWN_SYSTEM_LABEL } from './stored'
import { priceSelection, type BuilderContext } from './server'

export { OWN_SYSTEM_LABEL as BUILDER_PLAN_LABEL } from './stored'

type Contact = {
  firstName: string
  surname: string
  phone: string
  email: string
  lga: string
}

/**
 * Save a builder system with the customer's details: a complete waiting-list entry (both modes,
 * so staff see it in /admin/waitlist) and, in live mode, a quote that goes on to the account
 * step. The selection and its priced snapshot travel with both, so later price changes never
 * alter them.
 */
export async function saveBuild(input: {
  ctx: BuilderContext
  sel: BuildSelectionInput
  contact: Contact
  depositShare: number
  tenure: TenureMonths
  live: boolean
  ip: string
  validityDays: number
}): Promise<{ ok: true; leadId: string; quoteId: string | null } | { ok: false; error: string }> {
  const { ctx, sel, contact } = input
  const { priced, quote } = priceSelection(ctx, sel, input.depositShare, input.tenure)
  if (!priced || !quote) return { ok: false, error: 'Choose at least one item first.' }
  if (priced.blocking.length > 0) return { ok: false, error: priced.blocking[0]! }

  const admin = createAdminClient()
  const { hash } = await getOrCreateVisitorToken()
  const cat = ctx.catalogue!
  const inverter = cat.inverters.find((i) => sel.items.some((s) => s.sku === i.sku))
  const panels = sel.items
    .map((s) => ({ s, p: cat.panels.find((p) => p.sku === s.sku) }))
    .find((x) => x.p)
  const size = systemSummary(
    {
      inverterKva: inverter?.kva ?? null,
      batteries: sel.items.flatMap((s) => {
        const b = cat.batteries.find((x) => x.sku === s.sku)
        return b ? [{ kwh: b.kwh, qty: s.qty }] : []
      }),
      panels: panels ? { watts: panels.p!.watts, count: panels.s.qty } : null,
    },
    ctx.settings.sizing.dod * ctx.settings.sizing.inverterEfficiency,
  )
  const builder = {
    kind: 'builder',
    selection: sel,
    notes: priced.notes,
    size,
    quote,
    sample: priced.sample,
  } as unknown as Json

  const { data: existing } = await admin
    .from('waitlist_consumers')
    .select('id')
    .eq('phone_e164', contact.phone)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  const { data: lead, error } = await admin
    .from('waitlist_consumers')
    .insert({
      status: 'complete',
      visitor_token_hash: hash,
      phone_e164: contact.phone,
      whatsapp_e164: contact.phone,
      email: contact.email,
      first_name: contact.firstName,
      surname: contact.surname,
      state: sel.state,
      lga: contact.lga,
      consent: true,
      consent_at: new Date().toISOString(),
      applicant_type: 'individual',
      load_items: [],
      load_totals: {},
      deposit_share: input.depositShare,
      ready_when: 'now',
      site: sel.site as Json,
      grid: gridFromAnswers(sel.site) as Json | null,
      builder,
      duplicate_of: existing?.id ?? null,
    })
    .select('id')
    .single()
  if (error) {
    console.error('[build] lead insert failed:', error.message)
    return { ok: false, error: 'Could not save your system. Please try again.' }
  }
  await recordConsents([
    {
      subjectType: 'waitlist_lead',
      subjectId: lead.id,
      ip: input.ip,
      consent: consentRecord('contact'),
    },
  ])

  let quoteId: string | null = null
  if (input.live) {
    const { data: q, error: qe } = await admin
      .from('quotes')
      .insert({
        waitlist_id: lead.id,
        anon_token_hash: hash,
        state: sel.state,
        applicant_type: 'individual',
        load_items: [],
        load_totals: {},
        energy: null,
        // The plan column needs one of the three; `builder` marks a customer-built system.
        plan: 'comfort',
        system_size: size as unknown as Json,
        tenure: quote.snapshot.tenureMonths,
        deposit_share: input.depositShare,
        result: quote as unknown as Json,
        valid_until: validUntil(new Date(), input.validityDays).toISOString(),
        status: 'draft',
        site: sel.site as Json,
        grid: gridFromAnswers(sel.site) as Json | null,
        builder,
      })
      .select('id')
      .single()
    if (qe) {
      console.error('[build] quote insert failed:', qe.message)
      return { ok: false, error: 'Could not save your quote. Please try again.' }
    }
    quoteId = q.id
  } else {
    await sendWaitlistConfirmation({
      firstName: contact.firstName,
      phoneE164: contact.phone,
      whatsappE164: contact.phone,
      email: contact.email,
      plan: 'comfort',
      planLabel: OWN_SYSTEM_LABEL,
      depositShare: input.depositShare,
      systemPrice: quote.systemPrice,
      deposit: quote.deposit,
      monthly: quote.monthly,
      tenureMonths: quote.snapshot.tenureMonths,
      samplePrices: priced.sample,
    })
  }
  return { ok: true, leadId: lead.id, quoteId }
}
