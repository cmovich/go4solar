import 'server-only'

import type { Personal } from '@/lib/applications/server'
import type { QuoteResult } from '@/lib/pricing/types'
import { quoteReference } from '@/lib/quotes/quote'
import type { SystemSize } from '@/lib/sizing/types'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Database } from '@/lib/supabase/database.types'

import { agreementValues, renderTemplate, templateBody, type AgreementValues } from './render'
import { currentTemplate, lateFeeSettings, type TemplateRow } from './server'
import { checkGuaranteeToken, hashGuaranteeToken, type GuaranteeCheck } from './tokens'

export type GuaranteeRow = Database['public']['Tables']['guarantees']['Row']

export type GuarantorStepId = 'intro' | 'nin' | 'consent' | 'face' | 'about' | 'sign'
export const GUARANTOR_STEPS: GuarantorStepId[] = [
  'intro',
  'nin',
  'consent',
  'face',
  'about',
  'sign',
]

export type GuaranteeDetails = {
  firstName?: string
  surname?: string
  dob?: string
  address?: string
  state?: string
  employment?: string
  employer?: string
  incomeRange?: string
}

export type OpenGuarantee = {
  check: GuaranteeCheck
  row: GuaranteeRow | null
}

/** Find the guarantee for a link token (only the keyed hash is stored) and say if it can be used. */
export async function openGuarantee(token: string): Promise<OpenGuarantee> {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return { check: 'not_found', row: null }
  let hash: string
  try {
    hash = hashGuaranteeToken(token)
  } catch {
    return { check: 'not_found', row: null }
  }
  const { data } = await createAdminClient()
    .from('guarantees')
    .select('*')
    .eq('token_hash', hash)
    .maybeSingle()
  return { check: checkGuaranteeToken(data), row: data }
}

export type GuaranteeContext = {
  applicantName: string
  applicantPhone: string | null
  applicantEmail: string | null
  applicantNinHash: string | null
  consumerId: string
  reference: string
  quote: QuoteResult
  tenure: number
  values: AgreementValues
  template: TemplateRow
  text: string
}

/** The plan being guaranteed, from the STORED quote snapshot, plus the guarantee text. */
export async function guaranteeContext(row: GuaranteeRow): Promise<GuaranteeContext | null> {
  const admin = createAdminClient()
  const { data: app } = await admin
    .from('applications')
    .select(
      'id, consumer_id, quote_id, applicant_type, personal, business, install_address, nin_hash',
    )
    .eq('id', row.application_id)
    .single()
  if (!app?.quote_id) return null
  const { data: quote } = await admin
    .from('quotes')
    .select('id, tenure, result, system_size')
    .eq('id', app.quote_id)
    .single()
  if (!quote?.tenure) return null

  const personal = (app.personal ?? {}) as Personal
  const business = (app.business ?? null) as {
    registeredName?: string
    businessName?: string
    rcNumber?: string
  } | null
  const personName = [personal.firstName, personal.surname].filter(Boolean).join(' ')
  const isBusiness = app.applicant_type === 'business'
  const customerName = isBusiness
    ? (business?.registeredName ?? business?.businessName ?? personName)
    : personName
  const d = (row.details ?? {}) as GuaranteeDetails
  const guarantorName = [d.firstName, d.surname].filter(Boolean).join(' ') || row.name

  const [template, lateFee] = await Promise.all([currentTemplate('guarantor'), lateFeeSettings()])
  const result = quote.result as unknown as QuoteResult
  const reference = quoteReference(quote.id)
  const values = agreementValues({
    reference,
    date: new Date(),
    quote: result,
    tenure: quote.tenure,
    size: quote.system_size as unknown as SystemSize,
    customerName,
    business: isBusiness ? { rcNumber: business?.rcNumber } : null,
    signerName: guarantorName,
    signerTitle: null,
    address: d.address ?? '—',
    lateFeeDaily: lateFee.daily,
    lateFeeCap: lateFee.cap,
    lockAfterDays: lateFee.lockAfterDays,
    guarantorName,
  })
  return {
    applicantName: customerName,
    applicantPhone: personal.phone ?? null,
    applicantEmail: personal.email ?? null,
    applicantNinHash: app.nin_hash,
    consumerId: app.consumer_id,
    reference,
    quote: result,
    tenure: quote.tenure,
    values,
    template,
    text: renderTemplate(templateBody(template), values),
  }
}

/** Other guarantees by the same person (same NIN hash) that are still active. */
export async function activeGuaranteesFor(ninHash: string, exceptId: string): Promise<number> {
  const { count } = await createAdminClient()
    .from('guarantees')
    .select('id', { count: 'exact', head: true })
    .eq('nin_hash', ninHash)
    .in('status', ['in_progress', 'signed'])
    .neq('id', exceptId)
  return count ?? 0
}

export function nextGuarantorStep(
  steps: Partial<Record<GuarantorStepId, boolean>>,
): GuarantorStepId {
  return GUARANTOR_STEPS.find((s) => !steps[s]) ?? 'sign'
}
