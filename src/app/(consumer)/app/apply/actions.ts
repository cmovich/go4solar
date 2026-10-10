'use server'

import { randomUUID } from 'node:crypto'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import {
  affordability,
  businessStepComplete,
  canStartLiveness,
  latestStatus,
  missingForSubmission,
  nextAttempt,
  statusAfter,
  type KycKind,
  type StepId,
} from '@/lib/applications/rules'
import {
  checkSummaries,
  documentKinds,
  type ApplicationRow,
  type BusinessDetails,
  type Personal,
} from '@/lib/applications/server'
import { getSessionInfo } from '@/lib/auth/session'
import { normalisePhoneNG } from '@/lib/money'
import { isNgStateId } from '@/lib/nigeria/states'
import type { QuoteResult } from '@/lib/pricing/types'
import { getKycProvider } from '@/lib/providers/kyc'
import { hitRateLimit } from '@/lib/ratelimit/hitRateLimit'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Json } from '@/lib/supabase/database.types'
import { BUSINESS_TYPES, type EnergyRecord } from '@/lib/waitlist/schema'

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string }

const KYC_CALLS_PER_HOUR = 15
const DOC_KINDS = [
  'nin_front',
  'nin_back',
  'cac_certificate',
  'address_proof',
  'bank_statement',
  'business_statement',
] as const
const MAX_BYTES = 10 * 1024 * 1024
const TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
}

/**
 * The signed-in consumer's own draft application. Identity steps (NIN/BVN consent, liveness,
 * face match) are only ever performed in the customer's own session: this is the one place
 * every action gets the application, and it only returns the caller's own row.
 */
async function own(): Promise<{ app: ApplicationRow; userId: string } | null> {
  const session = await getSessionInfo()
  if (!session.user) return null
  const { data } = await createAdminClient()
    .from('applications')
    .select('*')
    .eq('consumer_id', session.user.id)
    .eq('status', 'draft')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data ? { app: data, userId: session.user.id } : null
}
const NO_APP = { ok: false, error: 'Please sign in to continue your application.' } as const

async function update(
  id: string,
  patch: Partial<ApplicationRow>,
  steps?: Partial<Record<StepId, boolean>>,
  prev?: unknown,
) {
  const body: Partial<ApplicationRow> = steps
    ? { ...patch, steps: { ...((prev ?? {}) as object), ...steps } as Json }
    : patch
  const { error } = await createAdminClient().from('applications').update(body).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/app/apply')
}

async function kycAllowed(userId: string): Promise<boolean> {
  return hitRateLimit(`kyc:${userId}`, KYC_CALLS_PER_HOUR, '1 hour')
}

async function recordCheck(
  applicationId: string,
  subject: 'consumer' | 'business',
  kind: KycKind,
  provider: string,
  outcome: 'passed' | 'failed',
  attempt: number,
  providerRef: string | undefined,
  summary: Record<string, unknown>,
) {
  const status = statusAfter(outcome, attempt)
  await createAdminClient()
    .from('kyc_checks')
    .insert({
      subject_type: subject,
      subject_id: applicationId,
      kind,
      provider,
      provider_ref: providerRef ?? null,
      status,
      attempt,
      result_summary: summary as Json,
    })
  return status
}

function issue(e: z.ZodError) {
  return { ok: false as const, error: e.issues[0]?.message ?? 'Please check your answers.' }
}

function attemptsMessage(attempt: number): string {
  const left = 3 - attempt
  return left > 0
    ? `We could not confirm that. Please check and try again (${left} attempt${left === 1 ? '' : 's'} left).`
    : 'We could not confirm that automatically. A member of our team will review it — you can carry on.'
}

