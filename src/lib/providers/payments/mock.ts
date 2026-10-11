import { createAdminClient } from '@/lib/supabase/admin'

import type { PaymentsProvider } from './index'

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Paystack-like local fee: 1.5% + ₦100 (no ₦100 under ₦2,500), capped at ₦2,000. */
export function mockFee(amount: number): number {
  const fee = amount * 0.015 + (amount >= 2500 ? 100 : 0)
  return Math.round(Math.min(fee, 2000) * 100) / 100
}

const origin = (url: string) => new URL(url).origin

/**
 * Mock payments: "checkout" and "bank approval" are pages on this site (/app/pay/mock*) that
 * deliver the same events Paystack would. verify() answers from what those events recorded.
 * Only active when PAYMENTS_PROVIDER is not 'paystack'.
 */
export const mockPaymentsProvider: PaymentsProvider = {
  name: 'mock',

  async initDeposit({ reference, callbackUrl }) {
    await wait(300)
    const q = new URLSearchParams({ reference, next: callbackUrl })
    return { authorizationUrl: `${origin(callbackUrl)}/app/pay/mock?${q}` }
  },

  async verify(reference) {
    await wait(200)
    const { data } = await createAdminClient()
      .from('payments')
      .select('reference, status, amount, fee, paid_at, channel, provider_event_id')
      .eq('reference', reference)
      .maybeSingle()
    if (!data) throw new Error('mock: unknown reference')
    return {
      reference,
      status: data.status,
      amount: Number(data.amount),
      fee: Number(data.fee),
      paidAt: data.paid_at,
      channel: data.channel,
      providerId: data.provider_event_id?.split(':')[1] ?? null,
    }
  },

  async createMandate({ reference, callbackUrl }) {
    await wait(300)
    const q = new URLSearchParams({ reference, next: callbackUrl })
    return {
      status: 'pending',
      authorizationUrl: `${origin(callbackUrl)}/app/pay/mock-mandate?${q}`,
    }
  },

  async verifyMandate(reference) {
    const { data } = await createAdminClient()
      .from('mandates')
      .select('status, provider_ref, bank_name, account_last4')
      .eq('init_reference', reference)
      .maybeSingle()
    return {
      status:
        data?.status === 'active' ? 'active' : data?.status === 'failed' ? 'failed' : 'pending',
      authorizationCode: data?.provider_ref ?? null,
      bankName: data?.bank_name ?? null,
      last4: data?.account_last4 ?? null,
    }
  },

  async chargeMandate() {
    await wait(300)
    return { status: 'success' }
  },

  async refund() {
    await wait(300)
    return { status: 'processed' }
  },
}
