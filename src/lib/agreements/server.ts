import 'server-only'

import { randomUUID } from 'node:crypto'

import { z } from 'zod'

import { OTP_TTL_MS, checkOtp, generateOtpCode, hashOtp, type OtpCheck } from '@/lib/otp/otp'
import { getMessagingProvider } from '@/lib/providers/messaging'
import { hitRateLimit } from '@/lib/ratelimit/hitRateLimit'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Database } from '@/lib/supabase/database.types'

import { renderAgreementPdf, type AuditRow } from '@/lib/pdf/AgreementPdf'

import { contentFingerprint, sha256Hex } from './render'
import { GUARANTEE_TTL_MS, newGuaranteeToken } from './tokens'

export type TemplateRow = Database['public']['Tables']['agreement_templates']['Row']
export type AgreementType = Database['public']['Enums']['agreement_type']

/** The approved template with the highest version, else the newest draft (which says DRAFT). */
export async function currentTemplate(type: AgreementType): Promise<TemplateRow> {
  const admin = createAdminClient()
  const { data: approved } = await admin
    .from('agreement_templates')
    .select('*')
    .eq('type', type)
    .eq('status', 'approved')
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (approved) return approved
  const { data: draft, error } = await admin
    .from('agreement_templates')
    .select('*')
    .eq('type', type)
    .order('version', { ascending: false })
    .limit(1)
    .single()
  if (error) throw new Error(`no ${type} agreement template`)
  return draft
}

async function setting<T>(key: string, schema: z.ZodType<T>, fallback: T): Promise<T> {
  const { data } = await createAdminClient()
    .from('settings')
    .select('value')
    .eq('key', key)
    .maybeSingle()
  return schema.safeParse(data?.value).data ?? fallback
}

export async function lateFeeSettings() {
  const [daily, cap] = await Promise.all([
    setting('late_fee_daily', z.number().min(0).max(0.1), 0.0075),
    setting('late_fee_cap_share', z.number().min(0).max(5), 0.25),
  ])
  return { daily, cap }
}

export const maxActiveGuarantees = () =>
  setting('max_active_guarantees', z.number().int().min(1).max(20), 2)

// ------------------------------------------------------------ signing codes
const SENDS_PER_PHONE_PER_HOUR = 5
const VERIFIES_PER_IP_PER_HOUR = 10

export async function sendSignatureCode(
  subjectType: 'consumer' | 'guarantor',
  subjectId: string,
  phone: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await hitRateLimit(`sig-otp:${phone}`, SENDS_PER_PHONE_PER_HOUR, '1 hour'))) {
    return { ok: false, error: 'Too many codes sent to this number. Please try again in an hour.' }
  }
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('signature_otps')
    .insert({
      subject_type: subjectType,
      subject_id: subjectId,
      phone_e164: phone,
      code_hash: 'pending',
      expires_at: new Date(Date.now() + OTP_TTL_MS).toISOString(),
    })
    .select('id')
    .single()
  if (error) return { ok: false, error: 'Could not send a code. Please try again.' }
  const code = generateOtpCode()
  await admin
    .from('signature_otps')
    .update({ code_hash: hashOtp(data.id, code) })
    .eq('id', data.id)
  const provider = await getMessagingProvider()
  // Never log the code.
  await provider.send({
    channel: 'sms',
    to: phone,
    template: 'signature_code',
    payload: {
      text: `Your Go4Solar signing code is ${code}. It confirms your electronic signature and expires in 10 minutes.`,
    },
  })
  return { ok: true }
}

export async function verifySignatureCode(
  subjectId: string,
  code: string,
  ip: string,
): Promise<{ result: OtpCheck | 'rate_limited' | 'none'; at?: string }> {
  if (!(await hitRateLimit(`sig-verify:${ip}`, VERIFIES_PER_IP_PER_HOUR, '1 hour')))
    return { result: 'rate_limited' }
  const admin = createAdminClient()
  const { data: otp } = await admin
    .from('signature_otps')
    .select('id, code_hash, attempts, expires_at, consumed_at')
    .eq('subject_id', subjectId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!otp) return { result: 'none' }
  const result = checkOtp(otp, code)
  if (result !== 'ok') {
    await admin
      .from('signature_otps')
      .update({ attempts: otp.attempts + 1 })
      .eq('id', otp.id)
    return { result }
  }
  const at = new Date().toISOString()
  await admin.from('signature_otps').update({ consumed_at: at }).eq('id', otp.id)
  return { result: 'ok', at }
}

export const CODE_MESSAGES: Record<Exclude<OtpCheck, 'ok'> | 'rate_limited' | 'none', string> = {
  wrong: 'That code is not right. Check the SMS and try again.',
  expired: 'That code has expired. Send a new one.',
  locked: 'Too many wrong tries for this code. Send a new one.',
  used: 'That code was already used. Send a new one.',
  rate_limited: 'Too many tries. Please wait an hour and try again.',
  none: 'Send yourself a code first.',
}

// ------------------------------------------------------------ signing
/** A data:image/png;base64 signature from the canvas → PNG bytes (max 500 kB). */
export function signaturePngFromDataUrl(dataUrl: string): Buffer | null {
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl)
  if (!m?.[1]) return null
  const buf = Buffer.from(m[1], 'base64')
  const isPng = buf
    .subarray(0, 8)
    .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  return isPng && buf.length > 100 && buf.length < 500_000 ? buf : null
}

/**
 * Render, hash, store and send a signed agreement. The signature image and PDF go in the private
 * 'kyc' bucket; the row keeps both SHA-256 values (content fingerprint + PDF file).
 */
