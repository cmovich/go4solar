import { describe, expect, it } from 'vitest'

import type { CheckSummary } from '@/lib/applications/rules'
import { loanProfit } from '@/lib/profit/loanProfit'

import {
  approvalAuthority,
  approvalBlockers,
  canConfirmPayout,
  eligibleFunders,
  funderOptions,
  rebaseDueDates,
  slaState,
  type FunderRow,
  type LoanFigures,
} from './rules'

const loan: LoanFigures = {
  systemPrice: 2_475_248,
  costPrice: 1_800_000,
  deposit: 495_050,
  balance: 1_980_198,
  tenure: 12,
}
const unitCosts = { kycPerLoan: 10_000, feePerInstalment: 300, lossProvisionShare: 0.02 }
// drawn = 1,800,000 − 495,050 = 1,304,950
const funder = (over: Partial<FunderRow> = {}): FunderRow => ({
  id: 'f',
  name: 'Funder A',
  annualRate: 0.16,
  minAmount: 0,
  maxAmount: 5_000_000,
  maxTenure: 12,
  balanceAvailable: 10_000_000,
  status: 'active',
  ...over,
})

describe('eligibleFunders', () => {
  it('keeps active funders whose ticket, tenure and balance fit the money drawn', () => {
    const list = [
      funder({ id: 'ok' }),
      funder({ id: 'own', name: 'Go4Solar own fund', annualRate: 0 }),
      funder({ id: 'paused', status: 'paused' }),
      funder({ id: 'too-small-max', maxAmount: 1_000_000 }),
      funder({ id: 'min-too-high', minAmount: 2_000_000 }),
      funder({ id: 'short-tenure', maxTenure: 6 }),
      funder({ id: 'low-balance', balanceAvailable: 1_000_000 }),
      funder({ id: 'no-max', maxAmount: null }),
    ]
    expect(eligibleFunders(list, loan).map((f) => f.id)).toEqual(['ok', 'own', 'no-max'])
  })

  it('a deposit above the cost price draws nothing: every active funder with tenure fits', () => {
    const rich = { ...loan, deposit: 1_900_000 }
    expect(eligibleFunders([funder({ balanceAvailable: 0, minAmount: 0 })], rich)).toHaveLength(1)
  })
})

describe('funderOptions', () => {
  it('profit per funder from the profit engine, minus the payment fees actually recorded', () => {
    const [o] = funderOptions([funder()], loan, unitCosts, {
      recordedFees: 2_000,
      minNetMarginShare: 0.1,
    })
    const base = loanProfit({
      systemPrice: loan.systemPrice,
      costPrice: loan.costPrice,
      deposit: loan.deposit,
      tenureMonths: 12,
      funderAnnualRate: 0.16,
      funderMethod: 'flat',
      unitCosts,
    })
    expect(o!.profit.drawn).toBe(1_304_950)
    expect(o!.profit.funderInterest).toBe(208_792)
    expect(o!.profit.netProfit).toBe(base.netProfit - 2_000)
    expect(o!.profit.netPerMonth).toBe(Math.round((base.netProfit - 2_000) / 12))
    expect(o!.netShare).toBeCloseTo(o!.profit.netProfit / loan.systemPrice)
    expect(o!.loss).toBe(false)
  })

  it('flags a loss and a margin below the minimum', () => {
    const [dear] = funderOptions([funder({ annualRate: 0.6 })], loan, unitCosts, {
      recordedFees: 0,
      minNetMarginShare: 0.1,
    })
    expect(dear!.loss).toBe(true)
    const [thin] = funderOptions([funder({ annualRate: 0.3 })], loan, unitCosts, {
      recordedFees: 0,
      minNetMarginShare: 0.2,
    })
    expect(thin!.loss).toBe(false)
    expect(thin!.belowMinimum).toBe(true)
  })
})

