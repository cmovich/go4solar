import 'server-only'

import type { SessionInfo } from '@/lib/auth/session'
import { buildContactSchema, buildSelectionSchema } from '@/lib/build/schema'
import { saveBuiltSystem, type StoredSystem } from '@/lib/build/save'
import { builderContext, priceSelection, selectionSummary } from '@/lib/build/server'
import { storedBuild } from '@/lib/build/stored'
import { newPublicCode } from '@/lib/invoices/build'
import { ensureInvoiceForQuote } from '@/lib/invoices/server'
import { TENURES, type TenureMonths } from '@/lib/pricing/types'
import { quoteValidityDays } from '@/lib/quotes/leadForPlans'
import { quoteReference, validUntil } from '@/lib/quotes/quote'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Database, Json } from '@/lib/supabase/database.types'
import { createClient } from '@/lib/supabase/server'
import { currentVisitorHash } from '@/lib/waitlist/token'
import { z } from 'zod'

import {
  canCreateQuotations,
  canStartAssistedApplication,
  customerSchema,
  isTestQuotation,
  quotationStatus,
} from './rules'

export type StaffQuotationRow = Database['public']['Tables']['staff_quotations']['Row']
type Result<T> = ({ ok: true } & T) | { ok: false; error: string; field?: string }

/** May the signed-in staff member (two-factor verified) make quotations? */
export async function mayCreateQuotations(session: SessionInfo): Promise<boolean> {
  if (!session.user || session.aal !== 'aal2') return false
  if (session.role === 'super_admin' || session.role === 'sales') return true
  const { data } = await (
    await createClient()
  ).rpc('has_permission', {
    target: 'create_quotations',
  })
  return canCreateQuotations(session.role, Boolean(data))
}

/** May the signed-in person start a customer's application (assisted entry)? Never sales. */
export async function mayStartAssistedApplication(session: SessionInfo): Promise<boolean> {
  if (!session.user || session.aal !== 'aal2' || session.role === 'sales') return false
  if (session.role === 'super_admin') return true
  const { data } = await (await createClient()).rpc('has_permission', { target: 'assisted_entry' })
  return canStartAssistedApplication(session.role, Boolean(data))
}

export const createSchema = z.object({
  customer: customerSchema,
  selection: buildSelectionSchema,
  depositShare: z.number().min(0.2).max(0.95),
  tenure: z.number().refine((t): t is TenureMonths => (TENURES as readonly number[]).includes(t)),
})

async function audit(actorId: string | null, action: string, id: string, after: Json) {
  await createAdminClient().from('audit_log').insert({
    actor_id: actorId,
    action,
    entity: 'staff_quotations',
    entity_id: id,
    before: null,
    after,
  })
}

/**
 * Price the builder selection (the same engine as every quote) and save it as a staff quotation
 * with its snapshot. No account, sign-up or ID check. The caller checks the permission.
 */
export async function createStaffQuotation(
  session: SessionInfo,
  input: unknown,
): Promise<Result<{ id: string }>> {
  const p = createSchema.safeParse(input)
  if (!p.success) {
    const issue = p.error.issues[0]
    return {
      ok: false,
      error: issue?.message ?? 'Check the quotation',
      field: issue?.path.at(-1)?.toString(),
    }
  }
  const { customer, depositShare } = p.data
  // The customer's state decides sun hours, delivery and installation prices.
  const selection = { ...p.data.selection, state: customer.state }
  const ctx = await builderContext()
  const { priced, quote } = priceSelection(
    ctx,
    selection,
    depositShare,
    p.data.tenure as TenureMonths,
  )
  if (!priced || !quote) return { ok: false, error: 'Choose at least one item first.' }
  if (priced.blocking.length > 0) return { ok: false, error: priced.blocking[0]! }
  const { size } = selectionSummary(ctx, selection)
  const stored: StoredSystem & { kind: 'builder' } = {
    kind: 'builder',
    selection,
    notes: priced.notes,
    size,
    quote,
    sample: priced.sample,
  }

  const admin = createAdminClient()
  const { data: me } = await admin
    .from('profiles')
    .select('is_test')
    .eq('id', session.user!.id)
    .maybeSingle()
  const now = new Date()
  const { data: row, error } = await admin
    .from('staff_quotations')
    .insert({
      public_code: newPublicCode(),
      created_by: session.user!.id,
      created_at: now.toISOString(),
      customer_name: customer.name,
      customer_phone: customer.phone,
      state: customer.state,
      site: selection.site as Json,
      builder: stored as unknown as Json,
      deposit_share: quote.snapshot.depositShare,
      tenure: quote.snapshot.tenureMonths,
      total: quote.systemPrice,
      monthly: quote.monthly,
      sample: priced.sample,
      valid_until: validUntil(now, await quoteValidityDays()).toISOString(),
      is_test: isTestQuotation(Boolean(me?.is_test), customer.phone),
    })
    .select('id')
    .single()
  if (error) {
    console.error('[staff-quotation] save failed:', error.message)
    return { ok: false, error: 'Could not save the quotation. Please try again.' }
  }
  await audit(session.user!.id, 'staff_quotation.create', row.id, {
    reference: quoteReference(row.id),
    customerName: customer.name,
    state: customer.state,
    total: quote.systemPrice,
    sample: priced.sample,
  })
  return { ok: true, id: row.id }
}

