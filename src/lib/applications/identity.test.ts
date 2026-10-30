import { describe, expect, it } from 'vitest'

import { applicationForNewQuote, sameApplicant } from './identity'

describe('sameApplicant (signed-in account vs the new quote)', () => {
  const moses = { fullName: 'Moses Donatus', phone: '+2348031110000' }
  it('same name and phone → same person (case and spaces ignored)', () => {
    expect(sameApplicant(moses, { fullName: '  moses  DONATUS ', phone: '+2348031110000' })).toBe(
      true,
    )
  })
  it('a different name → not the same person', () => {
    expect(sameApplicant(moses, { fullName: 'Love Lounge', phone: '+2348031110000' })).toBe(false)
  })
  it('a different phone → not the same person', () => {
    expect(sameApplicant(moses, { fullName: 'Moses Donatus', phone: '+2348039990000' })).toBe(false)
  })
  it('an account with no name or phone yet only compares what it has', () => {
    expect(
      sameApplicant(
        { fullName: null, phone: null },
        { fullName: 'Love Lounge', phone: '+2348039990000' },
      ),
    ).toBe(true)
    expect(
      sameApplicant(
        { fullName: null, phone: '+2348031110000' },
        { fullName: 'Love Lounge', phone: '+2348039990000' },
      ),
    ).toBe(false)
  })
})

describe('applicationForNewQuote (a newer chosen quote and the existing application)', () => {
  const base = { consumerSigned: false, guarantorSigned: false }
  it('no application yet → new', () => {
    expect(applicationForNewQuote({ ...base, app: null, latestQuoteId: 'q2' })).toBe('new')
  })
  it('the application already uses the newest quote → keep', () => {
    expect(
      applicationForNewQuote({
        ...base,
        app: { status: 'draft', quoteId: 'q2' },
        latestQuoteId: 'q2',
      }),
    ).toBe('keep')
  })
  it('a declined application → a new one for the new quote', () => {
    expect(
      applicationForNewQuote({
        ...base,
        app: { status: 'declined', quoteId: 'q1' },
        latestQuoteId: 'q2',
      }),
    ).toBe('new')
  })
  it('an unsigned draft moves to the new quote', () => {
    expect(
      applicationForNewQuote({
        ...base,
        app: { status: 'draft', quoteId: 'q1' },
        latestQuoteId: 'q2',
      }),
    ).toBe('switch')
  })
  it('a draft that anyone has signed, or anything submitted, stays: the new quote waits', () => {
    expect(
      applicationForNewQuote({
        consumerSigned: true,
        guarantorSigned: false,
        app: { status: 'draft', quoteId: 'q1' },
        latestQuoteId: 'q2',
      }),
    ).toBe('blocked')
    expect(
      applicationForNewQuote({
        consumerSigned: false,
        guarantorSigned: true,
        app: { status: 'draft', quoteId: 'q1' },
        latestQuoteId: 'q2',
      }),
    ).toBe('blocked')
    for (const status of ['submitted', 'under_review', 'approved', 'more_info'] as const) {
      expect(
        applicationForNewQuote({ ...base, app: { status, quoteId: 'q1' }, latestQuoteId: 'q2' }),
      ).toBe('blocked')
    }
  })
  it('no chosen quote at all → keep whatever exists', () => {
    expect(
      applicationForNewQuote({
        ...base,
        app: { status: 'draft', quoteId: 'q1' },
        latestQuoteId: null,
      }),
    ).toBe('keep')
  })
})