describe('approvalBlockers', () => {
  const passed = (kind: CheckSummary['kind']): CheckSummary => ({
    kind,
    status: 'passed',
    attempt: 1,
  })
  const ready = {
    status: 'submitted' as const,
    applicantType: 'individual' as const,
    depositPaid: true,
    consumerSigned: true,
    guarantorSigned: true,
    checks: [passed('nin'), passed('bvn'), passed('liveness')],
    livenessDeferred: false,
  }

  it('nothing blocks a complete application', () => {
    expect(approvalBlockers(ready)).toEqual([])
  })

  it('lists every missing condition', () => {
    expect(
      approvalBlockers({
        ...ready,
        depositPaid: false,
        guarantorSigned: false,
        checks: [passed('nin'), { kind: 'bvn', status: 'manual_review', attempt: 3 }],
      }),
    ).toEqual([
      'Deposit not paid',
      'Guarantor has not signed',
      'BVN check is in manual review: clear or fail it first',
      'Face check not passed',
    ])
  })

  it('a check in manual review blocks until a credit officer clears it', () => {
    const r = approvalBlockers({
      ...ready,
      checks: [
        passed('nin'),
        { kind: 'bvn', status: 'manual_review', attempt: 3 },
        passed('liveness'),
      ],
    })
    expect(r).toEqual(['BVN check is in manual review: clear or fail it first'])
  })

  it('a business needs its CAC check; only submitted / under-review applications can be decided', () => {
    expect(approvalBlockers({ ...ready, applicantType: 'business' })).toEqual([
      'CAC check not passed',
    ])
    expect(approvalBlockers({ ...ready, status: 'approved' })).toEqual([
      'Application is approved, not waiting for a decision',
    ])
  })
})

describe('approvalAuthority', () => {
  const base = { amount: 2_000_000, limit: 3_000_000, netShare: 0.15, minNetMarginShare: 0.1 }

  it('a credit officer may approve up to the limit', () => {
    expect(approvalAuthority({ ...base, role: 'credit_officer' })).toEqual({
      allowed: true,
      reasons: [],
    })
  })

  it('above the limit, or below the minimum margin, only a super admin may approve', () => {
    expect(approvalAuthority({ ...base, role: 'credit_officer', amount: 3_000_001 })).toEqual({
      allowed: false,
      reasons: ['Above the credit officer limit of ₦3,000,000: needs a super admin'],
    })
    expect(approvalAuthority({ ...base, role: 'credit_officer', netShare: 0.05 }).allowed).toBe(
      false,
    )
    expect(
      approvalAuthority({ ...base, role: 'super_admin', amount: 9_000_000, netShare: -0.1 })
        .allowed,
    ).toBe(true)
  })

  it('other roles cannot approve', () => {
    expect(approvalAuthority({ ...base, role: 'operations' }).allowed).toBe(false)
    expect(approvalAuthority({ ...base, role: 'finance' }).allowed).toBe(false)
  })
})

describe('canConfirmPayout (separation of duties)', () => {
  it('the person who approved the loan cannot confirm its payout', () => {
    expect(canConfirmPayout({ actorId: 'a', approvedBy: 'a', jobStatus: 'commissioned' })).toEqual({
      allowed: false,
      reason: 'You approved this loan, so someone else must confirm the payout.',
    })
    expect(
      canConfirmPayout({ actorId: 'b', approvedBy: 'a', jobStatus: 'commissioned' }).allowed,
    ).toBe(true)
  })
  it('only after commissioning', () => {
    expect(
      canConfirmPayout({ actorId: 'b', approvedBy: 'a', jobStatus: 'installed' }).allowed,
    ).toBe(false)
  })
})

describe('rebaseDueDates (at commissioning)', () => {
  it('first payment one month after the customer signs off, same day of the month', () => {
    expect(rebaseDueDates(3, new Date('2026-11-15T10:00:00Z'))).toEqual([
      '2026-12-15',
      '2027-01-15',
      '2027-02-15',
    ])
  })
  it('a sign-off on the 31st falls on each month-end', () => {
    expect(rebaseDueDates(4, new Date('2026-12-31T10:00:00Z'))).toEqual([
      '2027-01-31',
      '2027-02-28',
      '2027-03-31',
      '2027-04-30',
    ])
  })
  it('uses the Lagos date (23:30 UTC is already the next day in Lagos)', () => {
    expect(rebaseDueDates(1, new Date('2026-11-14T23:30:00Z'))).toEqual(['2026-12-15'])
  })
})

describe('slaState (48 hours from submission)', () => {
  const at = new Date('2026-10-11T12:00:00Z')
  it('time left, then overdue', () => {
    expect(slaState('2026-10-11T00:00:00Z', at)).toEqual({ hoursLeft: 36, overdue: false })
    expect(slaState('2026-10-09T10:00:00Z', at)).toEqual({ hoursLeft: -2, overdue: true })
    expect(slaState(null, at)).toBeNull()
  })
})