/** One quotation for the admin pages: super admins see all, others only their own. */
export async function staffQuotationForAdmin(
  session: SessionInfo,
  id: string,
): Promise<StaffQuotationRow | null> {
  if (!z.uuid().safeParse(id).success) return null
  const { data } = await createAdminClient()
    .from('staff_quotations')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (!data) return null
  if (session.role !== 'super_admin' && data.created_by !== session.user?.id) return null
  return data
}

/** "Share on WhatsApp" / "Copy link": the first share is recorded (status "Shared"). */
export async function markShared(session: SessionInfo, id: string): Promise<Result<object>> {
  const row = await staffQuotationForAdmin(session, id)
  if (!row) return { ok: false, error: 'This quotation could not be found.' }
  if (row.shared_at) return { ok: true }
  const { error } = await createAdminClient()
    .from('staff_quotations')
    .update({ shared_at: new Date().toISOString() })
    .eq('id', id)
    .is('shared_at', null)
  if (error) return { ok: false, error: 'Could not record the share.' }
  await audit(session.user!.id, 'staff_quotation.share', id, { reference: quoteReference(id) })
  return { ok: true }
}

const CODE = z.string().regex(/^[a-z0-9]{10,16}$/)

/** The customer link /q/<code>: the quotation, whoever has the link. */
export async function staffQuotationByCode(code: string): Promise<StaffQuotationRow | null> {
  if (!CODE.safeParse(code).success) return null
  const { data, error } = await createAdminClient()
    .from('staff_quotations')
    .select('*')
    .eq('public_code', code)
    .maybeSingle()
  if (error) {
    console.error('[staff-quotation] not available:', error.message)
    return null
  }
  return data
}

/**
 * Where an already-accepted quotation continues for this visitor (live: their account step), or
 * null (another device, or prelaunch: nothing more to do).
 */
export async function acceptedNext(row: StaffQuotationRow): Promise<string | null> {
  if (!row.accepted_quote_id) return null
  const hash = await currentVisitorHash()
  if (!hash) return null
  const { data: quote } = await createAdminClient()
    .from('quotes')
    .select('id, anon_token_hash')
    .eq('id', row.accepted_quote_id)
    .maybeSingle()
  return quote && quote.anon_token_hash === hash ? `/account?quote=${quote.id}` : null
}

/**
 * "Accept and apply": the customer's own details start the normal sign-up from this quotation's
 * snapshot (the price never changes). Live: a quote, accepted, its invoice, then the account step
 * (phone code, ID checks…). Prelaunch: the sign-up entry and its confirmation.
 */