// --------------------------------------------------------------- 1. details
const businessEdit = z.object({
  businessName: z.string().trim().min(2).max(120),
  businessType: z.enum(BUSINESS_TYPES),
  contactRole: z.string().trim().min(2).max(60),
  staffCount: z.number().int().min(0).max(100000),
  hoursPerDay: z.number().min(0).max(24),
  daysPerWeek: z.number().int().min(1).max(7),
})
const detailsSchema = z.object({
  firstName: z.string().trim().min(2, 'Enter your first name').max(60),
  surname: z.string().trim().min(2, 'Enter your surname').max(60),
  dob: z.iso.date('Enter your date of birth').refine((d) => {
    const age = (Date.now() - new Date(d).getTime()) / (365.25 * 24 * 3600 * 1000)
    return age >= 18 && age <= 100
  }, 'You must be 18 or older'),
  state: z.string().refine(isNgStateId, 'Choose your state'),
  lga: z.string().trim().min(2, 'Enter your LGA').max(80),
  business: businessEdit.optional(),
})

export async function saveDetails(input: unknown): Promise<Result> {
  const o = await own()
  if (!o) return NO_APP
  const p = detailsSchema.safeParse(input)
  if (!p.success) return issue(p.error)
  if (o.app.applicant_type === 'business' && !p.data.business)
    return { ok: false, error: 'Add your business details.' }
  const personal: Personal = {
    ...(o.app.personal as Personal),
    ...p.data,
    business: undefined,
  } as Personal
  delete (personal as Record<string, unknown>).business
  await update(
    o.app.id,
    {
      personal: personal as Json,
      ...(p.data.business
        ? { business: { ...((o.app.business ?? {}) as object), ...p.data.business } as Json }
        : {}),
    },
    { details: true },
    o.app.steps,
  )
  return { ok: true }
}

// ---------------------------------------------------------- documents
export async function uploadDocument(form: FormData): Promise<Result> {
  const o = await own()
  if (!o) return NO_APP
  const kind = String(form.get('kind') ?? '')
  const file = form.get('file')
  if (!(DOC_KINDS as readonly string[]).includes(kind))
    return { ok: false, error: 'Unknown document type.' }
  if (!(file instanceof Blob) || file.size === 0) return { ok: false, error: 'Choose a file.' }
  if (file.size > MAX_BYTES) return { ok: false, error: 'Files must be under 10 MB.' }
  const ext = TYPES[file.type]
  if (!ext) return { ok: false, error: 'Use a photo (JPEG, PNG, WebP) or a PDF.' }

  const path = `${o.userId}/${o.app.id}/${kind}-${randomUUID()}.${ext}`
  const admin = createAdminClient()
  const { error } = await admin.storage
    .from('kyc')
    .upload(path, file, { contentType: file.type, upsert: false })
  if (error) return { ok: false, error: 'Upload failed. Please try again.' }
  await admin
    .from('documents')
    .insert({ owner_id: o.userId, application_id: o.app.id, kind, storage_path: path })
  revalidatePath('/app/apply')
  return { ok: true }
}

// ---------------------------------------------------- 2. business (CAC)
const cacSchema = z.object({
  rcNumber: z
    .string()
    .trim()
    .regex(/^(RC|BN|IT)?\s?\d{5,8}$/i, 'Enter the CAC number, e.g. RC123456'),
  directorConfirmed: z.literal(true, {
    error: 'Tick to confirm you are a director or authorised signatory',
  }),
})

