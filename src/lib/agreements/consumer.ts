import 'server-only'

import type { BusinessDetails, Personal } from '@/lib/applications/server'
import type { QuoteResult } from '@/lib/pricing/types'
import { quoteReference } from '@/lib/quotes/quote'
import type { SystemSize } from '@/lib/sizing/types'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Database } from '@/lib/supabase/database.types'

import { agreementValues, renderTemplate, templateBody, type AgreementValues } from './render'
import { currentTemplate, lateFeeSettings, type TemplateRow } from './server'

type Guarantee = Database['public']['Tables']['guarantees']['Row']
type Agreement = Database['public']['Tables']['agreements']['Row']

export type ConsumerSignContext = {
  applicationId: string
  userId: string
  isBusiness: boolean
  customerName: string
  signerName: string
  defaultTitle: string | null
  phone: string
  email: string | null
  reference: string
  quote: QuoteResult
  tenure: number
  values: AgreementValues
  template: TemplateRow
  text: string
  lateFee: { daily: number; cap: number; lockAfterDays: number }
  guarantee: Pick<
    Guarantee,
    'id' | 'name' | 'phone' | 'email' | 'relationship' | 'status' | 'expires_at' | 'decline_reason'
  > | null
  signed: Pick<Agreement, 'id' | 'signed_at' | 'pdf_sha256' | 'content_sha256'> | null
}

/**
 * Everything the Terms step needs for the signed-in consumer, built from the STORED quote
 * (its snapshot) — never from today's prices. Null until the application review is finished.
 */
export async function loadConsumerSignContext(
  userId: string,
  signerTitle?: string | null,
): Promise<ConsumerSignContext | null> {
  const admin = createAdminClient()
  const { data: app } = await admin
    .from('applications')
    .select('*')
    .eq('consumer_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const steps = (app?.steps ?? {}) as Record<string, boolean>
  if (!app || !steps.review || !app.quote_id) return null

  const { data: quote } = await admin
    .from('quotes')
    .select('id, tenure, result, system_size')
    .eq('id', app.quote_id)
    .single()
  if (!quote?.tenure) return null

  const personal = (app.personal ?? {}) as Personal
  const business = (app.business ?? null) as BusinessDetails | null
  const isBusiness = app.applicant_type === 'business'
  const personName = [personal.firstName, personal.surname].filter(Boolean).join(' ')
  const customerName = isBusiness
    ? (business?.registeredName ?? business?.businessName ?? personName)
    : personName
  const defaultTitle = isBusiness
    ? business?.contactRole
      ? `${business.contactRole} (director / authorised signatory)`
      : 'Director / authorised signatory'
    : null
  const addr = (app.install_address ?? {}) as Record<string, string>
  const address = [addr.line1, addr.city, addr.lga, addr.state].filter(Boolean).join(', ')

  const [template, lateFee, guaranteeRes, signedRes] = await Promise.all([
    currentTemplate('consumer'),
    lateFeeSettings(),
    admin
      .from('guarantees')
      .select('id, name, phone, email, relationship, status, expires_at, decline_reason')
      .eq('application_id', app.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from('agreements')
      .select('id, signed_at, pdf_sha256, content_sha256')
      .eq('application_id', app.id)
      .eq('type', 'consumer')
      .order('signed_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const result = quote.result as unknown as QuoteResult
  const reference = quoteReference(quote.id)
  const title = signerTitle === undefined ? defaultTitle : signerTitle
  const values = agreementValues({
    reference,
    date: new Date(),
    quote: result,
    tenure: quote.tenure,
    size: quote.system_size as unknown as SystemSize,
    customerName,
    business: isBusiness ? { rcNumber: business?.rcNumber } : null,
    signerName: personName,
    signerTitle: isBusiness ? title : null,
    address: address || '—',
    lateFeeDaily: lateFee.daily,
    lateFeeCap: lateFee.cap,
    lockAfterDays: lateFee.lockAfterDays,
  })

  return {
    applicationId: app.id,
    userId,
    isBusiness,
    customerName,
    signerName: personName,
    defaultTitle,
    phone: personal.phone ?? '',
    email: personal.email ?? null,
    reference,
    quote: result,
    tenure: quote.tenure,
    values,
    template,
    text: renderTemplate(templateBody(template), values),
    lateFee,
    guarantee: guaranteeRes.data ?? null,
    signed: signedRes.data ?? null,
  }
}
