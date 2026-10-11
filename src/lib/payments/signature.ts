import { createHmac, timingSafeEqual } from 'node:crypto'

/** Paystack signs each webhook: x-paystack-signature = HMAC-SHA512(raw body, secret key), hex. */
export function paystackSignatureValid(
  rawBody: string,
  signature: string | null,
  secret: string,
): boolean {
  if (!signature || !secret) return false
  const expected = createHmac('sha512', secret).update(rawBody).digest()
  const given = Buffer.from(signature, 'hex')
  return given.length === expected.length && timingSafeEqual(given, expected)
}
