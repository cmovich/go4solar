'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { z } from 'zod'

import { sameApplicant } from '@/lib/applications/identity'
import { sendEmailVerification, siteOrigin } from '@/lib/auth/emailVerification'
import { getSessionInfo } from '@/lib/auth/session'
import { OTP_TTL_MS, checkOtp, generateOtpCode, hashOtp } from '@/lib/otp/otp'
import { sendOtpSms } from '@/lib/quotes/messages'
import { clientIp } from '@/lib/ratelimit/clientIp'
import { hitRateLimit } from '@/lib/ratelimit/hitRateLimit'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { currentVisitorHash } from '@/lib/waitlist/token'

import { signedInAsMessage } from './messages'

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string; exists?: boolean }

const SENDS_PER_PHONE_PER_HOUR = 5
const VERIFIES_PER_IP_PER_HOUR = 10
const EXPIRED = {
  ok: false,
  error: 'This plan has expired or belongs to another device. Please start again.',
} as const

/** The visitor's own quote (cookie token) and the lead it came from. */
async function quoteContext(quoteId: string) {
  if (!z.uuid().safeParse(quoteId).success) return null
  const hash = await currentVisitorHash()
  if (!hash) return null
  const admin = createAdminClient()
  const { data: quote } = await admin
    .from('quotes')
    .select('id, waitlist_id, state, plan, tenure, deposit_share, status')
    .eq('id', quoteId)
    .eq('anon_token_hash', hash)
    .maybeSingle()
  if (!quote || !quote.waitlist_id) return null
  const { data: lead } = await admin
    .from('waitlist_consumers')
    .select('id, first_name, surname, phone_e164, email, state')
    .eq('id', quote.waitlist_id)
    .maybeSingle()
  if (!lead) return null
  return { quote, lead }
}

/**
 * Whose phone gets the code, and may the profile take the quote's name? The signed-in account
 * must be the person the quote is for, unless they chose "Continue as <account>": then the code
 * goes to the account's own phone and the account's name is never overwritten.
 */
async function applicantFor(
  userId: string,
  lead: { first_name: string | null; surname: string | null; phone_e164: string },
  asAccount: boolean,
): Promise<{ ok: true; phone: string; fillProfile: boolean } | { ok: false; error: string }> {
  const { data: profile } = await createAdminClient()
    .from('profiles')
    .select('full_name, phone_e164')
    .eq('id', userId)
    .maybeSingle()
  const account = { fullName: profile?.full_name ?? null, phone: profile?.phone_e164 ?? null }
  const quote = {
    fullName: [lead.first_name, lead.surname].filter(Boolean).join(' ') || null,
    phone: lead.phone_e164,
  }
  if (sameApplicant(account, quote)) return { ok: true, phone: lead.phone_e164, fillProfile: true }
  if (!asAccount) return { ok: false, error: signedInAsMessage(account.fullName) }
  return { ok: true, phone: account.phone ?? lead.phone_e164, fillProfile: false }
}

const accountSchema = z.object({
  quoteId: z.uuid(),
  email: z.email('Enter a valid email address'),
  password: z.string().min(8, 'Use at least 8 characters'),
})

/**
 * Step 1: email + password. The account is created confirmed (the phone code is the
 * verification step), signed in, and the first code is sent.
 */
export async function createAccount(input: unknown): Promise<Result> {
  const parsed = accountSchema.safeParse(input)
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check your details' }
  const ctx = await quoteContext(parsed.data.quoteId)
  if (!ctx) return EXPIRED
  const { lead } = ctx

  const fullName = [lead.first_name, lead.surname].filter(Boolean).join(' ')
  const { error } = await createAdminClient().auth.admin.createUser({
    email: parsed.data.email,
    password: parsed.data.password,
    email_confirm: true,
    user_metadata: { full_name: fullName, phone_e164: lead.phone_e164 },
  })
  if (error) {
    const exists = /already|registered|exists/i.test(error.message)
    return exists
      ? {
          ok: false,
          exists: true,
          error: 'An account with this email already exists. Sign in to continue.',
        }
      : { ok: false, error: 'Could not create your account. Please try again.' }
  }

  const supabase = await createClient()
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  })
  if (signInError)
    return { ok: false, error: 'Account created, but sign-in failed. Please sign in.' }

  const userId = (await supabase.auth.getUser()).data.user?.id ?? null
  // Non-blocking: sign-up continues whether or not the email goes out.
  if (userId) await sendEmailVerification(userId, parsed.data.email, siteOrigin(await headers()))
  return sendCodeTo(ctx.lead.phone_e164, userId)
}