export async function verifyBusiness(input: unknown): Promise<Result<{ status: string }>> {
  const o = await own()
  if (!o) return NO_APP
  if (o.app.applicant_type !== 'business')
    return { ok: false, error: 'Not a business application.' }
  const p = cacSchema.safeParse(input)
  if (!p.success) return issue(p.error)
  const business = (o.app.business ?? {}) as BusinessDetails
  const docs = await documentKinds(o.app.id)
  // Free checks first: certificate uploaded and business name known before any paid lookup.
  if (!docs.includes('cac_certificate'))
    return { ok: false, error: 'Upload your CAC certificate first.' }
  if (!business.businessName)
    return { ok: false, error: 'Add your business name in "Confirm your details".' }

  const checks = await checkSummaries(o.app.id)
  const decision = nextAttempt(checks, 'cac')
  let status = latestStatus(checks, 'cac') ?? 'pending'
  if (decision.allowed) {
    if (!(await kycAllowed(o.userId)))
      return { ok: false, error: 'Too many checks in an hour. Please try again later.' }
    const kyc = await getKycProvider()
    const r = await kyc.verifyCac({
      rcNumber: p.data.rcNumber,
      businessName: business.businessName,
    })
    status = await recordCheck(
      o.app.id,
      'business',
      'cac',
      kyc.name,
      r.status,
      decision.attempt,
      r.providerRef,
      {
        nameMatch: r.nameMatch,
        registeredName: r.registeredName ?? null,
        directors: r.directors ?? [],
      },
    )
    business.registeredName = r.registeredName
    if (status === 'failed') {
      await update(o.app.id, {
        business: { ...business, rcNumber: p.data.rcNumber.toUpperCase() } as Json,
      })
      return { ok: false, error: attemptsMessage(decision.attempt) }
    }
  }
  const nextBusiness = {
    ...business,
    rcNumber: p.data.rcNumber.toUpperCase(),
    directorConfirmed: true,
  }
  const complete = businessStepComplete({
    cacStatus: status as never,
    certificateUploaded: true,
    directorConfirmed: true,
  })
  await update(o.app.id, { business: nextBusiness as Json }, { business: complete }, o.app.steps)
  return { ok: true, status }
}

// ------------------------------------------------------------ 3. NIN
const ninSchema = z.object({ nin: z.string().regex(/^\d{11}$/, 'Your NIN is 11 digits') })

export async function verifyNin(input: unknown): Promise<Result<{ status: string }>> {
  const o = await own()
  if (!o) return NO_APP
  const p = ninSchema.safeParse(input)
  if (!p.success) return issue(p.error)
  const personal = o.app.personal as Personal
  // Free checks before the paid lookup: details confirmed, DOB known, slip photo uploaded.
  if (!personal.firstName || !personal.surname || !personal.dob)
    return { ok: false, error: 'Confirm your details first.' }
  if (!(await documentKinds(o.app.id)).includes('nin_front')) {
    return { ok: false, error: 'Upload a photo of the front of your NIN slip or card first.' }
  }
  const checks = await checkSummaries(o.app.id)
  const decision = nextAttempt(checks, 'nin')
  if (!decision.allowed) {
    await update(o.app.id, {}, { nin: true }, o.app.steps)
    return { ok: true, status: decision.reason }
  }
  if (!(await kycAllowed(o.userId)))
    return { ok: false, error: 'Too many checks in an hour. Please try again later.' }
  const kyc = await getKycProvider()
  const r = await kyc.verifyNin({
    nin: p.data.nin,
    firstName: personal.firstName,
    lastName: personal.surname,
    dob: personal.dob,
  })
  const status = await recordCheck(
    o.app.id,
    'consumer',
    'nin',
    kyc.name,
    r.status,
    decision.attempt,
    r.providerRef,
    {
      nameMatch: r.nameMatch,
      dobMatch: r.dobMatch,
      last4: p.data.nin.slice(-4),
      photoRef: r.photoRef ?? null,
    },
  )
  if (status === 'failed') return { ok: false, error: attemptsMessage(decision.attempt) }
  await update(
    o.app.id,
    { personal: { ...personal, ninLast4: p.data.nin.slice(-4) } as Json },
    { nin: true },
    o.app.steps,
  )
  return { ok: true, status }
}

// ------------------------------------------------------------ 4. BVN
const bvnSchema = z.object({ bvn: z.string().regex(/^\d{11}$/, 'Your BVN is 11 digits') })

