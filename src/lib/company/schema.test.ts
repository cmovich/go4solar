import { describe, expect, it } from 'vitest'

import { companyFormSchema, companyFrom, DEFAULT_COMPANY } from './schema'

describe('company details (settings.company)', () => {
  it('defaults: the details agreed for Part I', () => {
    expect(DEFAULT_COMPANY).toEqual({
      name: 'Go4Solar Energy Limited',
      address: 'Suite 40, Jayjay Shopping Complex, Kaduna',
      phone: '08182112423',
      email: 'contact@go4solar.app',
      website: 'www.go4solar.app',
      rcNumber: null,
    })
  })

  it('a missing or broken setting falls back to the defaults, field by field', () => {
    expect(companyFrom(null)).toEqual(DEFAULT_COMPANY)
    expect(companyFrom({ name: 'X Ltd', phone: 5 })).toEqual({ ...DEFAULT_COMPANY, name: 'X Ltd' })
  })

  it('the form: required fields, a real email, validity 1–90 days, RC number optional', () => {
    const ok = { ...DEFAULT_COMPANY, rcNumber: '', quoteValidityDays: 7 }
    expect(companyFormSchema.safeParse(ok).success).toBe(true)
    expect(companyFormSchema.parse({ ...ok, rcNumber: ' RC 123 ' }).rcNumber).toBe('RC 123')
    expect(companyFormSchema.parse(ok).rcNumber).toBeNull()
    expect(companyFormSchema.safeParse({ ...ok, name: ' ' }).success).toBe(false)
    expect(companyFormSchema.safeParse({ ...ok, email: 'nope' }).success).toBe(false)
    expect(companyFormSchema.safeParse({ ...ok, quoteValidityDays: 0 }).success).toBe(false)
    expect(companyFormSchema.safeParse({ ...ok, quoteValidityDays: 91 }).success).toBe(false)
  })
})
