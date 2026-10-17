'use server'

import { headers } from 'next/headers'

import { sendPasswordLink } from '@/lib/auth/passwordLinks'
import { forgotPasswordSchema } from '@/lib/auth/passwordSchema'
import { clientIp } from '@/lib/ratelimit/clientIp'
import { hitRateLimit } from '@/lib/ratelimit/hitRateLimit'
import { originFor } from '@/lib/site/origin'

import { SENT_MESSAGE } from './messages'

const PER_IP_PER_HOUR = 10
const PER_EMAIL_PER_HOUR = 3

export type ForgotResult = { message?: string; error?: string }

/** "Forgot password?": emails a link to the same "Set your password" page as staff invites. */
export async function requestPasswordLink(input: unknown): Promise<ForgotResult> {
  const parsed = forgotPasswordSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Check the form' }
  const email = parsed.data.email.trim().toLowerCase()
  const h = await headers()
  if (
    !(await hitRateLimit(`forgot:${clientIp(h)}`, PER_IP_PER_HOUR, '1 hour')) ||
    !(await hitRateLimit(`forgot-email:${email}`, PER_EMAIL_PER_HOUR, '1 hour'))
  ) {
    return { error: 'Too many requests. Please wait an hour and try again.' }
  }
  const sent = await sendPasswordLink(email, originFor(h))
  // Logged without the email address; the answer is the same either way.
  if (!sent.ok) console.error(`[auth] password link not sent: ${sent.error}`)
  return { message: SENT_MESSAGE }
}
