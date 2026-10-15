import { z } from 'zod'

/**
 * Paystack webhook bodies reduced to what Go4Solar acts on. eventId is the idempotency key stored
 * in payments.provider_event_id: the same event (or a server-side verify of the same transaction)
 * always produces the same id, so it can only take effect once.
 */
export type PaymentEvent =
  | {
      type: 'charge.success'
      eventId: string
      reference: string
      amountKobo: number
      feesKobo: number
      paidAt: string | null
      channel: string | null
    }
  | { type: 'charge.failed'; eventId: string; reference: string }
  | {
      type: 'mandate.active'
      eventId: string
      reference: string | null
      email: string | null
      authorizationCode: string
      bankName: string | null
      last4: string | null
    }
  | {
      type: 'mandate.failed'
      eventId: string
      reference: string | null
      email: string | null
      reason: string | null
    }
  | {
      type: 'refund.processed' | 'refund.failed'
      eventId: string
      transactionReference: string
      amountKobo: number
    }
  | { type: 'ignored' }

const id = z.union([z.number(), z.string()]).transform(String)
const email = z
  .object({ customer: z.object({ email: z.string() }).partial().optional() })
  .transform((d) => d.customer?.email ?? null)

const charge = z.object({
  id,
  reference: z.string().min(1),
  amount: z.number().int().nonnegative(),
  fees: z.number().nullish(),
  paid_at: z.string().nullish(),
  paidAt: z.string().nullish(),
  channel: z.string().nullish(),
})
const failedCharge = z.object({ id, reference: z.string().min(1) })
const mandate = z.object({
  authorization_code: z.string().min(1),
  reference: z.string().nullish(),
  bank: z.string().nullish(),
  last4: z
    .string()
    .regex(/^\d{4}$/)
    .nullish(),
})
const mandateFailed = z.object({
  reference: z.string().nullish(),
  authorization_code: z.string().nullish(),
  reason: z.string().nullish(),
  message: z.string().nullish(),
})
const refund = z.object({
  id,
  transaction_reference: z.string().min(1),
  amount: z.number().int().nonnegative(),
})

export function parsePaystackEvent(body: unknown): PaymentEvent {
  const env = z
    .object({ event: z.string(), data: z.record(z.string(), z.unknown()) })
    .safeParse(body)
  if (!env.success) return { type: 'ignored' }
  const { event, data } = env.data
  switch (event) {
    case 'charge.success': {
      const p = charge.safeParse(data)
      if (!p.success) return { type: 'ignored' }
      return {
        type: 'charge.success',
        eventId: `charge.success:${p.data.id}`,
        reference: p.data.reference,
        amountKobo: p.data.amount,
        feesKobo: Math.round(p.data.fees ?? 0),
        paidAt: p.data.paid_at ?? p.data.paidAt ?? null,
        channel: p.data.channel ?? null,
      }
    }
    case 'charge.failed': {
      const p = failedCharge.safeParse(data)
      if (!p.success) return { type: 'ignored' }
      return {
        type: 'charge.failed',
        eventId: `charge.failed:${p.data.id}`,
        reference: p.data.reference,
      }
    }
    case 'direct_debit.authorization.active': {
      const p = mandate.safeParse(data)
      if (!p.success) return { type: 'ignored' }
      return {
        type: 'mandate.active',
        eventId: `mandate.active:${p.data.authorization_code}`,
        reference: p.data.reference ?? null,
        email: email.parse(data),
        authorizationCode: p.data.authorization_code,
        bankName: p.data.bank ?? null,
        last4: p.data.last4 ?? null,
      }
    }
    case 'direct_debit.authorization.failed':
    case 'direct_debit.authorization.deactivated': {
      const p = mandateFailed.safeParse(data)
      if (!p.success) return { type: 'ignored' }
      const key = p.data.authorization_code ?? p.data.reference ?? 'unknown'
      return {
        type: 'mandate.failed',
        eventId: `mandate.failed:${key}`,
        reference: p.data.reference ?? null,
        email: email.parse(data),
        reason: p.data.reason ?? p.data.message ?? null,
      }
    }
    case 'refund.processed':
    case 'refund.failed': {
      const p = refund.safeParse(data)
      if (!p.success) return { type: 'ignored' }
      return {
        type: event,
        eventId: `${event}:${p.data.id}`,
        transactionReference: p.data.transaction_reference,
        amountKobo: p.data.amount,
      }
    }
    default:
      return { type: 'ignored' }
  }
}
