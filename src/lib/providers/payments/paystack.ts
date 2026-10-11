import { fromKobo, toKobo } from '@/lib/payments/kobo'

import type { PaymentsProvider, VerifiedMandate } from './index'

const API = 'https://api.paystack.co'

function secret(): string {
  const key = process.env.PAYSTACK_SECRET_KEY
  if (!key) throw new Error('PAYSTACK_SECRET_KEY is not set')
  return key
}

/** Call the Paystack API. Errors carry Paystack's message, never the key. */
async function call<T>(path: string, body?: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { authorization: `Bearer ${secret()}`, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  })
  const json = (await res.json().catch(() => null)) as {
    status?: boolean
    message?: string
    data?: T
  } | null
  if (!res.ok || !json?.status)
    throw new Error(`Paystack ${path.split('/')[1]}: ${json?.message ?? res.status}`)
  return json.data as T
}

type Tx = {
  id: number | string
  status: string
  reference: string
  amount: number
  fees?: number | null
  paid_at?: string | null
  channel?: string | null
}

/**
 * Paystack: checkout (card / transfer / USSD / bank) for deposits and manual payments, Direct Debit
 * authorisation + charge_authorization for auto-pay. Amounts in kobo.
 * VERIFY against the Paystack test account: the direct-debit endpoints (authorization initialize /
 * verify) must be enabled on the business; field names follow the current Paystack docs.
 */
export const paystackPaymentsProvider: PaymentsProvider = {
  name: 'paystack',

  async initDeposit({ email, amount, reference, callbackUrl, metadata }) {
    const data = await call<{ authorization_url: string }>('/transaction/initialize', {
      email,
      amount: toKobo(amount),
      reference,
      callback_url: callbackUrl,
      currency: 'NGN',
      channels: ['card', 'bank_transfer', 'ussd', 'bank'],
      metadata: metadata ?? {},
    })
    return { authorizationUrl: data.authorization_url }
  },

  async verify(reference) {
    const tx = await call<Tx>(`/transaction/verify/${encodeURIComponent(reference)}`)
    return {
      reference: tx.reference,
      status: tx.status === 'success' ? 'success' : tx.status === 'failed' ? 'failed' : 'pending',
      amount: fromKobo(tx.amount),
      fee: fromKobo(tx.fees ?? 0),
      paidAt: tx.paid_at ?? null,
      channel: tx.channel ?? null,
      providerId: String(tx.id),
    }
  },

  async createMandate({ email, reference, callbackUrl, bankCode, account }) {
    const data = await call<{ redirect_url?: string; status?: string }>(
      '/customer/authorization/initialize',
      {
        email,
        channel: 'direct_debit',
        callback_url: callbackUrl,
        reference,
        ...(bankCode && account ? { account: { number: account, bank_code: bankCode } } : {}),
      },
    )
    return data.redirect_url
      ? { status: 'pending', authorizationUrl: data.redirect_url }
      : { status: 'failed', reason: data.status ?? 'no authorisation link' }
  },

  async verifyMandate(reference): Promise<VerifiedMandate> {
    const d = await call<{
      authorization_code?: string
      active?: boolean
      status?: string
      bank?: string
      last4?: string
    }>(`/customer/authorization/verify/${encodeURIComponent(reference)}`)
    const active = d.active === true || d.status === 'active'
    return {
      status: active ? 'active' : d.status === 'failed' ? 'failed' : 'pending',
      authorizationCode: d.authorization_code ?? null,
      bankName: d.bank ?? null,
      last4: d.last4 && /^\d{4}$/.test(d.last4) ? d.last4 : null,
    }
  },

  async chargeMandate({ authorizationCode, email, amount, reference }) {
    const d = await call<{ status: string }>('/transaction/charge_authorization', {
      authorization_code: authorizationCode,
      email,
      amount: toKobo(amount),
      reference,
      currency: 'NGN',
    })
    return {
      status: d.status === 'success' ? 'success' : d.status === 'failed' ? 'failed' : 'pending',
    }
  },

  async refund({ reference, amount }) {
    const d = await call<{ status: string }>('/refund', {
      transaction: reference,
      amount: toKobo(amount),
    })
    return {
      status: d.status === 'processed' ? 'processed' : d.status === 'failed' ? 'failed' : 'pending',
    }
  },
}
