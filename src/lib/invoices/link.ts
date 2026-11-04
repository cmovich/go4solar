import { createHmac, timingSafeEqual } from 'node:crypto'

const TTL_MS = 30 * 60_000

const mac = (id: string, exp: string, secret: string) =>
  createHmac('sha256', secret).update(`invoice-link:${id}:${exp}`).digest('base64url')

/**
 * A short-lived link to one invoice PDF (30 minutes), so it opens in the browser or a download
 * manager without the sign-in cookie, like the signed agreement. Pure (secret passed in).
 */
export function signInvoiceLink(
  id: string,
  now: Date,
  secret: string,
): { exp: string; sig: string } {
  if (!secret) throw new Error('No secret for invoice links.')
  const exp = String(now.getTime() + TTL_MS)
  return { exp, sig: mac(id, exp, secret) }
}

export function verifyInvoiceLink(
  id: string,
  exp: string,
  sig: string,
  now: Date,
  secret: string,
): boolean {
  if (!secret || !/^\d{10,16}$/.test(exp) || Number(exp) < now.getTime()) return false
  const a = Buffer.from(mac(id, exp, secret))
  const b = Buffer.from(sig)
  return a.length === b.length && timingSafeEqual(a, b)
}