export async function verifyBvn(input: unknown): Promise<Result<{ status: string }>> {
  const o = await own()
  if (!o) return NO_APP
  const p = bvnSchema.safeParse(input)
  if (!p.success) return issue(p.error)
  const personal = o.app.personal as Personal
  if (!personal.firstName || !personal.surname || !personal.dob)
    return { ok: false, error: 'Confirm your details first.' }
  const checks = await checkSummaries(o.app.id)
  const decision = nextAttempt(checks, 'bvn')
  if (!decision.allowed) {
    await update(o.app.id, {}, { bvn: true }, o.app.steps)
    return { ok: true, status: decision.reason }
  }
  if (!(await kycAllowed(o.userId)))
    return { ok: false, error: 'Too many checks in an hour. Please try again later.' }
  const kyc = await getKycProvider()
  const r = await kyc.verifyBvn({
    bvn: p.data.bvn,
    firstName: personal.firstName,
    lastName: personal.surname,
    dob: personal.dob,
  })
  const status = await recordCheck(
    o.app.id,
    'consumer',
    'bvn',
    kyc.name,
    r.status,
    decision.attempt,
    r.providerRef,
    {
      nameMatch: r.nameMatch,
      dobMatch: r.dobMatch,
      last4: p.data.bvn.slice(-4),
    },
  )
  if (status === 'failed') return { ok: false, error: attemptsMessage(decision.attempt) }
  await update(
    o.app.id,
    { personal: { ...personal, bvnLast4: p.data.bvn.slice(-4) } as Json },
    { bvn: true },
    o.app.steps,
  )
  return { ok: true, status }
}

// ------------------------------------------------- 5. biometric consent
export async function giveBiometricConsent(input: unknown): Promise<Result> {
  const o = await own()
  if (!o) return NO_APP
  if (!z.object({ agree: z.literal(true) }).safeParse(input).success) {
    return { ok: false, error: 'Please tick the box to continue with the face check.' }
  }
  await update(
    o.app.id,
    { biometric_consent_at: new Date().toISOString() },
    { consent: true },
    o.app.steps,
  )
  return { ok: true }
}

// -------------------------------------------------------- 6. face check
export async function startLiveness(): Promise<
  Result<{ sessionId: string; sessionUrl?: string; sdkToken?: string; skipped?: boolean }>
> {
  const o = await own()
  if (!o) return NO_APP
  const checks = await checkSummaries(o.app.id)
  const consent = Boolean(o.app.biometric_consent_at)
  if (!consent) return { ok: false, error: 'Please give consent for the face check first.' }
  if (latestStatus(checks, 'nin') === 'manual_review') {
    // The NIN is with a person: skip the paid liveness for now and flag it.
    await update(
      o.app.id,
      {
        credit_flags: { ...((o.app.credit_flags ?? {}) as object), livenessDeferred: true } as Json,
      },
      { face: true },
      o.app.steps,
    )
    return { ok: true, sessionId: '', skipped: true }
  }
  if (!canStartLiveness(checks, consent))
    return { ok: false, error: 'Your NIN must be confirmed before the face check.' }
  const decision = nextAttempt(checks, 'liveness')
  if (!decision.allowed) {
    await update(o.app.id, {}, { face: true }, o.app.steps)
    return { ok: true, sessionId: '', skipped: true }
  }
  if (!(await kycAllowed(o.userId)))
    return { ok: false, error: 'Too many checks in an hour. Please try again later.' }
  const ninRow = await createAdminClient()
    .from('kyc_checks')
    .select('result_summary')
    .eq('subject_id', o.app.id)
    .eq('kind', 'nin')
    .eq('status', 'passed')
    .limit(1)
    .maybeSingle()
  const photoRef =
    (ninRow.data?.result_summary as { photoRef?: string } | null)?.photoRef ?? undefined
  const kyc = await getKycProvider()
  const session = await kyc.createLivenessSession({ subjectId: o.app.id, ninPhotoRef: photoRef })
  return { ok: true, ...session }
}

