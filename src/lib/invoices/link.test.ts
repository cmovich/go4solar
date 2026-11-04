import { describe, expect, it } from 'vitest'

import { signInvoiceLink, verifyInvoiceLink } from './link'

const SECRET = 'local-test-only-invoice-link-secret-0123456789'
const ID = '11111111-1111-4111-8111-111111111111'
const now = new Date('2026-11-04T10:00:00Z')

describe('signed invoice links (open without a sign-in cookie, like the agreement)', () => {
  it('a fresh link opens; it lasts 30 minutes', () => {
    const { exp, sig } = signInvoiceLink(ID, now, SECRET)
    expect(verifyInvoiceLink(ID, exp, sig, now, SECRET)).toBe(true)
    expect(verifyInvoiceLink(ID, exp, sig, new Date(now.getTime() + 29 * 60_000), SECRET)).toBe(
      true,
    )
    expect(verifyInvoiceLink(ID, exp, sig, new Date(now.getTime() + 31 * 60_000), SECRET)).toBe(
      false,
    )
  })

  it('a link for one invoice does not open another; a changed time or signature fails', () => {
    const { exp, sig } = signInvoiceLink(ID, now, SECRET)
    expect(verifyInvoiceLink('22222222-2222-4222-8222-222222222222', exp, sig, now, SECRET)).toBe(
      false,
    )
    expect(verifyInvoiceLink(ID, String(Number(exp) + 1), sig, now, SECRET)).toBe(false)
    expect(
      verifyInvoiceLink(
        ID,
        exp,
        sig.replace(/.$/, '0'),
        now,
        'another-secret-xxxxxxxxxxxxxxxxxxxx',
      ),
    ).toBe(false)
    expect(verifyInvoiceLink(ID, 'x', 'y', now, SECRET)).toBe(false)
  })

  it('no secret → no link (never signed with an empty key)', () => {
    expect(() => signInvoiceLink(ID, now, '')).toThrow()
    const { exp, sig } = signInvoiceLink(ID, now, SECRET)
    expect(verifyInvoiceLink(ID, exp, sig, now, '')).toBe(false)
  })
})
