'use server'

import { headers } from 'next/headers'
import { z } from 'zod'

import { ELIGIBILITY_MESSAGES, guarantorEligibility } from '@/lib/agreements/rules'
import {
  activeGuaranteesFor,
  guaranteeContext,
  openGuarantee,
  type GuaranteeDetails,
  type GuaranteeRow,
  type GuarantorStepId,
} from '@/lib/agreements/guarantor'
import {
  CODE_MESSAGES,
  finaliseAgreement,
  maxActiveGuarantees,
  sendSignatureCode,
  signaturePngFromDataUrl,
  verifySignatureCode,
} from '@/lib/agreements/server'
import { ninIdentityHash } from '@/lib/agreements/tokens'
import {
  INCOME_RANGES,
  canStartLiveness,
  nextAttempt,
  statusAfter,
  type KycKind,
} from '@/lib/applications/rules'
import { checkSummaries } from '@/lib/applications/server'
import { siteOrigin } from '@/lib/auth/emailVerification'
import { isNgStateId } from '@/lib/nigeria/states'
import { getKycProvider } from '@/lib/providers/kyc'
import { getMessagingProvider } from '@/lib/providers/messaging'
import { clientIp } from '@/lib/ratelimit/clientIp'
import { hitRateLimit } from '@/lib/ratelimit/hitRateLimit'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Json } from '@/lib/supabase/database.types'

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string }

const LINK_PROBLEM: Record<string, string> = {
  not_found: 'This link is not valid. Ask the customer to send you a new one.',
  expired: 'This link has expired. Ask the customer to send you a new one.',
  signed: 'You have already signed this guarantee. Thank you.',
  declined: 'You have declined this guarantee.',
}
const KYC_CALLS_PER_HOUR = 15

/** The guarantee behind a link, if it can still be used. */
async function usable(token: string): Promise<{ row: GuaranteeRow } | { error: string }> {
  const g = await openGuarantee(token)
  if (g.check !== 'ok' || !g.row) return { error: LINK_PROBLEM[g.check] ?? LINK_PROBLEM.not_found! }
  return { row: g.row }
}

async function patch(
  row: GuaranteeRow,
  fields: Partial<GuaranteeRow>,
  steps: Partial<Record<GuarantorStepId, boolean>> = {},
) {
  await createAdminClient()
    .from('guarantees')
    .update({ ...fields, steps: { ...((row.steps ?? {}) as object), ...steps } as Json })
    .eq('id', row.id)
}

async function notifyApplicant(row: GuaranteeRow, text: string, subject: string) {
  const ctx = await guaranteeContext(row)
  if (!ctx) return
  const link = `${siteOrigin(await headers())}/app/apply/sign`
  const provider = await getMessagingProvider()
  await Promise.allSettled([
    ctx.applicantPhone &&
      provider.send({
        channel: 'sms',
        to: ctx.applicantPhone,
        template: 'guarantor_update',
        payload: { text: `${text} ${link}` },
      }),
    ctx.applicantEmail &&
      provider.send({
        channel: 'email',
        to: ctx.applicantEmail,
        template: 'guarantor_update',
        payload: { subject, text: `${text} ${link}` },
      }),
  ])
}

// ------------------------------------------------------------ 1. accept or decline
export async function acceptGuarantee(token: string): Promise<Result> {
  const u = await usable(token)
  if ('error' in u) return { ok: false, error: u.error }
  await patch(u.row, { status: 'in_progress' }, { intro: true })
  return { ok: true }
}

export async function declineGuarantee(token: string, input: unknown): Promise<Result> {
  const u = await usable(token)
  if ('error' in u) return { ok: false, error: u.error }
  const p = z
    .object({ reason: z.string().trim().min(3, 'Please give a short reason').max(500) })
    .safeParse(input)
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? 'Please give a reason.' }
  await patch(u.row, { status: 'declined', decline_reason: p.data.reason })
  await notifyApplicant(
    u.row,
    `${u.row.name} has declined to be your Go4Solar guarantor. Please nominate someone else:`,
    'Your guarantor declined: please nominate someone else',
  )
  return { ok: true }
}

// ------------------------------------------------------------ 2. NIN (+ eligibility)
const ninSchema = z.object({
  firstName: z.string().trim().min(2, 'Enter your first name').max(60),
  surname: z.string().trim().min(2, 'Enter your surname').max(60),
  dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter your date of birth'),
  nin: z.string().regex(/^\d{11}$/, 'Your NIN is 11 digits'),
})

