import { describe, expect, it } from 'vitest'

import {
  DEFAULT_ROUTING,
  canDecideFunderQueue,
  canRecordCheques,
  canViewFunderQueue,
  chequesSchema,
  depositShareOf,
  queueDecisionSchema,
  repaymentSummary,
  routeTo,
  routingFromSetting,
} from './rules'

const SPEWA = '9cd547fb-0cf8-4bd1-8f32-b68a3a6e961d'
const routing = { funderId: SPEWA, minDepositShare: 0.3, applicantTypes: ['business'] }

describe('routingFromSetting', () => {
  it('reads the setting', () => {
    expect(routingFromSetting(routing)).toEqual(routing)
  })
  it('falls back field by field; no funder → nothing is routed', () => {
    expect(routingFromSetting(null)).toEqual(DEFAULT_ROUTING)
    expect(DEFAULT_ROUTING.funderId).toBeNull()
    expect(routingFromSetting({ funderId: SPEWA })).toEqual({ ...DEFAULT_ROUTING, funderId: SPEWA })
    expect(routingFromSetting({ funderId: 'x', minDepositShare: 7 })).toEqual(DEFAULT_ROUTING)
  })
})

describe('routeTo', () => {
  it('business with a 30% deposit or more → SPEWA', () => {
    expect(routeTo({ applicantType: 'business', depositShare: 0.3 }, routing)).toBe(SPEWA)
    expect(routeTo({ applicantType: 'business', depositShare: 0.5 }, routing)).toBe(SPEWA)
    // Rounding in the stored share never pushes 30% under the line.
    expect(routeTo({ applicantType: 'business', depositShare: 0.29999999 }, routing)).toBe(SPEWA)
  })
  it('under 30% or an individual → general queue', () => {
    expect(routeTo({ applicantType: 'business', depositShare: 0.29 }, routing)).toBeNull()
    expect(routeTo({ applicantType: 'business', depositShare: 0.2 }, routing)).toBeNull()
    expect(routeTo({ applicantType: 'individual', depositShare: 0.9 }, routing)).toBeNull()
  })
  it('no funder in the setting → never routed', () => {
    expect(
      routeTo({ applicantType: 'business', depositShare: 0.5 }, { ...routing, funderId: null }),
    ).toBeNull()
  })
})

describe('depositShareOf', () => {
  it('uses the chosen deposit share from the quote snapshot', () => {
    expect(
      depositShareOf({ deposit: 300, systemPrice: 1000, snapshot: { depositShare: 0.3 } }),
    ).toBe(0.3)
  })
  it('falls back to deposit ÷ price', () => {
    expect(depositShareOf({ deposit: 400, systemPrice: 1000, snapshot: {} })).toBe(0.4)
    expect(depositShareOf({ deposit: 0, systemPrice: 0, snapshot: {} })).toBe(0)
  })
})

describe('who may do what', () => {
  it('view: super admin, credit officer, funder approver', () => {
    for (const r of ['super_admin', 'credit_officer', 'funder_approver'])
      expect(canViewFunderQueue(r)).toBe(true)
    for (const r of ['operations', 'finance', 'sales', 'consumer', null])
      expect(canViewFunderQueue(r)).toBe(false)
  })
  it('decide: funder approver and super admin only', () => {
    expect(canDecideFunderQueue('funder_approver')).toBe(true)
    expect(canDecideFunderQueue('super_admin')).toBe(true)
    expect(canDecideFunderQueue('credit_officer')).toBe(false)
    expect(canDecideFunderQueue('sales')).toBe(false)
  })
  it('cheques: our staff (super admin, credit officer), never the funder', () => {
    expect(canRecordCheques('super_admin')).toBe(true)
    expect(canRecordCheques('credit_officer')).toBe(true)
    expect(canRecordCheques('funder_approver')).toBe(false)
  })
})

describe('chequesSchema', () => {
  const today = '2026-11-16'
  it('yes needs a number (1–120) and a date received, not in the future', () => {
    expect(
      chequesSchema(today).safeParse({ received: 'yes', count: '12', receivedOn: today }).data,
    ).toEqual({ received: true, count: 12, receivedOn: today })
    expect(
      chequesSchema(today).safeParse({ received: 'yes', count: '', receivedOn: today }).success,
    ).toBe(false)
    expect(
      chequesSchema(today).safeParse({ received: 'yes', count: '0', receivedOn: today }).success,
    ).toBe(false)
    expect(
      chequesSchema(today).safeParse({ received: 'yes', count: '121', receivedOn: today }).success,
    ).toBe(false)
    expect(
      chequesSchema(today).safeParse({ received: 'yes', count: '3', receivedOn: '2026-11-17' })
        .success,
    ).toBe(false)
    expect(
      chequesSchema(today).safeParse({ received: 'yes', count: '3', receivedOn: '' }).success,
    ).toBe(false)
  })
  it('no clears the number and the date', () => {
    expect(
      chequesSchema(today).safeParse({ received: 'no', count: '5', receivedOn: today }).data,
    ).toEqual({ received: false, count: null, receivedOn: null })
  })
})

describe('queueDecisionSchema', () => {
  it('approve needs ids; decline needs a reason', () => {
    expect(queueDecisionSchema.safeParse({ ids: [], decision: 'approve' }).success).toBe(false)
    expect(queueDecisionSchema.safeParse({ ids: [SPEWA], decision: 'approve' }).success).toBe(true)
    expect(
      queueDecisionSchema.safeParse({ ids: [SPEWA], decision: 'decline', reason: '' }).success,
    ).toBe(false)
    expect(
      queueDecisionSchema.safeParse({ ids: [SPEWA], decision: 'decline', reason: 'Too risky' })
        .success,
    ).toBe(true)
  })
  it('at most 50 files at once', () => {
    const ids = Array.from({ length: 51 }, () => SPEWA)
    expect(queueDecisionSchema.safeParse({ ids, decision: 'approve' }).success).toBe(false)
  })
})

describe('repaymentSummary', () => {
  const schedule = [
    { dueDate: '2026-09-01', amount: 100, paidAmount: 100 },
    { dueDate: '2026-10-01', amount: 100, paidAmount: 40 },
    { dueDate: '2026-11-01', amount: 100, paidAmount: 0 },
    { dueDate: '2026-12-01', amount: 100, paidAmount: 0 },
  ]
  it('paid months, amounts, overdue and the next due date', () => {
    expect(repaymentSummary(schedule, '2026-11-16')).toEqual({
      months: 4,
      paidMonths: 1,
      paid: 140,
      outstanding: 260,
      overdue: 160,
      daysOverdue: 46,
      nextDue: '2026-10-01',
    })
  })
  it('nothing due yet', () => {
    expect(repaymentSummary(schedule.slice(3), '2026-11-16')).toEqual({
      months: 1,
      paidMonths: 0,
      paid: 0,
      outstanding: 100,
      overdue: 0,
      daysOverdue: 0,
      nextDue: '2026-12-01',
    })
  })
  it('fully paid / no schedule', () => {
    expect(repaymentSummary(schedule.slice(0, 1), '2026-11-16').nextDue).toBeNull()
    expect(repaymentSummary([], '2026-11-16')).toEqual({
      months: 0,
      paidMonths: 0,
      paid: 0,
      outstanding: 0,
      overdue: 0,
      daysOverdue: 0,
      nextDue: null,
    })
  })
})
