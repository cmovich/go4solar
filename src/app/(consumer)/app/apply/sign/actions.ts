'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { loadConsumerSignContext } from '@/lib/agreements/consumer'
import {
  CODE_MESSAGES,
  finaliseAgreement,
  inviteGuarantor,
  sendSignatureCode,
  signaturePngFromDataUrl,
  verifySignatureCode,
} from '@/lib/agreements/server'
import { SIGN_FAILED, logSignFailure } from '@/lib/agreements/signFailure'
import { guarantorRelationshipSchema } from '@/lib/applications/relationships'
import { siteOrigin } from '@/lib/auth/emailVerification'
import { recordConsents } from '@/lib/consent/server'
import { tickConsents } from '@/lib/consent/texts'
import { getSessionInfo } from '@/lib/auth/session'
import { formatNaira, normalisePhoneNG } from '@/lib/money'
import { clientIp } from '@/lib/ratelimit/clientIp'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Json } from '@/lib/supabase/database.types'

type Result = { ok: true } | { ok: false; error: string; needsEmail?: boolean }

const VERIFY_EMAIL = { ok: false, error: 'Verify your email to sign.', needsEmail: true } as const
const NOT_READY = { ok: false, error: 'Finish your application first.' } as const

/** Signing requires a signed-in consumer with a verified email (requireVerifiedEmail rule). */
async function signer() {
  const session = await getSessionInfo()
  if (!session.user) return { error: { ok: false, error: 'Please sign in.' } as Result }
  if (!session.emailVerified) return { error: VERIFY_EMAIL as Result }
  return { userId: session.user.id }
}

export async function sendConsumerSignCode(): Promise<Result> {
  const s = await signer()
  if ('error' in s) return s.error!
  const ctx = await loadConsumerSignContext(s.userId)
  if (!ctx) return NOT_READY
  if (ctx.signed) return { ok: false, error: 'You have already signed.' }
  return sendSignatureCode('consumer', ctx.applicationId, ctx.phone)
}

const signSchema = z.object({
  typedName: z.string().trim().min(3, 'Type your full name'),
  signerTitle: z.string().trim().max(80).optional(),
  ticks: z.object({
    agreement: z.literal(true),
    collateral: z.literal(true),
    lock: z.literal(true),
    bureau: z.literal(true),
    biometrics: z.literal(true),
  }),
  scrolledToEnd: z.literal(true, { error: 'Please read the agreement to the end' }),
  signature: z.string().min(50, 'Please sign in the box'),
  code: z.string().trim().min(6).max(12),
})

export async function signConsumerAgreement(input: unknown): Promise<Result> {
  const s = await signer()
  if ('error' in s) return s.error!
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
  const ctx = await loadConsumerSignContext(s.userId, p.data.signerTitle ?? undefined)
  if (!ctx) return NOT_READY
  if (ctx.signed) return { ok: false, error: 'You have already signed.' }
  const png = signaturePngFromDataUrl(p.data.signature)
  if (!png) return { ok: false, error: 'Please sign in the box again.' }

  const h = await headers()
  const ip = clientIp(h)
  const code = await verifySignatureCode(ctx.applicationId, p.data.code, ip)
  if (code.result !== 'ok') return { ok: false, error: CODE_MESSAGES[code.result] }

  try {
    await finaliseAgreement({
      type: 'consumer',
      template: ctx.template,
      subjectId: s.userId,
      applicationId: ctx.applicationId,
      folder: `${s.userId}/${ctx.applicationId}`,
      title: 'Solar payment plan agreement',
      reference: ctx.reference,
      text: ctx.text,
      signaturePng: png,
      signerName: ctx.signerName,
      signerTitle: ctx.isBusiness ? p.data.signerTitle || ctx.defaultTitle : null,
      typedName: p.data.typedName,
      otpVerifiedAt: code.at!,
      ip,
      userAgent: h.get('user-agent') ?? 'unknown',
      emailTo: ctx.email,
    })
  } catch (err) {
    logSignFailure('consumer', err)
    return { ok: false, error: SIGN_FAILED }
  }

  await recordConsents(
    tickConsents('consumer', ctx.lateFee.lockAfterDays).map((c) => ({
      subjectType: 'profile' as const,
      subjectId: s.userId,
      profileId: s.userId,
      ip,
      consent: { kind: c.kind, text_version: c.text_version, text_sha256: c.text_sha256 },
    })),
  )

  const admin = createAdminClient()
  const { data: app } = await admin
    .from('applications')
    .select('steps')
    .eq('id', ctx.applicationId)
    .single()
  await admin
    .from('applications')
    .update({ steps: { ...((app?.steps ?? {}) as object), terms: true } as Json })
    .eq('id', ctx.applicationId)
  revalidatePath('/app/apply/sign')
  return { ok: true }
}

// ------------------------------------------------------------ guarantor
export async function resendGuarantorInvite(): Promise<Result> {
  const session = await getSessionInfo()
  if (!session.user) return { ok: false, error: 'Please sign in.' }
  const ctx = await loadConsumerSignContext(session.user.id)
  if (!ctx?.guarantee) return NOT_READY
  if (ctx.guarantee.status === 'signed' || ctx.guarantee.status === 'declined') {
    return { ok: false, error: 'This guarantee is already finished.' }
  }
  await inviteGuarantor({
    applicationId: ctx.applicationId,
    contact: {
      name: ctx.guarantee.name,
      phone: ctx.guarantee.phone,
      email: ctx.guarantee.email,
      relationship: ctx.guarantee.relationship ?? '',
    },
    applicantName: ctx.signerName,
    monthly: formatNaira(ctx.quote.monthly),
    tenure: ctx.tenure,
    origin: siteOrigin(await headers()),
    existingId: ctx.guarantee.id,
  })
  revalidatePath('/app/apply/sign')
  return { ok: true }
}

const contactSchema = z.object({
  name: z.string().trim().min(3).max(120),
  phone: z.string().trim(),
  email: z.email('Enter their email address'),
})

/** After a decline (or an expired link) the consumer nominates someone else. */
export async function nominateGuarantor(input: unknown): Promise<Result> {
  const session = await getSessionInfo()
  if (!session.user) return { ok: false, error: 'Please sign in.' }
  const p = contactSchema.safeParse(input)
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? 'Check the details.' }
  const rel = guarantorRelationshipSchema.safeParse(input)
  if (!rel.success)
    return { ok: false, error: rel.error.issues[0]?.message ?? 'Check the details.' }
  let phone: string
  try {
    phone = normalisePhoneNG(p.data.phone)
  } catch {
    return { ok: false, error: 'Enter a Nigerian mobile number.' }
  }
  const ctx = await loadConsumerSignContext(session.user.id)
  if (!ctx) return NOT_READY
  if (phone === ctx.phone)
    return { ok: false, error: 'Your guarantor must be someone other than you.' }
  if (ctx.guarantee?.status === 'signed')
    return { ok: false, error: 'Your guarantor has already signed.' }
  const contact = { ...p.data, phone, relationship: rel.data }
  await createAdminClient()
    .from('applications')
    .update({ guarantor: contact as Json })
    .eq('id', ctx.applicationId)
  await inviteGuarantor({
    applicationId: ctx.applicationId,
    contact,
    applicantName: ctx.signerName,
    monthly: formatNaira(ctx.quote.monthly),
    tenure: ctx.tenure,
    origin: siteOrigin(await headers()),
  })
  revalidatePath('/app/apply/sign')
  return { ok: true }
}
