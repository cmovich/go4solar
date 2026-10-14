import 'server-only'

import { createHash, randomBytes } from 'node:crypto'

import { getMessagingProvider } from '@/lib/providers/messaging'
import { originFor } from '@/lib/site/origin'
import { createAdminClient } from '@/lib/supabase/admin'

const TTL_MS = 3 * 24 * 60 * 60 * 1000 // 3 days

const hash = (token: string) => createHash('sha256').update(token).digest('hex')

/** Site origin for links in messages (see originFor: previews always use their own address). */
export function siteOrigin(headers: Headers): string {
  return originFor(headers)
}

/**
 * Emails a "verify your email" link (non-blocking for sign-up). Only the token's hash is stored.
 * Never throws: a failure here must not break account creation.
 */
export async function sendEmailVerification(
  userId: string,
  email: string,
  origin: string,
): Promise<void> {
  try {
    const token = randomBytes(24).toString('base64url')
    const { error } = await createAdminClient()
      .from('email_verifications')
      .insert({
        user_id: userId,
        email,
        token_hash: hash(token),
        expires_at: new Date(Date.now() + TTL_MS).toISOString(),
      })
    if (error) throw new Error(error.message)
    const link = `${origin}/verify-email?token=${token}`
    const provider = await getMessagingProvider()
    await provider.send({
      channel: 'email',
      to: email,
      template: 'verify_email',
      payload: {
        subject: 'Confirm your email for Go4Solar',
        text: `Please confirm your email address for your Go4Solar account: ${link}\nThe link works for 3 days.`,
        link,
      },
    })
  } catch (err) {
    console.error('[email-verify] could not send:', err instanceof Error ? err.message : err)
  }
}

/** Marks the profile verified when the token is valid, unused and unexpired. */
export async function consumeEmailVerification(
  token: string,
): Promise<'ok' | 'invalid' | 'expired'> {
  if (!token || token.length < 20) return 'invalid'
  const admin = createAdminClient()
  const { data: row } = await admin
    .from('email_verifications')
    .select('id, user_id, expires_at, used_at')
    .eq('token_hash', hash(token))
    .maybeSingle()
  if (!row || row.used_at) return 'invalid'
  if (new Date(row.expires_at).getTime() < Date.now()) return 'expired'
  const now = new Date().toISOString()
  await admin.from('email_verifications').update({ used_at: now }).eq('id', row.id)
  await admin.from('profiles').update({ email_verified_at: now }).eq('id', row.user_id)
  return 'ok'
}
