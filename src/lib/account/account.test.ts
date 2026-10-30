import { describe, expect, it } from 'vitest'

import {
  amountLeft,
  changeRequestSchema,
  formatAddress,
  nextPayment,
  whatHappensNext,
  type NextInput,
} from './account'

const base: NextInput = {
  status: 'draft',
  reviewed: true,
  consumerSigned: true,
  guarantorSigned: true,
  guarantorName: 'Ada Obi',
  depositPaid: true,
  loanStatus: null,
  job: null,
  nextDue: null,
}

describe('whatHappensNext (one plain sentence for the account page)', () => {
  it('walks the journey in order', () => {
    expect(whatHappensNext({ ...base, reviewed: false })).toMatch(/^Finish your application/)
    expect(whatHappensNext({ ...base, consumerSigned: false })).toMatch(
      /^Read and sign your payment plan agreement/,
    )
    expect(whatHappensNext({ ...base, guarantorSigned: false })).toBe(
      'We are waiting for your guarantor, Ada Obi, to sign. We have sent them a link.',
    )
    expect(whatHappensNext({ ...base, depositPaid: false })).toMatch(/^Pay your deposit/)
    expect(whatHappensNext({ ...base, status: 'submitted' })).toBe(
      'We are reviewing your application and will reply within 48 hours.',
    )
    expect(whatHappensNext({ ...base, status: 'more_info' })).toMatch(
      /^We need a little more information/,
    )
    expect(whatHappensNext({ ...base, status: 'approved', loanStatus: 'approved' })).toMatch(
      /^Approved!/,
    )
    expect(
      whatHappensNext({
        ...base,
        status: 'approved',
        loanStatus: 'approved',
        job: { installer: 'Bayo Installs', date: '2026-11-04', status: 'assigned' },
      }),
    ).toBe('Bayo Installs will install your system on 4 Nov 2026.')
    expect(
      whatHappensNext({
        ...base,
        status: 'approved',
        loanStatus: 'approved',
        job: { installer: 'Bayo Installs', date: null, status: 'installed' },
      }),
    ).toMatch(/^Your system is installed/)
    expect(
      whatHappensNext({
        ...base,
        status: 'approved',
        loanStatus: 'active',
        nextDue: { amount: 120000, dueDate: '2026-12-04' },
      }),
    ).toBe('Your next payment of ₦120,000 is due on 4 Dec 2026.')
    expect(whatHappensNext({ ...base, status: 'approved', loanStatus: 'completed' })).toMatch(
      /fully paid/i,
    )
    expect(whatHappensNext({ ...base, status: 'declined' })).toMatch(/could not approve/)
  })
})

describe('payments', () => {
  const schedule = [
    { n: 1, dueDate: '2026-12-04', amount: 100000, paidAmount: 100000, status: 'paid' as const },
    { n: 2, dueDate: '2027-01-04', amount: 100000, paidAmount: 40000, status: 'due' as const },
    { n: 3, dueDate: '2027-02-04', amount: 100000, paidAmount: 0, status: 'due' as const },
  ]
  it('next payment: the first month not fully paid, with what is still owed on it', () => {
    expect(nextPayment(schedule)).toEqual({
      n: 2,
      dueDate: '2027-01-04',
      amount: 60000,
      late: false,
    })
    expect(nextPayment([{ ...schedule[0]! }])).toBeNull()
  })
  it('a late month shows as late', () => {
    expect(nextPayment([{ ...schedule[2]!, status: 'late' }])!.late).toBe(true)
  })
  it('amount left: everything not yet paid; before the schedule exists, the financed balance', () => {
    expect(amountLeft(schedule, 300000)).toBe(160000)
    expect(amountLeft([], 300000)).toBe(300000)
  })
})

describe('change requests', () => {
  it('needs a known detail and a new value; phones are normalised', () => {
    expect(changeRequestSchema.safeParse({ field: 'name', newValue: 'Love Lounge' }).success).toBe(
      true,
    )
    expect(changeRequestSchema.safeParse({ field: 'pin', newValue: 'x' }).success).toBe(false)
    expect(changeRequestSchema.safeParse({ field: 'name', newValue: ' ' }).success).toBe(false)
    const p = changeRequestSchema.safeParse({ field: 'phone', newValue: '0803 123 4567' })
    expect(p.success && p.data.newValue).toBe('+2348031234567')
    expect(changeRequestSchema.safeParse({ field: 'phone', newValue: '12345' }).success).toBe(false)
    expect(
      changeRequestSchema.safeParse({ field: 'email', newValue: 'not-an-email' }).success,
    ).toBe(false)
  })
  it('formats an address on one line', () => {
    expect(
      formatAddress({ line1: '12 Allen Avenue', city: 'Ikeja', lga: 'Ikeja', state: 'Lagos' }),
    ).toBe('12 Allen Avenue, Ikeja, Ikeja LGA, Lagos')
    expect(formatAddress(null)).toBeNull()
  })
})