export async function verifyGuarantorNin(
  token: string,
  input: unknown,
): Promise<Result<{ status: string }>> {
  const u = await usable(token)
  if ('error' in u) return { ok: false, error: u.error }
  const p = ninSchema.safeParse(input)
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? 'Check your details.' }
  const ctx = await guaranteeContext(u.row)
  if (!ctx) return { ok: false, error: LINK_PROBLEM.not_found! }

  // Free rules first (no paid lookup): adult, not the applicant, under the per-person limit.
  const ninHash = ninIdentityHash(p.data.nin)
  const ninLast4 = p.data.nin.slice(-4)
  const eligibility = guarantorEligibility({
    dob: p.data.dob,
    ninHash,
    ninLast4,
    applicantNinHash: ctx.applicantNinHash,
    applicantNinLast4: ctx.applicantNinLast4,
    activeGuarantees: await activeGuaranteesFor(ninHash, u.row.id),
    maxActive: await maxActiveGuarantees(),
  })
  if (eligibility !== 'ok') return { ok: false, error: ELIGIBILITY_MESSAGES[eligibility] }

  const checks = await checkSummaries(u.row.id)
  const decision = nextAttempt(checks, 'nin')
  if (!decision.allowed) {
    if (decision.reason === 'passed') return { ok: true, status: 'passed' }
    await patch(u.row, {}, { nin: true })
    return { ok: true, status: decision.reason }
  }
  if (!(await hitRateLimit(`kyc:g:${u.row.id}`, KYC_CALLS_PER_HOUR, '1 hour'))) {
    return { ok: false, error: 'Too many checks in an hour. Please try again later.' }
  }
  const kyc = await getKycProvider()
  const r = await kyc.verifyNin({
    nin: p.data.nin,
    firstName: p.data.firstName,
    lastName: p.data.surname,
    dob: p.data.dob,
  })
  const status = await record(
    u.row.id,
    'nin',
    kyc.name,
    r.status,
    decision.attempt,
    r.providerRef,
    {
      nameMatch: r.nameMatch,
      dobMatch: r.dobMatch,
      last4: ninLast4,
      photoRef: r.photoRef ?? null,
    },
  )
  if (status === 'failed') {
    return {
      ok: false,
      error: `We could not confirm that NIN. Check it and try again (${3 - decision.attempt} tries left).`,
    }
  }
  const details: GuaranteeDetails = {
    ...((u.row.details ?? {}) as GuaranteeDetails),
    firstName: p.data.firstName,
    surname: p.data.surname,
    dob: p.data.dob,
  }
  await patch(
    u.row,
    { nin_hash: ninHash, nin_last4: ninLast4, details: details as Json },
    { nin: true },
  )
  return { ok: true, status }
}

async function record(
  guaranteeId: string,
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
      subject_type: 'guarantor',
      subject_id: guaranteeId,
      kind,
      provider,
      provider_ref: providerRef ?? null,
      status,
      attempt,
      result_summary: summary as Json,
    })
  return status
}

// ------------------------------------------------------------ 3. consent, 4. face check
export async function giveGuarantorConsent(token: string, input: unknown): Promise<Result> {
  const u = await usable(token)
  if ('error' in u) return { ok: false, error: u.error }
  if (!z.object({ agree: z.literal(true) }).safeParse(input).success) {
    return { ok: false, error: 'Please tick the box to continue with the face check.' }
  }
  await patch(u.row, { biometric_consent_at: new Date().toISOString() }, { consent: true })
  return { ok: true }
}

export async function startGuarantorLiveness(
  token: string,
): Promise<Result<{ sessionId: string; sessionUrl?: string; skipped?: boolean }>> {
  const u = await usable(token)
  if ('error' in u) return { ok: false, error: u.error }
  // No consent tick, no liveness check.
  if (!u.row.biometric_consent_at)
    return { ok: false, error: 'Please give consent for the face check first.' }
  const checks = await checkSummaries(u.row.id)
  const decision = nextAttempt(checks, 'liveness')
  if (!decision.allowed) {
    await patch(u.row, {}, { face: true })
    return { ok: true, sessionId: '', skipped: true }
  }
  if (!canStartLiveness(checks, true)) {
    // NIN went to manual review: a person will check; skip the paid face check for now.
    await patch(u.row, {}, { face: true })
    return { ok: true, sessionId: '', skipped: true }
  }
  if (!(await hitRateLimit(`kyc:g:${u.row.id}`, KYC_CALLS_PER_HOUR, '1 hour'))) {
    return { ok: false, error: 'Too many checks in an hour. Please try again later.' }
  }
  const kyc = await getKycProvider()
  const session = await kyc.createLivenessSession({ subjectId: u.row.id })
  return { ok: true, ...session }
}

