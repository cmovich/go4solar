import { describe, expect, it } from 'vitest'

import { parsePaystackEvent } from './events'

describe('parsePaystackEvent', () => {
  it('charge.success → reference, amount and fee in kobo, a stable event id', () => {
    const ev = parsePaystackEvent({
      event: 'charge.success',
      data: {
        id: 302961,
        reference: 'G4S-DEP-ABC',
        amount: 30847800,
        fees: 200000,
        status: 'success',
        paid_at: '2026-10-11T10:00:00.000Z',
        channel: 'card',
        customer: { email: 'ada@x.test' },
      },
    })
    expect(ev).toEqual({
      type: 'charge.success',
      eventId: 'charge.success:302961',
      reference: 'G4S-DEP-ABC',
      amountKobo: 30847800,
      feesKobo: 200000,
      paidAt: '2026-10-11T10:00:00.000Z',
      channel: 'card',
    })
  })

  it('charge.failed', () => {
    expect(
      parsePaystackEvent({ event: 'charge.failed', data: { id: 9, reference: 'R', amount: 100 } }),
    ).toMatchObject({ type: 'charge.failed', eventId: 'charge.failed:9', reference: 'R' })
  })

  it('direct debit mandate active → authorization code, bank and last 4 only', () => {
    const ev = parsePaystackEvent({
      event: 'direct_debit.authorization.active',
      data: {
        authorization_code: 'AUTH_abc123',
        active: true,
        last4: '1234',
        bank: 'Guaranty Trust Bank',
        reference: 'G4S-MDT-XYZ',
        customer: { email: 'ada@x.test' },
      },
    })
    expect(ev).toEqual({
      type: 'mandate.active',
      eventId: 'mandate.active:AUTH_abc123',
      reference: 'G4S-MDT-XYZ',
      email: 'ada@x.test',
      authorizationCode: 'AUTH_abc123',
      bankName: 'Guaranty Trust Bank',
      last4: '1234',
    })
  })

  it('refund.processed → the original transaction reference', () => {
    expect(
      parsePaystackEvent({
        event: 'refund.processed',
        data: { id: 77, transaction_reference: 'G4S-DEP-ABC', amount: 30847800 },
      }),
    ).toEqual({
      type: 'refund.processed',
      eventId: 'refund.processed:77',
      transactionReference: 'G4S-DEP-ABC',
      amountKobo: 30847800,
    })
  })

  it('anything else (or malformed) is ignored', () => {
    expect(parsePaystackEvent({ event: 'transfer.success', data: {} }).type).toBe('ignored')
    expect(parsePaystackEvent({ event: 'charge.success', data: { reference: 'x' } }).type).toBe(
      'ignored',
    )
    expect(parsePaystackEvent('nonsense').type).toBe('ignored')
  })
})