export async function finishLiveness(
  input: unknown,
): Promise<Result<{ pending?: boolean; status?: string }>> {
  const o = await own()
  if (!o) return NO_APP
  const p = z.object({ sessionId: z.string().min(1).max(200) }).safeParse(input)
  if (!p.success) return { ok: false, error: 'Start the face check again.' }
  const checks = await checkSummaries(o.app.id)
  if (!canStartLiveness(checks, Boolean(o.app.biometric_consent_at))) {
    return { ok: false, error: 'Your NIN must be confirmed before the face check.' }
  }
  const decision = nextAttempt(checks, 'liveness')
  if (!decision.allowed) return { ok: true, status: decision.reason }
  const kyc = await getKycProvider()
  const r = await kyc.getLivenessResult(p.data.sessionId)
  if (r.status === 'pending') return { ok: true, pending: true }
  // Selfies are never stored by us: only the outcome and the provider reference.
  const status = await recordCheck(
    o.app.id,
    'consumer',
    'liveness',
    kyc.name,
    r.status,
    decision.attempt,
    p.data.sessionId,
    {
      livenessPassed: r.livenessPassed,
    },
  )
  await recordCheck(
    o.app.id,
    'consumer',
    'face_match',
    kyc.name,
    (r.faceMatchScore ?? 0) >= 0.8 ? 'passed' : 'failed',
    decision.attempt,
    p.data.sessionId,
    { score: r.faceMatchScore },
  )
  if (status === 'failed') return { ok: false, error: attemptsMessage(decision.attempt) }
  await update(o.app.id, {}, { face: true }, o.app.steps)
  return { ok: true, status }
}

// ---------------------------------------------------- 7. address and site
const addressSchema = z.object({
  line1: z.string().trim().min(4, 'Enter the street address').max(160),
  city: z.string().trim().min(2, 'Enter the town or city').max(80),
  state: z.string().refine(isNgStateId, 'Choose the state'),
  lga: z.string().trim().min(2, 'Enter the LGA').max(80),
  lat: z.number().min(4).max(14).nullable(),
  lng: z.number().min(2.5).max(15).nullable(),
})

export async function saveAddress(input: unknown): Promise<Result> {
  const o = await own()
  if (!o) return NO_APP
  const p = addressSchema.safeParse(input)
  if (!p.success) return issue(p.error)
  if (!(await documentKinds(o.app.id)).includes('address_proof')) {
    return {
      ok: false,
      error:
        o.app.applicant_type === 'business'
          ? 'Upload proof of the business address (utility bill or tenancy) first.'
          : 'Upload a utility bill or tenancy agreement first.',
    }
  }
  const { lat, lng, ...address } = p.data
  await update(
    o.app.id,
    {
      install_address: address as Json,
      map_pin: lat !== null && lng !== null ? `(${lng},${lat})` : null,
    },
    { address: true },
    o.app.steps,
  )
  return { ok: true }
}

// ------------------------------------------------------------ 8. income
const incomeSchema = z.object({
  incomeRange: z.enum(['below_100k', '100k_250k', '250k_500k', '500k_1m', '1m_3m', 'above_3m'], {
    error: 'Choose your monthly income range',
  }),
  employmentStatus: z
    .enum(['employed', 'self_employed', 'business_owner', 'retired', 'other'])
    .optional(),
  employer: z.string().trim().max(120).optional(),
  jobTitle: z.string().trim().max(80).optional(),
})

async function computeAffordability(app: ApplicationRow, incomeRange: string | null) {
  if (!app.quote_id) return null
  const { data: quote } = await createAdminClient()
    .from('quotes')
    .select('result, energy')
    .eq('id', app.quote_id)
    .maybeSingle()
  const result = quote?.result as QuoteResult | undefined
  if (!result?.monthly) return null
  const spend = ((quote?.energy ?? null) as EnergyRecord | null)?.current?.monthlySpend ?? null
  return affordability({ monthlyPayment: result.monthly, incomeRange, monthlyEnergySpend: spend })
}