export async function finaliseAgreement(input: {
  type: AgreementType
  template: TemplateRow
  subjectId: string
  applicationId: string
  folder: string
  title: string
  reference: string
  text: string
  signaturePng: Buffer
  signerName: string
  signerTitle: string | null
  typedName: string
  otpVerifiedAt: string
  ip: string
  userAgent: string
  emailTo: string | null
}) {
  const signedAt = new Date().toISOString()
  const lagos = (iso: string) =>
    new Date(iso).toLocaleString('en-GB', {
      timeZone: 'Africa/Lagos',
      dateStyle: 'long',
      timeStyle: 'medium',
    }) + ' (Lagos)'
  const auditFields: Record<string, string> = {
    signer: input.signerName,
    title: input.signerTitle ?? '',
    typedName: input.typedName,
    signedAt,
    otpVerifiedAt: input.otpVerifiedAt,
    ip: input.ip,
    device: input.userAgent,
    template: `${input.type} v${input.template.version} (${input.template.status})`,
  }
  const fingerprint = contentFingerprint(input.text, input.signaturePng, auditFields)
  const audit: AuditRow[] = [
    {
      label: 'Signed by',
      value: input.signerName + (input.signerTitle ? `, ${input.signerTitle}` : ''),
    },
    { label: 'Typed name', value: input.typedName },
    { label: 'Signed at', value: lagos(signedAt) },
    { label: 'Phone code confirmed at', value: lagos(input.otpVerifiedAt) },
    { label: 'IP address', value: input.ip },
    { label: 'Device', value: input.userAgent.slice(0, 160) },
    { label: 'Template', value: auditFields.template! },
    { label: 'Reference', value: input.reference },
  ]
  const pdf = await renderAgreementPdf({
    title: input.title,
    reference: input.reference,
    text: input.text,
    signaturePng: input.signaturePng,
    signerName: input.signerName,
    signerTitle: input.signerTitle,
    audit,
    fingerprint,
  })
  const pdfSha = sha256Hex(pdf)

  const admin = createAdminClient()
  const id = randomUUID()
  const sigPath = `${input.folder}/signature-${input.type}-${id}.png`
  const pdfPath = `${input.folder}/agreement-${input.type}-${id}.pdf`
  const up1 = await admin.storage
    .from('kyc')
    .upload(sigPath, input.signaturePng, { contentType: 'image/png' })
  const up2 = await admin.storage
    .from('kyc')
    .upload(pdfPath, pdf, { contentType: 'application/pdf' })
  if (up1.error || up2.error) throw new Error('could not store the signed agreement')

  const { data: row, error } = await admin
    .from('agreements')
    .insert({
      id,
      type: input.type,
      template_id: input.template.id,
      version: input.template.version,
      subject_id: input.subjectId,
      application_id: input.applicationId,
      signer_name: input.signerName,
      signer_title: input.signerTitle,
      signature_path: sigPath,
      typed_name: input.typedName,
      otp_verified_at: input.otpVerifiedAt,
      ip: input.ip,
      user_agent: input.userAgent.slice(0, 500),
      signed_at: signedAt,
      pdf_path: pdfPath,
      pdf_sha256: pdfSha,
      content_sha256: fingerprint,
    })
    .select('*')
    .single()
  if (error) throw new Error(`could not save the agreement: ${error.message}`)

  if (input.emailTo) {
    const provider = await getMessagingProvider()
    await provider.send({
      channel: 'email',
      to: input.emailTo,
      template: 'agreement_signed',
      payload: {
        subject: `Your signed ${input.title} (${input.reference})`,
        text: `Thank you for signing. Your signed ${input.title.toLowerCase()} is attached. Document fingerprint: ${fingerprint}.`,
        attachment: pdfPath,
        pdfSha256: pdfSha,
      },
    })
  }
  return row
}

// ------------------------------------------------------------ guarantor invites
export type GuarantorContact = { name: string; phone: string; email: string; relationship: string }

/**
 * Create (or refresh) the guarantee for an application and send the link by email and SMS.
 * A refresh issues a new token, so any earlier link stops working.
 */
export async function inviteGuarantor(input: {
  applicationId: string
  contact: GuarantorContact
  applicantName: string
  monthly: string
  tenure: number
  origin: string
  existingId?: string
}): Promise<{ id: string }> {
  const { token, hash } = newGuaranteeToken()
  const admin = createAdminClient()
  const expires = new Date(Date.now() + GUARANTEE_TTL_MS).toISOString()
  let id = input.existingId
  if (id) {
    const { error } = await admin
      .from('guarantees')
      .update({ token_hash: hash, expires_at: expires, status: 'invited' })
      .eq('id', id)
    if (error) throw new Error(error.message)
  } else {
    const { data, error } = await admin
      .from('guarantees')
      .insert({
        application_id: input.applicationId,
        name: input.contact.name,
        phone: input.contact.phone,
        email: input.contact.email,
        relationship: input.contact.relationship,
        token_hash: hash,
        expires_at: expires,
      })
      .select('id')
      .single()
    if (error) throw new Error(error.message)
    id = data.id
  }
  const link = `${input.origin}/guarantee/${token}`
  const text =
    `Hello ${input.contact.name}, ${input.applicantName} has asked you to be the guarantor for their Go4Solar solar payment plan ` +
    `(${input.monthly} a month for ${input.tenure} months, no interest). Please review and respond within 72 hours: ${link}`
  const provider = await getMessagingProvider()
  await Promise.allSettled([
    provider.send({
      channel: 'email',
      to: input.contact.email,
      template: 'guarantor_invite',
      payload: { subject: `${input.applicantName} asked you to be their guarantor`, text, link },
    }),
    provider.send({
      channel: 'sms',
      to: input.contact.phone,
      template: 'guarantor_invite',
      payload: { text, link },
    }),
  ])
  return { id: id! }
}
