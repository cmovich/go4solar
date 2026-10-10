import 'server-only'

import { isStaffRole } from '@/lib/auth/staffRoles'
import { getSessionInfo } from '@/lib/auth/session'
import type { QuoteResult } from '@/lib/pricing/types'
import { quoteReference } from '@/lib/quotes/quote'
import type { Plan } from '@/lib/sizing/types'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Database } from '@/lib/supabase/database.types'
import type { BusinessInput, EnergyRecord } from '@/lib/waitlist/schema'

import {
  latestStatus,
  missingForSubmission,
  nextAttempt,
  nextStep,
  type ApplicantType,
  type CheckSummary,
  type KycKind,
  type StepId,
} from './rules'

export type ApplicationRow = Database['public']['Tables']['applications']['Row']

export type Personal = {
  firstName?: string
  surname?: string
  phone?: string
  email?: string
  state?: string
  lga?: string
  dob?: string
  ninLast4?: string
  bvnLast4?: string
}
export type BusinessDetails = Partial<BusinessInput> & {
  rcNumber?: string
  registeredName?: string
  directorConfirmed?: boolean
}

/** Everything the wizard needs, safe to send to the browser (no raw IDs, no file URLs). */
export type WizardState = {
  applicationId: string
  applicantType: ApplicantType
  steps: Partial<Record<StepId, boolean>>
  current: StepId
  personal: Personal
  business: BusinessDetails | null
  employment: Record<string, unknown> | null
  nextOfKin: Record<string, unknown> | null
  guarantor: Record<string, unknown> | null
  installAddress: Record<string, unknown> | null
  incomeRange: string | null
  consentGiven: boolean
  checks: Partial<Record<KycKind, { status: string; attemptsLeft: number }>>
  documents: string[]
  energy: { monthlySpend: number | null; generator: string | null } | null
  quote: {
    reference: string
    plan: Plan
    tenure: number | null
    monthly: number
    deposit: number
    systemPrice: number
  } | null
  affordability: Record<string, unknown> | null
  missing: string[]
}

const KINDS: KycKind[] = ['nin', 'bvn', 'cac', 'liveness']

/** The signed-in consumer's application, created from their chosen quote (prefilled) if needed. */
export async function ensureApplication(userId: string): Promise<ApplicationRow | null> {
  const admin = createAdminClient()
  const { data: existing } = await admin
    .from('applications')
    .select('*')
    .eq('consumer_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (existing) return existing

  const { data: quote } = await admin
    .from('quotes')
    .select('id, waitlist_id, applicant_type, state')
    .eq('owner_id', userId)
    .eq('status', 'chosen')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!quote) return null

  const { data: lead } = quote.waitlist_id
    ? await admin
        .from('waitlist_consumers')
        .select('first_name, surname, phone_e164, email, state, lga, applicant_type, business')
        .eq('id', quote.waitlist_id)
        .maybeSingle()
    : { data: null }

  const type: ApplicantType =
    (lead?.applicant_type ?? quote.applicant_type) === 'business' ? 'business' : 'individual'
  const personal: Personal = {
    firstName: lead?.first_name ?? undefined,
    surname: lead?.surname ?? undefined,
    phone: lead?.phone_e164 ?? undefined,
    email: lead?.email ?? undefined,
    state: lead?.state ?? quote.state,
    lga: lead?.lga ?? undefined,
  }
  const { data: created, error } = await admin
    .from('applications')
    .insert({
      consumer_id: userId,
      quote_id: quote.id,
      applicant_type: type,
      personal,
      business: type === 'business' ? ((lead?.business as BusinessDetails | null) ?? {}) : null,
    })
    .select('*')
    .single()
  if (error) throw new Error(`could not create application: ${error.message}`)
  return created
}

export async function checkSummaries(applicationId: string): Promise<CheckSummary[]> {
  const { data } = await createAdminClient()
    .from('kyc_checks')
    .select('kind, status, attempt')
    .eq('subject_id', applicationId)
    .order('created_at', { ascending: true })
  return (data ?? []) as CheckSummary[]
}

export async function documentKinds(applicationId: string): Promise<string[]> {
  const { data } = await createAdminClient()
    .from('documents')
    .select('kind')
    .eq('application_id', applicationId)
  return [...new Set((data ?? []).map((d) => d.kind))]
}

export async function wizardState(app: ApplicationRow): Promise<WizardState> {
  const admin = createAdminClient()
  const [checks, documents, quoteRes] = await Promise.all([
    checkSummaries(app.id),
    documentKinds(app.id),
    app.quote_id
      ? admin
          .from('quotes')
          .select('id, plan, tenure, result, energy')
          .eq('id', app.quote_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ])
  const quote = quoteRes.data
  const result = (quote?.result ?? null) as QuoteResult | null
  const energy = (quote?.energy ?? null) as EnergyRecord | null
  const type = app.applicant_type as ApplicantType
  const steps = (app.steps ?? {}) as Partial<Record<StepId, boolean>>
  const business = (app.business ?? null) as BusinessDetails | null

  const checkView: WizardState['checks'] = {}
  for (const k of KINDS) {
    const status = latestStatus(checks, k)
    if (!status) continue
    const decision = nextAttempt(checks, k)
    const used = checks.filter((c) => c.kind === k).length
    checkView[k] = { status, attemptsLeft: decision.allowed ? Math.max(0, 3 - used) : 0 }
  }

  return {
    applicationId: app.id,
    applicantType: type,
    steps,
    current: nextStep(type, steps),
    personal: (app.personal ?? {}) as Personal,
    business,
    employment: (app.employment ?? null) as Record<string, unknown> | null,
    nextOfKin: (app.next_of_kin ?? null) as Record<string, unknown> | null,
    guarantor: (app.guarantor ?? null) as Record<string, unknown> | null,
    installAddress: (app.install_address ?? null) as Record<string, unknown> | null,
    incomeRange: app.income_range,
    consentGiven: Boolean(app.biometric_consent_at),
    checks: checkView,
    documents,
    energy: energy
      ? { monthlySpend: energy.current?.monthlySpend ?? null, generator: energy.generator }
      : null,
    quote:
      quote && result
        ? {
            reference: quoteReference(quote.id),
            plan: quote.plan as Plan,
            tenure: quote.tenure,
            monthly: result.monthly,
            deposit: result.deposit,
            systemPrice: result.systemPrice,
          }
        : null,
    affordability: (app.affordability ?? null) as Record<string, unknown> | null,
    missing: missingForSubmission({
      applicantType: type,
      steps,
      checks,
      documents,
      directorConfirmed: Boolean(business?.directorConfirmed),
      biometricConsent: Boolean(app.biometric_consent_at),
    }),
  }
}

/**
 * A 10-minute signed URL for a KYC file — staff only (consumers never get file URLs back).
 * Used by the applications queue (Prompt 13).
 */
export async function staffSignedUrl(storagePath: string): Promise<string | null> {
  const session = await getSessionInfo()
  if (!session.user || !isStaffRole(session.role) || session.aal !== 'aal2') return null
  const { data } = await createAdminClient().storage.from('kyc').createSignedUrl(storagePath, 600)
  return data?.signedUrl ?? null
}