export async function finishGuarantorLiveness(
  token: string,
  input: unknown,
): Promise<Result<{ pending?: boolean; status?: string }>> {
  const u = await usable(token)
  if ('error' in u) return { ok: false, error: u.error }
  const p = z.object({ sessionId: z.string().min(1).max(200) }).safeParse(input)
  if (!p.success) return { ok: false, error: 'Start the face check again.' }
  if (!u.row.biometric_consent_at)
    return { ok: false, error: 'Please give consent for the face check first.' }
  const checks = await checkSummaries(u.row.id)
  const decision = nextAttempt(checks, 'liveness')
  if (!decision.allowed) return { ok: true, status: decision.reason }
  const kyc = await getKycProvider()
  const r = await kyc.getLivenessResult(p.data.sessionId)
  if (r.status === 'pending') return { ok: true, pending: true }
  // Selfies are never stored by us: only the outcome and the provider reference.
  const status = await record(
    u.row.id,
    'liveness',
    kyc.name,
    r.status,
    decision.attempt,
    p.data.sessionId,
    {
      livenessPassed: r.livenessPassed,
    },
  )
  if (status === 'failed')
    return { ok: false, error: 'The face check did not pass. Please try again in good light.' }
  await patch(u.row, {}, { face: true })
  return { ok: true, status }
}

// ------------------------------------------------------------ 5. about you
const aboutSchema = z.object({
  address: z.string().trim().min(8, 'Enter your home address').max(300),
  state: z.string().refine(isNgStateId, 'Choose your state'),
  employment: z.enum(['employed', 'self_employed', 'business_owner', 'retired', 'other'], {
    error: 'Choose one',
  }),
  employer: z.string().trim().max(120).optional(),
  incomeRange: z.enum(INCOME_RANGES.map((r) => r.id) as [string, ...string[]], {
    error: 'Choose your monthly income',
  }),
})

export async function saveGuarantorAbout(token: string, input: unknown): Promise<Result> {
  const u = await usable(token)
  if ('error' in u) return { ok: false, error: u.error }
  const p = aboutSchema.safeParse(input)
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? 'Check your answers.' }
  const details = { ...((u.row.details ?? {}) as GuaranteeDetails), ...p.data }
  await patch(u.row, { details: details as Json }, { about: true })
  return { ok: true }
}

// ------------------------------------------------------------ 6. sign
function readyToSign(row: GuaranteeRow): boolean {
  const s = (row.steps ?? {}) as Partial<Record<GuarantorStepId, boolean>>
  return Boolean(s.intro && s.nin && s.consent && s.face && s.about)
}

export async function sendGuarantorSignCode(token: string): Promise<Result> {
  const u = await usable(token)
  if ('error' in u) return { ok: false, error: u.error }
  if (!readyToSign(u.row)) return { ok: false, error: 'Please finish the steps above first.' }
  return sendSignatureCode('guarantor', u.row.id, u.row.phone)
}

const signSchema = z.object({
  typedName: z.string().trim().min(3, 'Type your full name'),
  ticks: z.object({
    agreement: z.literal(true),
    liability: z.literal(true),
    bureau: z.literal(true),
    biometrics: z.literal(true),
  }),
  scrolledToEnd: z.literal(true, { error: 'Please read the guarantee to the end' }),
  signature: z.string().min(50, 'Please sign in the box'),
  code: z.string().trim().min(6).max(12),
})

export async function signGuarantee(token: string, input: unknown): Promise<Result> {
  const u = await usable(token)
  if ('error' in u) return { ok: false, error: u.error }
  if (!readyToSign(u.row)) return { ok: false, error: 'Please finish the steps above first.' }
  const p = signSchema.safeParse(input)
  if (!p.success) {
    const path = p.error.issues[0]?.path[0]
    return {
      ok: false,
      error:
        path === 'ticks'
          ? 'Please tick every box.'
          : (p.error.issues[0]?.message ?? 'Check the form.'),
    }
  }
  const png = signaturePngFromDataUrl(p.data.signature)
  if (!png) return { ok: false, error: 'Please sign in the box again.' }
  const ctx = await guaranteeContext(u.row)
  if (!ctx) return { ok: false, error: LINK_PROBLEM.not_found! }

  const h = await headers()
  const ip = clientIp(h)
  const code = await verifySignatureCode(u.row.id, p.data.code, ip)
  if (code.result !== 'ok') return { ok: false, error: CODE_MESSAGES[code.result] }

  const d = (u.row.details ?? {}) as GuaranteeDetails
  await finaliseAgreement({
    type: 'guarantor',
    template: ctx.template,
    subjectId: u.row.id,
    applicationId: u.row.application_id,
    folder: `guarantors/${u.row.id}`,
    title: 'Guarantee',
    reference: ctx.reference,
    text: ctx.text,
    signaturePng: png,
    signerName: [d.firstName, d.surname].filter(Boolean).join(' ') || u.row.name,
    signerTitle: null,
    typedName: p.data.typedName,
    otpVerifiedAt: code.at!,
    ip,
    userAgent: h.get('user-agent') ?? 'unknown',
    emailTo: u.row.email,
  })
  await patch(u.row, { status: 'signed' }, { sign: true })
  await notifyApplicant(
    u.row,
    `${u.row.name} has signed as your Go4Solar guarantor.`,
    'Your guarantor has signed',
  )
  return { ok: true }
}
