import { describe, expect, it } from 'vitest'

import { canExport, canTickConsent } from '@/lib/auth/staffRoles'
import type { ProfileValues } from '@/lib/tradeLenda/profile'

import { activeConsent, exportReadiness, readinessLabel, type FunderConsent } from './readiness'

const TL = 'tl-funder'
const SP = 'sp-funder'

const basic: ProfileValues = {
  customerType: 'individual',
  businessName: null,
  contactRole: null,
  firstName: 'Ada',
  surname: 'Obi',
  phone: '+2348031234567',
  whatsapp: '+2348031234567',
  email: 'ada@example.test',
  dateOfBirth: null,
  state: 'Kaduna',
  lga: 'Kaduna North',
  street: '12 Ali Akilu Road',
  landmark: 'Near the market',
  employmentType: null,
  incomeRange: null,
  guarantorName: null,
  guarantorPhone: null,
  guarantorRelationship: null,
  planKind: 'ready',
  planRef: 'oga-boss',
  depositShare: 0.2,
  months: 12,
}
const full: ProfileValues = {
  ...basic,
  dateOfBirth: '1990-05-14',
  employmentType: 'employed',
  incomeRange: '250k_500k',
  guarantorName: 'Ngozi Eze',
  guarantorPhone: '+2348069999999',
  guarantorRelationship: 'Sister',
}
const ticked = { phoneVerifiedAt: '2026-11-23T10:00:00Z', figuresAgreedAt: '2026-11-23T10:05:00Z' }
const consentTL: FunderConsent[] = [
  { funderId: TL, consentedAt: '2026-11-23T10:02:00Z', withdrawnAt: null },
]

describe('activeConsent', () => {
  it('only for the funder named, and not once withdrawn', () => {
    expect(activeConsent(consentTL, TL)).toBe(true)
    expect(activeConsent(consentTL, SP)).toBe(false)
    expect(activeConsent([{ ...consentTL[0]!, withdrawnAt: '2026-11-24T09:00:00Z' }], TL)).toBe(
      false,
    )
  })
})

describe('exportReadiness (per funder)', () => {
  it('basic fields + phone confirmed + figures agreed + consent for THAT funder → Basic', () => {
    const r = exportReadiness(basic, ticked, consentTL, TL)
    expect(r.level).toBe('basic')
    expect(r.basicMissing).toEqual([])
    expect(r.fullMissing).toEqual([
      'date of birth',
      'work',
      'income',
      'guarantor name',
      'guarantor phone',
      'guarantor relationship',
    ])
  })

  it('everything filled in → Full', () => {
    expect(exportReadiness(full, ticked, consentTL, TL).level).toBe('full')
  })

  it('no consent for this funder → nothing can go to it (other funders unaffected)', () => {
    const r = exportReadiness(full, ticked, consentTL, SP)
    expect(r.level).toBeNull()
    expect(r.basicMissing).toContain('consent to share with this funder')
  })

  it('Basic also needs "Details confirmed by phone" and "Agreed to the quote figures"', () => {
    const r = exportReadiness(full, { phoneVerifiedAt: null, figuresAgreedAt: null }, consentTL, TL)
    expect(r.level).toBeNull()
    expect(r.basicMissing).toEqual(['details confirmed by phone', 'agreed to the quote figures'])
  })

  it('a missing basic field blocks both levels', () => {
    const r = exportReadiness({ ...full, landmark: null }, ticked, consentTL, TL)
    expect(r.level).toBeNull()
    expect(r.basicMissing).toEqual(['landmark'])
  })

  it('a business also needs its name and the contact person’s role', () => {
    const r = exportReadiness({ ...basic, customerType: 'business' }, ticked, consentTL, TL)
    expect(r.basicMissing).toEqual(['business name', 'contact person’s role'])
  })
})

describe('readinessLabel (the waiting-list column, any funder)', () => {
  it('Full ready / Basic ready / how many basic items are done', () => {
    expect(readinessLabel(full, ticked)).toBe('Full ready')
    expect(readinessLabel(basic, ticked)).toBe('Basic ready')
    expect(readinessLabel({ ...basic, landmark: null, street: null }, ticked)).toBe('13 of 15')
    expect(readinessLabel(basic, { phoneVerifiedAt: null, figuresAgreedAt: null })).toBe('13 of 15')
  })
})

describe('who may do what (Semako, 23 Nov)', () => {
  it('Sales tick consent and the records; only super admin and Operations export', () => {
    for (const r of ['super_admin', 'operations', 'sales'] as const)
      expect(canTickConsent(r)).toBe(true)
    expect(canTickConsent('finance')).toBe(false)
    expect(canExport('super_admin')).toBe(true)
    expect(canExport('operations')).toBe(true)
    expect(canExport('sales')).toBe(false)
    expect(canExport('funder_partner')).toBe(false)
  })
})
