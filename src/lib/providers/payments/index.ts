import { MockInProductionError, deployEnv, mockProvidersAllowed } from '@/lib/testmode/policy'

/**
 * Payments provider interface. Amounts here are in naira; adapters convert (Paystack uses kobo).
 * Never trust a browser redirect alone: after checkout the server calls verify(reference).
 */
export type VerifiedPayment = {
  reference: string
  status: 'success' | 'failed' | 'pending'
  /** Naira actually paid. */
  amount: number
  /** Provider fee in naira (Go4Solar absorbs it; recorded for profit reports). */
  fee: number
  paidAt: string | null
  channel: string | null
  /** The provider's transaction id: the webhook uses the same id, so both paths are one event. */
  providerId: string | null
}

export type MandateResult = {
  status: 'pending' | 'active' | 'failed'
  authorizationUrl?: string
  reason?: string
}

export type VerifiedMandate = {
  status: 'pending' | 'active' | 'failed'
  authorizationCode: string | null
  bankName: string | null
  last4: string | null
}

export type PaymentsProvider = {
  name: 'mock' | 'paystack'
  /** One-off checkout (card, transfer, USSD): the deposit, or an instalment paid by hand. */
  initDeposit(input: {
    email: string
    amount: number
    reference: string
    callbackUrl: string
    metadata?: Record<string, unknown>
  }): Promise<{ authorizationUrl: string }>
  verify(reference: string): Promise<VerifiedPayment>
  createMandate(input: {
    email: string
    reference: string
    callbackUrl: string
    bankCode?: string
    account?: string
  }): Promise<MandateResult>
  verifyMandate(reference: string): Promise<VerifiedMandate>
  chargeMandate(input: {
    authorizationCode: string
    email: string
    amount: number
    reference: string
  }): Promise<{ status: 'success' | 'pending' | 'failed' }>
  refund(input: {
    reference: string
    amount: number
  }): Promise<{ status: 'pending' | 'processed' | 'failed' }>
}

/** PAYMENTS_PROVIDER=mock (default) | paystack. */
export async function getPaymentsProvider(): Promise<PaymentsProvider> {
  if (process.env.PAYMENTS_PROVIDER === 'paystack') {
    return (await import('./paystack')).paystackPaymentsProvider
  }
  if (!mockProvidersAllowed(deployEnv())) throw new MockInProductionError('Payments')
  return (await import('./mock')).mockPaymentsProvider
}

/** 'mock' only where mocks are allowed (never production): the mock checkout pages key off this. */
export const paymentsMode = (): 'mock' | 'paystack' =>
  process.env.PAYMENTS_PROVIDER === 'paystack' || !mockProvidersAllowed(deployEnv())
    ? 'paystack'
    : 'mock'