async function sendCodeTo(phone: string, userId: string | null): Promise<Result> {
  if (!userId) return { ok: false, error: 'Please sign in first.' }
  if (!(await hitRateLimit(`otp-send:${phone}`, SENDS_PER_PHONE_PER_HOUR, '1 hour'))) {
    return { ok: false, error: 'Too many codes sent to this number. Please try again in an hour.' }
  }
  const admin = createAdminClient()
  // Insert first to get the id the hash is salted with, then store the real hash.
  const { data, error } = await admin
    .from('phone_otps')
    .insert({
      user_id: userId,
      phone_e164: phone,
      code_hash: 'pending',
      expires_at: new Date(Date.now() + OTP_TTL_MS).toISOString(),
    })
    .select('id')
    .single()
  if (error) return { ok: false, error: 'Could not send a code. Please try again.' }
  const code = generateOtpCode()
  await admin
    .from('phone_otps')
    .update({ code_hash: hashOtp(data.id, code) })
    .eq('id', data.id)
  await sendOtpSms(phone, code)
  return { ok: true }
}

/** "Send a new code" (also used when a signed-in user arrives at the phone step). */
export async function sendPhoneCode(input: unknown): Promise<Result> {
  const parsed = z.object({ quoteId: z.uuid(), asAccount: z.boolean().optional() }).safeParse(input)
  if (!parsed.success) return EXPIRED
  const session = await getSessionInfo()
  if (!session.user) return { ok: false, error: 'Please sign in first.' }
  const ctx = await quoteContext(parsed.data.quoteId)
  if (!ctx) return EXPIRED
  const who = await applicantFor(session.user.id, ctx.lead, Boolean(parsed.data.asAccount))
  if (!who.ok) return who
  return sendCodeTo(who.phone, session.user.id)
}

const verifySchema = z.object({
  quoteId: z.uuid(),
  code: z.string().trim().min(6).max(12),
  asAccount: z.boolean().optional(),
})

/** Step 2: the 6-digit code. On success the quote is chosen and attached to the account. */
export async function verifyPhoneCode(input: unknown): Promise<Result> {
  const parsed = verifySchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Enter the 6-digit code.' }
  const session = await getSessionInfo()
  if (!session.user) return { ok: false, error: 'Please sign in first.' }

  const ip = clientIp(await headers())
  if (!(await hitRateLimit(`otp-verify:${ip}`, VERIFIES_PER_IP_PER_HOUR, '1 hour'))) {
    return { ok: false, error: 'Too many tries. Please wait an hour and try again.' }
  }
  const ctx = await quoteContext(parsed.data.quoteId)
  if (!ctx) return EXPIRED
  const who = await applicantFor(session.user.id, ctx.lead, Boolean(parsed.data.asAccount))
  if (!who.ok) return who

  const admin = createAdminClient()
  const { data: otp } = await admin
    .from('phone_otps')
    .select('id, code_hash, attempts, expires_at, consumed_at')
    .eq('user_id', session.user.id)
    .eq('phone_e164', who.phone)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!otp) return { ok: false, error: 'No code found. Tap "Send a new code".' }

  const outcome = checkOtp(otp, parsed.data.code)
  if (outcome !== 'ok') {
    await admin
      .from('phone_otps')
      .update({ attempts: otp.attempts + 1 })
      .eq('id', otp.id)
    const messages = {
      wrong: 'That code is not right. Check the SMS and try again.',
      expired: 'That code has expired. Tap "Send a new code".',
      locked: 'Too many wrong tries for this code. Tap "Send a new code".',
      used: 'That code was already used. Tap "Send a new code".',
    } as const
    return { ok: false, error: messages[outcome] }
  }

  const now = new Date().toISOString()
  await admin.from('phone_otps').update({ consumed_at: now }).eq('id', otp.id)
  // The quote's name and phone fill the profile only when they are this account's own.
  if (who.fillProfile) {
    const fullName = [ctx.lead.first_name, ctx.lead.surname].filter(Boolean).join(' ')
    await admin
      .from('profiles')
      .update({
        full_name: fullName || null,
        phone_e164: ctx.lead.phone_e164,
        state: ctx.lead.state,
      })
      .eq('id', session.user.id)
  }
  await admin
    .from('quotes')
    .update({ owner_id: session.user.id, status: 'chosen' })
    .eq('id', ctx.quote.id)
  await admin
    .from('waitlist_consumers')
    .update({
      status: 'complete',
      chosen_plan: ctx.quote.plan,
      deposit_share: ctx.quote.deposit_share,
    })
    .eq('id', ctx.lead.id)
  return { ok: true }
}

/** "Sign out to apply as someone else": ends this session and reopens the same quote. */
export async function signOutForQuote(input: unknown): Promise<void> {
  const parsed = z.object({ quoteId: z.uuid() }).safeParse(input)
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect(parsed.success ? `/account?quote=${parsed.data.quoteId}` : '/get-started')
}
