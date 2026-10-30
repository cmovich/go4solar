'use server'

import { headers } from 'next/headers'

import { revalidatePath } from 'next/cache'

import { resubmitAfterMoreInfo } from '@/lib/approvals/server'
import { sendEmailVerification, siteOrigin } from '@/lib/auth/emailVerification'
import { getSessionInfo } from '@/lib/auth/session'
import { requestChange } from '@/lib/account/changes'
import { customerSignOff } from '@/lib/jobs/server'
import { createClient } from '@/lib/supabase/server'
import { hitRateLimit } from '@/lib/ratelimit/hitRateLimit'

/** "Resend the link" in the /app banner (3 an hour per user). */
export async function resendEmailVerification(): Promise<{ ok: boolean; error?: string }> {
  const session = await getSessionInfo()
  if (!session.user?.email) return { ok: false, error: 'Please sign in.' }
  if (session.emailVerified) return { ok: true }
  if (!(await hitRateLimit(`email-verify:${session.user.id}`, 3, '1 hour'))) {
    return { ok: false, error: 'We have sent a few already. Please check your inbox (and spam).' }
  }
  await sendEmailVerification(session.user.id, session.user.email, siteOrigin(await headers()))
  return { ok: true }
}

/** "My system is installed and working": commissioning, and the payment plan starts. */
export async function confirmInstallation(): Promise<
  { ok: true; url: string } | { ok: false; error: string }
> {
  const session = await getSessionInfo()
  if (!session.user) return { ok: false, error: 'Please sign in.' }
  const r = await customerSignOff(session.user.id)
  revalidatePath('/app')
  return r.ok ? { ok: true, url: '/app?installed=1' } : r
}

/** After fixing what the credit officer asked for: back to the review queue. */
export async function sendBackForReview(): Promise<
  { ok: true; url: string } | { ok: false; error: string }
> {
  const session = await getSessionInfo()
  if (!session.user) return { ok: false, error: 'Please sign in.' }
  const r = await resubmitAfterMoreInfo(session.user.id)
  revalidatePath('/app')
  return r.ok ? { ok: true, url: '/app' } : r
}

/** "Request a change" to a verified detail (staff approve; audited). */
export async function requestDetailChange(
  input: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await getSessionInfo()
  if (!session.user) return { ok: false, error: 'Please sign in.' }
  if (!(await hitRateLimit(`change-request:${session.user.id}`, 10, '1 day'))) {
    return { ok: false, error: 'Too many requests today. Please call us.' }
  }
  const r = await requestChange(await createClient(), session.user.id, input)
  if (r.ok) revalidatePath('/app')
  return r
}
