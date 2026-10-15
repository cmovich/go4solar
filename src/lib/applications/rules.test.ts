import { describe, expect, it } from 'vitest'

import {
  INCOME_RANGES,
  KYC_MAX_ATTEMPTS,
  affordability,
  businessStepComplete,
  canStartLiveness,
  missingForSubmission,
  nextAttempt,
  nextStep,
  stepsFor,
  type CheckSummary,
} from './rules'

const check = (
  kind: CheckSummary['kind'],
  status: CheckSummary['status'],
  attempt = 1,
): CheckSummary => ({
  kind,
  status,
  attempt,
})

describe('stepsFor / nextStep', () => {
  it('individual pathway', () => {
    expect(stepsFor('individual')).toEqual([
      'details',
      'nin',
      'bvn',
      'consent',
      'face',
      'address',
      'income',
      'nextOfKin',
      'guarantor',
      'review',
    ])
  })

  it('business pathway adds business verification and drops next of kin', () => {
    expect(stepsFor('business')).toEqual([
      'details',
      'business',
      'nin',
      'bvn',
      'consent',
      'face',
      'address',
      'income',
      'guarantor',
      'review',
    ])
  })

  it('resumes at the first incomplete step', () => {
    expect(nextStep('individual', {})).toBe('details')
    expect(nextStep('individual', { details: true, nin: true })).toBe('bvn')
    expect(nextStep('business', { details: true })).toBe('business')
  })
})

describe('nextAttempt (cost control)', () => {
  it('first attempt is 1', () => {
    expect(nextAttempt([], 'nin')).toEqual({ allowed: true, attempt: 1 })
  })

  it('counts only this kind', () => {
    expect(nextAttempt([check('bvn', 'failed'), check('nin', 'failed')], 'nin')).toEqual({
      allowed: true,
      attempt: 2,
    })
  })

  it('stops after a pass — no paid call is repeated', () => {
    expect(nextAttempt([check('nin', 'passed')], 'nin')).toEqual({
      allowed: false,
      reason: 'passed',
    })
  })

  it('after 3 attempts the check goes to manual_review and no more calls are made', () => {
    expect(KYC_MAX_ATTEMPTS).toBe(3)
    const three = [check('nin', 'failed', 1), check('nin', 'failed', 2), check('nin', 'failed', 3)]
    expect(nextAttempt(three, 'nin')).toEqual({ allowed: false, reason: 'manual_review' })
    expect(nextAttempt([check('nin', 'manual_review', 3)], 'nin')).toEqual({
      allowed: false,
      reason: 'manual_review',
    })
  })
})

describe('canStartLiveness', () => {
  it('only after NIN has passed AND biometric consent was given', () => {
    expect(canStartLiveness([], true)).toBe(false)
    expect(canStartLiveness([check('nin', 'failed')], true)).toBe(false)
    expect(canStartLiveness([check('nin', 'manual_review')], true)).toBe(false)
    expect(canStartLiveness([check('nin', 'passed')], false)).toBe(false)
    expect(canStartLiveness([check('nin', 'passed')], true)).toBe(true)
  })
})

describe('affordability', () => {
  it('income ratio uses the income-range midpoint and flags above 35%', () => {
    const r = affordability({
      monthlyPayment: 165017,
      incomeRange: '250k_500k',
      monthlyEnergySpend: null,
    })
    expect(r.incomeMidpoint).toBe(375000)
    expect(r.incomeRatio).toBeCloseTo(165017 / 375000, 6)
    expect(r.incomeFlag).toBe(true) // 44%
    const ok = affordability({
      monthlyPayment: 100000,
      incomeRange: '500k_1m',
      monthlyEnergySpend: null,
    })
    expect(ok.incomeRatio).toBeCloseTo(100000 / 750000, 6)
    expect(ok.incomeFlag).toBe(false)
  })

  it('energy ratio = monthly payment ÷ what they spend on power today; ≤ 1 pays for itself', () => {
    const r = affordability({
      monthlyPayment: 165017,
      incomeRange: null,
      monthlyEnergySpend: 180000,
    })
    expect(r.energyRatio).toBeCloseTo(165017 / 180000, 6)
    expect(r.paysForItself).toBe(true)
    const no = affordability({
      monthlyPayment: 165017,
      incomeRange: null,
      monthlyEnergySpend: 70200,
    })
    expect(no.paysForItself).toBe(false)
  })

  it('unknowns stay null and never raise a flag', () => {
    const r = affordability({ monthlyPayment: 165017, incomeRange: null, monthlyEnergySpend: null })
    expect(r).toMatchObject({
      incomeMidpoint: null,
      incomeRatio: null,
      incomeFlag: false,
      energyRatio: null,
      paysForItself: null,
    })
    expect(INCOME_RANGES.map((i) => i.id)).toContain('above_3m')
  })
})

describe('business requirements', () => {
  it('needs a verified (or manually reviewed) CAC, the certificate and the director tick', () => {
    expect(
      businessStepComplete({
        cacStatus: 'passed',
        certificateUploaded: true,
        directorConfirmed: true,
      }),
    ).toBe(true)
    expect(
      businessStepComplete({
        cacStatus: 'manual_review',
        certificateUploaded: true,
        directorConfirmed: true,
      }),
    ).toBe(true)
    expect(
      businessStepComplete({
        cacStatus: 'failed',
        certificateUploaded: true,
        directorConfirmed: true,
      }),
    ).toBe(false)
    expect(
      businessStepComplete({
        cacStatus: 'passed',
        certificateUploaded: false,
        directorConfirmed: true,
      }),
    ).toBe(false)
    expect(
      businessStepComplete({
        cacStatus: 'passed',
        certificateUploaded: true,
        directorConfirmed: false,
      }),
    ).toBe(false)
  })

  it('missingForSubmission lists what a business application still lacks', () => {
    const base = {
      applicantType: 'business' as const,
      steps: Object.fromEntries(
        stepsFor('business')
          .filter((s) => s !== 'review')
          .map((s) => [s, true]),
      ),
      checks: [
        check('nin', 'passed'),
        check('bvn', 'passed'),
        check('liveness', 'passed'),
        check('cac', 'passed'),
      ],
      documents: ['nin_front', 'cac_certificate', 'address_proof', 'business_statement'],
      directorConfirmed: true,
      biometricConsent: true,
    }
    expect(missingForSubmission(base)).toEqual([])
    expect(missingForSubmission({ ...base, directorConfirmed: false })).toContain(
      'director_confirmation',
    )
    expect(
      missingForSubmission({ ...base, checks: base.checks.filter((c) => c.kind !== 'cac') }),
    ).toContain('cac_check')
    expect(
      missingForSubmission({
        ...base,
        documents: ['nin_front', 'address_proof', 'business_statement'],
      }),
    ).toContain('cac_certificate')
    expect(
      missingForSubmission({
        ...base,
        documents: ['nin_front', 'cac_certificate', 'address_proof'],
      }),
    ).toContain('business_statement')
  })

  it('an individual never needs the CAC items', () => {
    const ind = {
      applicantType: 'individual' as const,
      steps: Object.fromEntries(
        stepsFor('individual')
          .filter((s) => s !== 'review')
          .map((s) => [s, true]),
      ),
      checks: [check('nin', 'passed'), check('bvn', 'passed'), check('liveness', 'passed')],
      documents: ['nin_front', 'address_proof'],
      directorConfirmed: false,
      biometricConsent: true,
    }
    expect(missingForSubmission(ind)).toEqual([])
  })
})
