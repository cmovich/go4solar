'use server'

import { headers } from 'next/headers'

import { sendEmailVerification, siteOrigin } from '@/lib/auth/emailVerification'
import { getSessionInfo } from '@/lib/auth/session'
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
