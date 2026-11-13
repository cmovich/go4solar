import { beforeEach, describe, expect, it, vi } from 'vitest'

import { SEEDED_PLANS } from '@/lib/readyPlans/plans.fixture'

const plan = { ...SEEDED_PLANS.find((p) => p.slug === 'oga-boss')!, id: 'p-oga', sample: false }
let mode: 'live' | 'prelaunch' = 'prelaunch'
let allowed = true
vi.mock('@/config/site', () => ({ launchMode: () => mode }))
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'x-forwarded-for': '1.2.3.4' }),
}))
vi.mock('@/lib/ratelimit/hitRateLimit', () => ({ hitRateLimit: async () => allowed }))
vi.mock('@/lib/site/origin', () => ({ originFor: () => 'https://go4solar.app' }))
vi.mock('@/lib/quotes/leadForPlans', () => ({ quoteValidityDays: async () => 7 }))
vi.mock('@/lib/readyPlans/server', async (orig) => ({
  ...(await orig<typeof import('@/lib/readyPlans/server')>()),
  loadReadyPlan: async (slug: string) => (slug === 'oga-boss' ? plan : null),
  loadDeliveryRows: async () => [
    {
      state: 'Lagos',
      amount: 65_000,
      extraPerPanel: 0,
      localVendorsAvailable: false,
      sample: false,
    },
  ],
}))
const saveBuiltSystem = vi.fn()
vi.mock('@/lib/build/save', () => ({ saveBuiltSystem: (...a: unknown[]) => saveBuiltSystem(...a) }))
const ensureInvoiceForQuote = vi.fn()
const quotationForReadyPlan = vi.fn()
vi.mock('@/lib/invoices/server', () => ({
  ensureInvoiceForQuote: (...a: unknown[]) => ensureInvoiceForQuote(...a),
  quotationForReadyPlan: (...a: unknown[]) => quotationForReadyPlan(...a),
}))

const { acceptReadyPlan, readyPlanQuotation } = await import('./actions')

const contact = {
  firstName: 'Ada',
  surname: 'Obi',
  phone: '08031234567',
  email: 'ada@example.com',
  lga: 'Ikeja',
  consent: true,
}
const choice = { slug: 'oga-boss', months: 12, state: 'Lagos', site: { mounting: 'roof' } }

beforeEach(() => {
  mode = 'prelaunch'
  allowed = true
  saveBuiltSystem.mockReset()
  ensureInvoiceForQuote.mockReset()
  quotationForReadyPlan.mockReset()
})

describe('readyPlanQuotation ("Your quotation" before any details)', () => {
  it('the fixed-plan quotation for the chosen months and state; nothing saved', async () => {
    quotationForReadyPlan.mockResolvedValue({ ok: true, id: null, invoice: { number: 'X' } })
    expect(await readyPlanQuotation(choice)).toMatchObject({ ok: true, doc: { number: 'X' } })
    const stored = quotationForReadyPlan.mock.calls[0]![0]
    expect(stored).toMatchObject({
      kind: 'ready',
      plan: { slug: 'oga-boss' },
      fixed: { extra: { state: 'Lagos', amount: 45_000 } },
    })
    expect(saveBuiltSystem).not.toHaveBeenCalled()
  })
  it('SAMPLE prices: no document (price confirmed when we contact you)', async () => {
    quotationForReadyPlan.mockResolvedValue({ ok: false, reason: 'sample' })
    expect(await readyPlanQuotation(choice)).toEqual({ ok: true, doc: null })
  })
  it('refuses a plan that is not on, a length it does not offer or a state that does not exist', async () => {
    expect(await readyPlanQuotation({ ...choice, slug: 'gone' })).toMatchObject({ ok: false })
    expect(await readyPlanQuotation({ ...choice, months: 24 })).toMatchObject({ ok: false })
    expect(await readyPlanQuotation({ ...choice, state: 'Narnia' })).toMatchObject({ ok: false })
  })
})

describe('acceptReadyPlan ("Accept and apply")', () => {
  it('prelaunch: the normal sign-up from the plan (accepted), then the thank-you', async () => {
    saveBuiltSystem.mockResolvedValue({ ok: true, leadId: 'lead-1', quoteId: null })
    expect(await acceptReadyPlan({ ...choice, contact })).toEqual({ ok: true, next: null })
    expect(saveBuiltSystem).toHaveBeenCalledWith(
      expect.objectContaining({
        live: false,
        accepted: { enteredBy: null, channel: 'ready plan' },
        stored: expect.objectContaining({
          kind: 'ready',
          plan: { slug: 'oga-boss', name: 'Oga Boss' },
        }),
      }),
    )
  })
  it('live: the quote, its invoice, then the account step (phone code, ID checks)', async () => {
    mode = 'live'
    saveBuiltSystem.mockResolvedValue({ ok: true, leadId: 'lead-1', quoteId: 'q-1' })
    ensureInvoiceForQuote.mockResolvedValue({ ok: true })
    expect(await acceptReadyPlan({ ...choice, contact })).toEqual({
      ok: true,
      next: '/account?quote=q-1',
    })
    expect(ensureInvoiceForQuote).toHaveBeenCalledWith('q-1', 'https://go4solar.app')
  })
  it('missing details or too many tries: nothing saved', async () => {
    expect(
      await acceptReadyPlan({ ...choice, contact: { ...contact, consent: false } }),
    ).toMatchObject({
      ok: false,
    })
    allowed = false
    expect(await acceptReadyPlan({ ...choice, contact })).toMatchObject({ ok: false })
    expect(saveBuiltSystem).not.toHaveBeenCalled()
  })
})