export async function acceptStaffQuotation(input: {
  code: string
  contact: unknown
  live: boolean
  ip: string
  origin: string
}): Promise<Result<{ next: string | null }>> {
  const row = await staffQuotationByCode(input.code)
  if (!row) return { ok: false, error: 'This quotation could not be found.' }
  const status = quotationStatus(row)
  if (status === 'accepted') {
    const next = await acceptedNext(row)
    return next ? { ok: true, next } : { ok: false, error: 'This quotation was already accepted.' }
  }
  if (status === 'expired') {
    return { ok: false, error: 'This quotation has expired. Ask us for a new one.' }
  }
  const c = buildContactSchema.safeParse(input.contact)
  if (!c.success) {
    const issue = c.error.issues[0]
    return {
      ok: false,
      error: issue?.message ?? 'Check your details',
      field: issue?.path.at(-1)?.toString(),
    }
  }
  const stored = row.builder as unknown as StoredSystem
  if (!storedBuild(row.builder)) return { ok: false, error: 'This quotation could not be found.' }

  const saved = await saveBuiltSystem({
    stored,
    contact: c.data,
    live: input.live,
    ip: input.ip,
    validityDays: await quoteValidityDays(),
    fromStaff: { enteredBy: row.created_by },
  })
  if (!saved.ok) return saved
  const admin = createAdminClient()
  // Only the first acceptance is recorded (two taps at once: the second is not).
  await admin
    .from('staff_quotations')
    .update({
      accepted_at: new Date().toISOString(),
      accepted_lead_id: saved.leadId,
      accepted_quote_id: saved.quoteId,
    })
    .eq('id', row.id)
    .is('accepted_at', null)
  await audit(null, 'staff_quotation.accept', row.id, {
    reference: quoteReference(row.id),
    leadId: saved.leadId,
    quoteId: saved.quoteId,
  })
  if (saved.quoteId) {
    const issued = await ensureInvoiceForQuote(saved.quoteId, input.origin)
    // The invoice never blocks the customer: My account issues it later if this fails.
    if (!issued.ok) console.error('[staff-quotation] invoice not issued yet:', issued.reason)
    return { ok: true, next: `/account?quote=${saved.quoteId}` }
  }
  return { ok: true, next: null }
}

export type StaffQuotationListRow = StaffQuotationRow & { createdByName: string | null }

/** Admin → Quotations: newest first, filtered by staff member and Lagos days; test data hidden. */
export async function listStaffQuotations(
  session: SessionInfo,
  f: { staff: string | null; from: string | null; to: string | null; test: boolean },
): Promise<{ rows: StaffQuotationListRow[]; staff: { id: string; name: string }[] } | null> {
  const admin = createAdminClient()
  let q = admin
    .from('staff_quotations')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500)
  // Staff other than super admins see only their own quotations.
  if (session.role !== 'super_admin') q = q.eq('created_by', session.user!.id)
  else if (f.staff) q = q.eq('created_by', f.staff)
  if (f.from) q = q.gte('created_at', f.from)
  if (f.to) q = q.lte('created_at', f.to)
  if (!f.test) q = q.eq('is_test', false)
  const { data, error } = await q
  if (error) {
    console.error('[staff-quotation] list not available:', error.message)
    return null
  }
  const { data: people } = await admin
    .from('profiles')
    .select('id, full_name, email')
    .in('id', [...new Set(data.map((r) => r.created_by).filter((x): x is string => Boolean(x)))])
  const names = new Map((people ?? []).map((p) => [p.id, p.full_name || p.email || 'Staff']))
  // Everyone who may make quotations (super admins, sales, ticked staff), for the staff filter.
  let staff: { id: string; name: string }[] = []
  if (session.role === 'super_admin') {
    const [{ data: perms }, { data: supers }] = await Promise.all([
      admin.from('staff_permissions').select('profile_id').eq('permission', 'create_quotations'),
      admin.from('profiles').select('id').in('role', ['super_admin', 'sales']),
    ])
    const ids = [
      ...new Set([...(perms ?? []).map((p) => p.profile_id), ...(supers ?? []).map((p) => p.id)]),
    ]
    const { data: list } = await admin.from('profiles').select('id, full_name, email').in('id', ids)
    staff = (list ?? [])
      .map((p) => ({ id: p.id, name: p.full_name || p.email || 'Staff' }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }
  return {
    rows: data.map((r) => ({
      ...r,
      createdByName: r.created_by ? (names.get(r.created_by) ?? null) : null,
    })),
    staff,
  }
}
