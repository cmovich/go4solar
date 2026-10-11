import { createHmac, randomBytes } from 'node:crypto'

/** A guarantor link works for 72 hours. A resend issues a new token and the old one stops working. */
export const GUARANTEE_TTL_MS = 72 * 60 * 60 * 1000

function requireSecret(secret: string | undefined): string {
  if (!secret || secret.length < 16) {
    throw new Error(
      'GUARANTOR_TOKEN_SECRET is not set (at least 16 characters). Add it to .env.local and Vercel.',
    )
  }
  return secret
}

/** Only this keyed hash is stored; the token itself only ever travels in the link. */
export function hashGuaranteeToken(
  token: string,
  secret = process.env.GUARANTOR_TOKEN_SECRET,
): string {
  return createHmac('sha256', requireSecret(secret)).update(`guarantee:${token}`).digest('hex')
}

export function newGuaranteeToken(secret = process.env.GUARANTOR_TOKEN_SECRET): {
  token: string
  hash: string
} {
  const token = randomBytes(32).toString('base64url')
  return { token, hash: hashGuaranteeToken(token, requireSecret(secret)) }
}

export type GuaranteeCheck = 'ok' | 'not_found' | 'expired' | 'signed' | 'declined'

export function checkGuaranteeToken(
  row: {
    status: 'invited' | 'in_progress' | 'signed' | 'declined' | 'expired'
    expires_at: string
  } | null,
  now = new Date(),
): GuaranteeCheck {
  if (!row) return 'not_found'
  if (row.status === 'signed') return 'signed'
  if (row.status === 'declined') return 'declined'
  if (row.status === 'expired' || now.getTime() > new Date(row.expires_at).getTime())
    return 'expired'
  return 'ok'
}
