import { describe, expect, it } from 'vitest'

import {
  DELETE_REASONS,
  canDeleteWaitlist,
  deleteReasonSchema,
  possibleDuplicates,
} from './duplicates'

describe('possibleDuplicates', () => {
  it('flags every entry whose phone matches another entry', () => {
    const d = possibleDuplicates([
      { id: 'a', phone: '+2348031234567', email: null },
      { id: 'b', phone: '+2348031234567', email: 'b@example.org' },
      { id: 'c', phone: '+2348039999999', email: null },
    ])
    expect(d.get('a')).toEqual({ phone: ['b'], email: [] })
    expect(d.get('b')).toEqual({ phone: ['a'], email: [] })
    expect(d.has('c')).toBe(false)
  })

  it('matches email ignoring case and spaces', () => {
    const d = possibleDuplicates([
      { id: 'a', phone: '+2348030000001', email: ' Ada@Example.org ' },
      { id: 'b', phone: '+2348030000002', email: 'ada@example.org' },
    ])
    expect(d.get('a')).toEqual({ phone: [], email: ['b'] })
    expect(d.get('b')).toEqual({ phone: [], email: ['a'] })
  })

  it('never matches on an empty email', () => {
    const d = possibleDuplicates([
      { id: 'a', phone: '+2348030000001', email: '' },
      { id: 'b', phone: '+2348030000002', email: null },
      { id: 'c', phone: '+2348030000003', email: '  ' },
    ])
    expect(d.size).toBe(0)
  })

  it('lists both reasons when phone and email both match', () => {
    const d = possibleDuplicates([
      { id: 'a', phone: '+2348030000001', email: 'x@example.org' },
      { id: 'b', phone: '+2348030000001', email: 'x@example.org' },
      { id: 'c', phone: '+2348030000009', email: 'x@example.org' },
    ])
    expect(d.get('a')).toEqual({ phone: ['b'], email: ['b', 'c'] })
    expect(d.get('c')).toEqual({ phone: [], email: ['a', 'b'] })
  })
})

describe('deleteReasonSchema', () => {
  it('accepts the three reasons; Other needs text', () => {
    expect(DELETE_REASONS).toEqual(['duplicate', 'test', 'other'])
    expect(deleteReasonSchema.safeParse({ reason: 'duplicate' }).success).toBe(true)
    expect(deleteReasonSchema.safeParse({ reason: 'test' }).success).toBe(true)
    expect(deleteReasonSchema.safeParse({ reason: 'other' }).success).toBe(false)
    expect(deleteReasonSchema.safeParse({ reason: 'other', note: '  ' }).success).toBe(false)
    const ok = deleteReasonSchema.safeParse({ reason: 'other', note: ' Asked to be removed ' })
    expect(ok.success && ok.data.note).toBe('Asked to be removed')
    expect(deleteReasonSchema.safeParse({ reason: 'spam' }).success).toBe(false)
  })

  it('limits the text to 300 characters', () => {
    expect(deleteReasonSchema.safeParse({ reason: 'other', note: 'x'.repeat(301) }).success).toBe(
      false,
    )
  })
})

describe('canDeleteWaitlist', () => {
  it('super admin always; other staff only with the permission; never non-staff', () => {
    expect(canDeleteWaitlist('super_admin', false)).toBe(true)
    expect(canDeleteWaitlist('operations', true)).toBe(true)
    expect(canDeleteWaitlist('operations', false)).toBe(false)
    expect(canDeleteWaitlist('content', false)).toBe(false)
    expect(canDeleteWaitlist('consumer', true)).toBe(false)
    expect(canDeleteWaitlist(null, true)).toBe(false)
  })
})
