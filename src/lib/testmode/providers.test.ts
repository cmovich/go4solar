import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))

const { getKycProvider } = await import('@/lib/providers/kyc')
const { getPaymentsProvider, paymentsMode } = await import('@/lib/providers/payments')
const { getMessagingProvider } = await import('@/lib/providers/messaging')
const { getVisionProvider } = await import('@/lib/providers/vision')

const saved = { ...process.env }
afterEach(() => {
  process.env = { ...saved }
})

describe('mock providers cannot run in production', () => {
  it('production with a missing or mock setting fails closed for every provider', async () => {
    process.env.VERCEL_ENV = 'production'
    for (const k of ['KYC_PROVIDER', 'PAYMENTS_PROVIDER', 'MESSAGING_PROVIDER', 'VISION_PROVIDER'])
      delete process.env[k]
    await expect(getKycProvider()).rejects.toThrow(/disabled in production/)
    await expect(getPaymentsProvider()).rejects.toThrow(/disabled in production/)
    // Messaging never throws (Prompt 16A): no mock in production, messages are kept as not_sent.
    expect((await getMessagingProvider()).name).toBe('unsent')
    await expect(getVisionProvider()).rejects.toThrow(/disabled in production/)
    process.env.KYC_PROVIDER = 'mock'
    await expect(getKycProvider()).rejects.toThrow(/disabled in production/)
    // The mock checkout pages key off paymentsMode(): never "mock" in production.
    expect(paymentsMode()).not.toBe('mock')
  })

  it('previews and local runs still use the mocks', async () => {
    process.env.VERCEL_ENV = 'preview'
    delete process.env.KYC_PROVIDER
    expect((await getKycProvider()).name).toBe('mock')
    delete process.env.VERCEL_ENV
    expect((await getPaymentsProvider()).name).toBe('mock')
    expect(paymentsMode()).toBe('mock')
  })
})
