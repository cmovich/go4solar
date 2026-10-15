import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { paystackPaymentsProvider as paystack } from './paystack'

type Call = {
  url: string
  method: string
  body: Record<string, unknown> | null
  auth: string | null
}
const calls: Call[] = []
let reply: unknown = { status: true, data: {} }

beforeEach(() => {
  calls.length = 0
  process.env.PAYSTACK_SECRET_KEY = 'sk_test_unit'
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    calls.push({
      url,
      method: init.method ?? 'GET',
      body: init.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null,
      auth: new Headers(init.headers).get('authorization'),
    })
    return new Response(JSON.stringify(reply), { status: 200 })
  })
})
afterEach(() => vi.unstubAllGlobals())

describe('Paystack adapter', () => {
  it('initDeposit sends the amount in kobo to /transaction/initialize', async () => {
    reply = { status: true, data: { authorization_url: 'https://checkout.paystack.com/abc' } }
    const r = await paystack.initDeposit({
      email: 'ada@x.test',
      amount: 308478,
      reference: 'G4S-DEP-1',
      callbackUrl: 'http://localhost/cb',
    })
    expect(r).toEqual({ authorizationUrl: 'https://checkout.paystack.com/abc' })
    expect(calls[0]).toMatchObject({
      url: 'https://api.paystack.co/transaction/initialize',
      method: 'POST',
      auth: 'Bearer sk_test_unit',
    })
    expect(calls[0]!.body).toMatchObject({
      amount: 30847800,
      reference: 'G4S-DEP-1',
      email: 'ada@x.test',
    })
    expect(calls[0]!.body!.channels).toEqual(['card', 'bank_transfer', 'ussd', 'bank'])
  })

  it('verify reads kobo back as naira, with the fee', async () => {
    reply = {
      status: true,
      data: {
        id: 55,
        status: 'success',
        reference: 'G4S-DEP-1',
        amount: 30847800,
        fees: 200000,
        paid_at: '2026-10-11T10:00:00Z',
        channel: 'card',
      },
    }
    const v = await paystack.verify('G4S-DEP-1')
    expect(calls[0]!.url).toBe('https://api.paystack.co/transaction/verify/G4S-DEP-1')
    expect(v).toMatchObject({
      status: 'success',
      amount: 308478,
      fee: 2000,
      providerId: '55',
      channel: 'card',
    })
  })

  it('chargeMandate and refund send kobo too', async () => {
    reply = { status: true, data: { status: 'success' } }
    await paystack.chargeMandate({
      authorizationCode: 'AUTH_x',
      email: 'a@x.test',
      amount: 102826,
      reference: 'G4S-INS-1',
    })
    expect(calls[0]).toMatchObject({
      url: 'https://api.paystack.co/transaction/charge_authorization',
    })
    expect(calls[0]!.body).toMatchObject({ authorization_code: 'AUTH_x', amount: 10282600 })
    reply = { status: true, data: { status: 'pending', id: 9 } }
    await paystack.refund({ reference: 'G4S-DEP-1', amount: 308478 })
    expect(calls[1]).toMatchObject({ url: 'https://api.paystack.co/refund' })
    expect(calls[1]!.body).toEqual({ transaction: 'G4S-DEP-1', amount: 30847800 })
  })

  it('createMandate starts a direct-debit authorisation', async () => {
    reply = {
      status: true,
      data: { redirect_url: 'https://link.paystack.com/x', reference: 'G4S-MDT-1' },
    }
    const r = await paystack.createMandate({
      email: 'a@x.test',
      reference: 'G4S-MDT-1',
      callbackUrl: 'http://localhost/cb',
    })
    expect(calls[0]!.url).toBe('https://api.paystack.co/customer/authorization/initialize')
    expect(calls[0]!.body).toMatchObject({ email: 'a@x.test', channel: 'direct_debit' })
    expect(r).toEqual({ status: 'pending', authorizationUrl: 'https://link.paystack.com/x' })
  })

  it('a Paystack error becomes a thrown error without the secret key in it', async () => {
    reply = { status: false, message: 'Invalid key' }
    await expect(paystack.verify('x')).rejects.toThrow(/Invalid key/)
    await expect(paystack.verify('x')).rejects.not.toThrow(/sk_test_unit/)
  })
})
