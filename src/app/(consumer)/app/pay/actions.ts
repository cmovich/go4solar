'use server'

import { headers } from 'next/headers'
import { z } from 'zod'

import { siteOrigin } from '@/lib/auth/emailVerification'
import { getSessionInfo } from '@/lib/auth/session'
import { toKobo } from '@/lib/payments/kobo'
import {
  processPaymentEvent,
  skipAutoPay,
  startDeposit,
  startInstalmentPayment,
  startMandate,
} from '@/lib/payments/server'
import { paymentsMode } from '@/lib/providers/payments'
import { testSwitchesOn } from '@/lib/testmode/server'
import { mockFee } from '@/lib/providers/payments/mock'
import { createAdminClient } from '@/lib/supabase/admin'

type Result = { ok: true; url: string } | { ok: false; error: string; missing?: string[] }

async function userId() {
  const s = await getSessionInfo()
  return s.user?.id ?? null
}

const SIGN_IN = { ok: false, error: 'Please sign in.' } as const

export async function payDeposit(): Promise<Result> {
  const id = await userId()
  if (!id) return SIGN_IN
  return startDeposit(id, siteOrigin(await headers()))
}

export async function setUpAutoPay(): Promise<Result> {
  const id = await userId()
  if (!id) return SIGN_IN
  return startMandate(id, siteOrigin(await headers()))
}

export async function chooseManualPayments(): Promise<
  { ok: true; url: string } | { ok: false; error: string }
> {
  const id = await userId()
  if (!id) return SIGN_IN
  await skipAutoPay(id)
  return { ok: true, url: '/app' }
}

export async function payNextInstalment(): Promise<Result> {
  const id = await userId()
  if (!id) return SIGN_IN
  return startInstalmentPayment(id, siteOrigin(await headers()))
}

// ------------------------------------------------------------ mock provider pages
// They stand in for Paystack's checkout and the bank's approval page, and deliver the same events
// Paystack would send. Closed unless PAYMENTS_PROVIDER is mock; only the payer can use them.
const mockInput = z.object({
  reference: z.string().regex(/^G4S-[A-Z]{3}-[0-9A-F]{12}$/),
  outcome: z.enum(['success', 'failed']),
})

export async function completeMockCheckout(
  input: unknown,
): Promise<{ ok: boolean; error?: string }> {
  if (paymentsMode() !== 'mock' || !(await testSwitchesOn()))
    return { ok: false, error: 'Not available.' }
  const id = await userId()
  const p = mockInput.safeParse(input)
  if (!id || !p.success) return { ok: false, error: 'Not available.' }
  const { data: row } = await createAdminClient()
    .from('payments')
    .select('reference, amount, consumer_id')
    .eq('reference', p.data.reference)
    .maybeSingle()
  if (!row || row.consumer_id !== id) return { ok: false, error: 'Not available.' }
  await new Promise((r) => setTimeout(r, 600)) // a real checkout takes a moment
  const amount = Number(row.amount)
  await processPaymentEvent(
    p.data.outcome === 'success'
      ? {
          type: 'charge.success',
          eventId: `charge.success:mock-${row.reference}`,
          reference: row.reference,
          amountKobo: toKobo(amount),
          feesKobo: toKobo(mockFee(amount)),
          paidAt: new Date().toISOString(),
          channel: 'card',
        }
      : {
          type: 'charge.failed',
          eventId: `charge.failed:mock-${row.reference}`,
          reference: row.reference,
        },
  )
  return { ok: true }
}

const mandateInput = mockInput.extend({ bank: z.string().max(60).optional() })

export async function completeMockMandate(
  input: unknown,
): Promise<{ ok: boolean; error?: string }> {
  if (paymentsMode() !== 'mock' || !(await testSwitchesOn()))
    return { ok: false, error: 'Not available.' }
  const id = await userId()
  const p = mandateInput.safeParse(input)
  if (!id || !p.success) return { ok: false, error: 'Not available.' }
  const { data: m } = await createAdminClient()
    .from('mandates')
    .select('init_reference, consumer_id')
    .eq('init_reference', p.data.reference)
    .maybeSingle()
  if (!m || m.consumer_id !== id) return { ok: false, error: 'Not available.' }
  await new Promise((r) => setTimeout(r, 600))
  await processPaymentEvent(
    p.data.outcome === 'success'
      ? {
          type: 'mandate.active',
          eventId: `mandate.active:AUTH_mock_${m.init_reference}`,
          reference: m.init_reference,
          email: null,
          authorizationCode: `AUTH_mock_${m.init_reference}`,
          bankName: p.data.bank ?? 'Test Bank',
          last4: '0001',
        }
      : {
          type: 'mandate.failed',
          eventId: `mandate.failed:${m.init_reference}`,
          reference: m.init_reference,
          email: null,
          reason: 'Bank not supported for direct debit',
        },
  )
  return { ok: true }
}
