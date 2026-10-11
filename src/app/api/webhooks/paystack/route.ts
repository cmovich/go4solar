import { parsePaystackEvent } from '@/lib/payments/events'
import { processPaymentEvent } from '@/lib/payments/server'
import { paystackSignatureValid } from '@/lib/payments/signature'

export const dynamic = 'force-dynamic'

/**
 * Paystack webhook. Checks x-paystack-signature (HMAC-SHA512 of the raw body with the secret key),
 * then applies the event once (idempotent on provider_event_id / reference). In mock mode the mock
 * checkout delivers its events in-process, so this endpoint is closed.
 */
export async function POST(req: Request) {
  if (process.env.PAYMENTS_PROVIDER !== 'paystack')
    return new Response('Not found', { status: 404 })
  const raw = await req.text()
  const ok = paystackSignatureValid(
    raw,
    req.headers.get('x-paystack-signature'),
    process.env.PAYSTACK_SECRET_KEY ?? '',
  )
  if (!ok) return new Response('Invalid signature', { status: 401 })

  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    return new Response('Bad JSON', { status: 400 })
  }
  // Errors → 500 so Paystack retries; a retry is harmless because events apply only once.
  const outcome = await processPaymentEvent(parsePaystackEvent(body))
  return Response.json({ received: true, outcome })
}
