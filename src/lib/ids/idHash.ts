import { createHmac } from 'node:crypto'

export type IdKind = 'nin' | 'bvn'

const MIN_SECRET = 32

/**
 * Keyed hash (HMAC-SHA256 with the server secret ID_HASH_SECRET) of a full NIN or BVN. Only this
 * is stored (nin_hash / bvn_hash) to compare identities: guarantor ≠ applicant, one active
 * application per NIN, guarantees per person. Never store or log the number itself.
 */
export function idHash(kind: IdKind, value: string, secret = process.env.ID_HASH_SECRET): string {
  if (!secret || secret.length < MIN_SECRET) {
    throw new Error(
      `ID_HASH_SECRET is not set (at least ${MIN_SECRET} characters). Add it to .env.local and Vercel.`,
    )
  }
  const digits = value.replace(/[\s-]/g, '')
  if (!/^\d{11}$/.test(digits)) throw new Error(`${kind.toUpperCase()} must be 11 digits`)
  return createHmac('sha256', secret).update(`${kind}:${digits}`).digest('hex')
}
