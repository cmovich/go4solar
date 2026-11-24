import { describe, expect, it } from 'vitest'

import { readyPlanBasis } from '@/lib/tradeLenda/planBasis'
import { ogaBoss, ogaCostFigures } from '@/lib/tradeLenda/fixture'
import { customerFigures, monthlyRateOf } from '@/lib/tradeLenda/figures'
import { funderSafetyProblems, funderSnapshot } from '@/lib/tradeLenda/snapshot'

import { exportFinancing } from './financing'

const rec = { by: 'Staff A', at: '2026-11-24', note: null }
const basis = readyPlanBasis(ogaBoss, 12)
const financing = exportFinancing(
  basis,
  { kind: 'trade-lenda', monthlyRate: monthlyRateOf(0.48), lendingType: 'customer' },
  { depositShare: 0.2, months: 12, depositPaid: 0 },
)
const person = (level: 'basic' | 'full') =>
  funderSnapshot({
    reference: 'G4S-1234ABCD',
    name: 'Ada Obi',
    phone: '+2348031234567',
    whatsapp: '+2348031234567',
    email: 'ada@example.test',
    dateOfBirth: '1990-01-01',
    address: { street: '1 Way', landmark: 'Market', lga: 'Kaduna North', state: 'Kaduna' },
    work: {
      employmentType: 'employed',
      employer: 'X Ltd',
      jobTitle: 'Clerk',
      incomeRange: '250k_500k',
    },
    applicantType: 'individual',
    business: null,
    guarantor: {
      name: 'Bayo',
      phone: '+2348060000000',
      relationship: 'Brother',
      address: 'Kaduna',
    },
    planLabel: basis.label,
    items: basis.items,
    figures: customerFigures({
      price: basis.priceInFull,
      depositShare: 0.2,
      months: 12,
      monthlyRate: monthlyRateOf(0.48),
    }),
    records: { verifiedByPhone: rec, consent: rec, figuresAgreed: rec },
    level,
    financing,
  })

describe('funder snapshot: Basic and Full', () => {
  it('Basic: contact, address, customer type, the quotation (items + quantities) and the financing; nothing from Full', () => {
    const b = person('basic')
    expect(b.level).toBe('basic')
    expect(b.dateOfBirth).toBeNull()
    expect(b.work).toEqual({
      employmentType: null,
      employer: null,
      jobTitle: null,
      incomeRange: null,
    })
    expect(b.guarantor).toEqual({ name: null, phone: null, relationship: null, address: null })
    expect(b.address.landmark).toBe('Market')
    expect(b.plan.items.length).toBeGreaterThan(0)
    expect(b.financing).toMatchObject({
      financed: 1_045_600,
      earnings: 501_888,
      monthly: 128_957,
      totalRepayment: 1_547_488,
    })
  })

  it('Full: everything', () => {
    const f = person('full')
    expect(f.dateOfBirth).toBe('1990-01-01')
    expect(f.guarantor.name).toBe('Bayo')
    expect(f.work.incomeRange).toBe('250k_500k')
  })

  it('both levels are funder-safe: no cost, vendor prices, margins, profit, per-item prices, NIN/BVN', () => {
    for (const level of ['basic', 'full'] as const)
      expect(funderSafetyProblems(person(level), ogaCostFigures())).toEqual([])
  })

  it('earnings must be exactly the interest/charge on what the funder finances', () => {
    const bad = person('full')
    bad.financing!.earnings = 999
    expect(funderSafetyProblems(bad)).toContain(
      'earnings are not the interest/charge on the amount financed',
    )
  })

  it('"SPEWA" may appear only in exports to SPEWA', () => {
    const data = { batch: 'SP-Batch-001', funder: 'SPEWA programme funds' }
    expect(funderSafetyProblems(data)).toContain('contains "spewa"')
    expect(funderSafetyProblems(data, [], { allow: ['spewa'] })).toEqual([])
  })
})
