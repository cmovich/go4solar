import { describe, expect, it } from 'vitest'

import {
  GUARANTOR_RELATIONSHIPS,
  guarantorRelationshipSchema,
  splitRelationship,
} from './relationships'

describe('guarantor relationship (dropdown)', () => {
  it('lists the options in order, ending with Other', () => {
    expect(GUARANTOR_RELATIONSHIPS).toEqual([
      'Spouse',
      'Parent',
      'Brother',
      'Sister',
      'Child',
      'Other relative',
      'Friend',
      'Colleague',
      'Employer',
      'Mentor',
      'Religious leader',
      'Other',
    ])
  })

  it('stores a listed option as it is', () => {
    expect(guarantorRelationshipSchema.parse({ relationship: 'Employer' })).toBe('Employer')
  })

  it('Other needs a short description, stored as "Other: …"', () => {
    expect(
      guarantorRelationshipSchema.safeParse({ relationship: 'Other', relationshipOther: ' ' })
        .success,
    ).toBe(false)
    expect(
      guarantorRelationshipSchema.parse({ relationship: 'Other', relationshipOther: ' Landlord ' }),
    ).toBe('Other: Landlord')
    expect(
      guarantorRelationshipSchema.safeParse({
        relationship: 'Other',
        relationshipOther: 'x'.repeat(41),
      }).success,
    ).toBe(false)
  })

  it('refuses anything not on the list', () => {
    expect(guarantorRelationshipSchema.safeParse({ relationship: 'brother' }).success).toBe(false)
    expect(guarantorRelationshipSchema.safeParse({}).success).toBe(false)
  })

  it('splits a stored value back into the dropdown and the text box (old free text → Other)', () => {
    expect(splitRelationship('Sister')).toEqual({ relationship: 'Sister', relationshipOther: '' })
    expect(splitRelationship('Other: Landlord')).toEqual({
      relationship: 'Other',
      relationshipOther: 'Landlord',
    })
    expect(splitRelationship('my uncle')).toEqual({
      relationship: 'Other',
      relationshipOther: 'my uncle',
    })
    expect(splitRelationship('')).toEqual({ relationship: '', relationshipOther: '' })
  })
})