export async function saveIncome(input: unknown): Promise<Result> {
  const o = await own()
  if (!o) return NO_APP
  const p = incomeSchema.safeParse(input)
  if (!p.success) return issue(p.error)
  const business = o.app.applicant_type === 'business'
  if (business && !(await documentKinds(o.app.id)).includes('business_statement')) {
    return { ok: false, error: 'Upload 6 months of business bank statements (PDF) first.' }
  }
  if (!business && !p.data.employmentStatus)
    return { ok: false, error: 'Tell us how you earn your income.' }
  const aff = await computeAffordability(o.app, p.data.incomeRange)
  await update(
    o.app.id,
    {
      income_range: p.data.incomeRange,
      employment: business
        ? null
        : ({
            status: p.data.employmentStatus,
            employer: p.data.employer,
            jobTitle: p.data.jobTitle,
          } as Json),
      affordability: aff as Json,
      credit_flags: {
        ...((o.app.credit_flags ?? {}) as object),
        incomeRatioAbove35: aff?.incomeFlag ?? false,
      } as Json,
    },
    { income: true },
    o.app.steps,
  )
  return { ok: true }
}

// ----------------------------------------------------- 9. next of kin / guarantor
const personSchema = z.object({
  name: z.string().trim().min(3, 'Enter their full name').max(120),
  phone: z
    .string()
    .trim()
    .transform((v, ctx) => {
      try {
        return normalisePhoneNG(v)
      } catch {
        ctx.addIssue({ code: 'custom', message: 'Enter a Nigerian mobile number' })
        return z.NEVER
      }
    }),
  relationship: z.string().trim().min(2, 'How are they related to you?').max(60),
})

export async function saveNextOfKin(input: unknown): Promise<Result> {
  const o = await own()
  if (!o) return NO_APP
  const p = personSchema.safeParse(input)
  if (!p.success) return issue(p.error)
  await update(o.app.id, { next_of_kin: p.data as Json }, { nextOfKin: true }, o.app.steps)
  return { ok: true }
}

export async function saveGuarantor(input: unknown): Promise<Result> {
  const o = await own()
  if (!o) return NO_APP
  const p = personSchema.extend({ email: z.email('Enter their email address') }).safeParse(input)
  if (!p.success) return issue(p.error)
  if (p.data.phone === (o.app.personal as Personal).phone) {
    return { ok: false, error: 'Your guarantor must be someone other than you.' }
  }
  await update(o.app.id, { guarantor: p.data as Json }, { guarantor: true }, o.app.steps)
  return { ok: true }
}

// ------------------------------------------------------------- 10. review
export async function finishReview(): Promise<Result<{ missing: string[] }>> {
  const o = await own()
  if (!o) return NO_APP
  const [checks, documents] = await Promise.all([checkSummaries(o.app.id), documentKinds(o.app.id)])
  const missing = missingForSubmission({
    applicantType: o.app.applicant_type as 'individual' | 'business',
    steps: (o.app.steps ?? {}) as Partial<Record<StepId, boolean>>,
    checks,
    documents,
    directorConfirmed: Boolean((o.app.business as BusinessDetails | null)?.directorConfirmed),
    biometricConsent: Boolean(o.app.biometric_consent_at),
  })
  if (missing.length) return { ok: false, error: 'Some steps are not finished yet.' }
  const aff = await computeAffordability(o.app, o.app.income_range)
  const manual = checks.filter((c) => c.status === 'manual_review').map((c) => c.kind)
  await update(
    o.app.id,
    {
      affordability: aff as Json,
      credit_flags: {
        ...((o.app.credit_flags ?? {}) as object),
        incomeRatioAbove35: aff?.incomeFlag ?? false,
        kycManualReview: [...new Set(manual)],
      } as Json,
    },
    { review: true },
    o.app.steps,
  )
  return { ok: true, missing: [] }
}
