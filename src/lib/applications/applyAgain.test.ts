import { describe, expect, it } from 'vitest'

import { applyAgainState, mayApplyAgainFlag } from './applyAgain'

const now = new Date('2026-11-24T10:00:00Z')
const flag = { by: 'ops-1', at: '2026-11-23T09:00:00Z', note: 'Try again with a guarantor' }
const valid: { validUntil: string; readySlug: string | null; isBuilder: boolean } = {
  validUntil: '2026-11-30T00:00:00Z',
  readySlug: null,
  isBuilder: false,
}

describe('mayApplyAgainFlag', () => {
  it('reads the tick from the application flags; anything else is no tick', () => {
    expect(mayApplyAgainFlag({ mayApplyAgain: flag, noAutoPay: true })).toEqual(flag)
    expect(mayApplyAgainFlag({ noAutoPay: true })).toBeNull()
    expect(mayApplyAgainFlag(null)).toBeNull()
    expect(mayApplyAgainFlag({ mayApplyAgain: { at: 'x' } })).toBeNull()
  })
})

describe('applyAgainState', () => {
  it('hidden unless declined AND "Customer may apply again" was ticked', () => {
    expect(applyAgainState({ status: 'declined', creditFlags: {}, quote: valid, now })).toEqual({
      kind: 'hidden',
    })
    expect(
      applyAgainState({
        status: 'submitted',
        creditFlags: { mayApplyAgain: flag },
        quote: valid,
        now,
      }),
    ).toEqual({ kind: 'hidden' })
    expect(
      applyAgainState({
        status: 'declined',
        creditFlags: { mayApplyAgain: flag },
        quote: null,
        now,
      }),
    ).toEqual({
      kind: 'hidden',
    })
  })

  it('quotation still valid: apply again with the same quotation', () => {
    expect(
      applyAgainState({
        status: 'declined',
        creditFlags: { mayApplyAgain: flag },
        quote: valid,
        now,
      }),
    ).toEqual({ kind: 'same-quote' })
  })

  it('quotation expired: a new quotation first (new figures shown), from where it came from', () => {
    const expired = { ...valid, validUntil: '2026-11-20T00:00:00Z' }
    const s = (q: typeof valid) =>
      applyAgainState({ status: 'declined', creditFlags: { mayApplyAgain: flag }, quote: q, now })
    expect(s(expired)).toEqual({ kind: 'new-quote', path: '/get-started' })
    expect(s({ ...expired, isBuilder: true })).toEqual({ kind: 'new-quote', path: '/build' })
    expect(s({ ...expired, readySlug: 'oga-boss' })).toEqual({
      kind: 'new-quote',
      path: '/plans/oga-boss',
    })
  })
})
