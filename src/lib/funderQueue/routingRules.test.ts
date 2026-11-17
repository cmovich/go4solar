import { describe, expect, it } from 'vitest'

import {
  offerRuleFor,
  routeByRules,
  routingRuleSchema,
  rulesFromRows,
  ruleFromSetting,
  type RoutingRule,
} from './routingRules'

const SPEWA = '9cd547fb-0cf8-4bd1-8f32-b68a3a6e961d'
const OTHER = '11111111-1111-4111-8111-111111111111'

const spewa: RoutingRule = {
  id: 'r1',
  funderId: SPEWA,
  applicantType: 'business',
  minDepositShare: 0.3,
  tenures: [3, 6, 9, 12],
  offer: 'spewa',
  isDefault: true,
  active: true,
  sortOrder: 1,
}

describe('routeByRules', () => {
  it('business, 30% deposit or more, 3/6/9/12 months → SPEWA', () => {
    for (const tenureMonths of [3, 6, 9, 12] as const) {
      expect(
        routeByRules([spewa], { applicantType: 'business', depositShare: 0.3, tenureMonths }),
      ).toBe(SPEWA)
    }
    expect(routeByRules([spewa], { applicantType: 'business', depositShare: 0.29999999 })).toBe(
      SPEWA,
    )
  })

  it('individuals, a lower deposit, another length or a switched-off rule → general queue', () => {
    expect(routeByRules([spewa], { applicantType: 'individual', depositShare: 0.5 })).toBeNull()
    expect(routeByRules([spewa], { applicantType: 'business', depositShare: 0.2 })).toBeNull()
    expect(
      routeByRules([spewa], { applicantType: 'business', depositShare: 0.3, tenureMonths: 18 }),
    ).toBeNull()
    expect(
      routeByRules([{ ...spewa, active: false }], { applicantType: 'business', depositShare: 0.5 }),
    ).toBeNull()
  })

  it('later funders are rules too: the first matching rule (by order) wins', () => {
    const other: RoutingRule = {
      ...spewa,
      id: 'r2',
      funderId: OTHER,
      minDepositShare: 0.5,
      offer: null,
      isDefault: false,
      sortOrder: 0,
    }
    expect(routeByRules([spewa, other], { applicantType: 'business', depositShare: 0.6 })).toBe(
      OTHER,
    )
    expect(routeByRules([spewa, other], { applicantType: 'business', depositShare: 0.4 })).toBe(
      SPEWA,
    )
  })
})

describe('offerRuleFor', () => {
  it('the active default rule with an offer for that applicant type', () => {
    expect(offerRuleFor([spewa], 'business')).toBe(spewa)
    expect(offerRuleFor([spewa], 'individual')).toBeNull()
    expect(offerRuleFor([{ ...spewa, isDefault: false }], 'business')).toBeNull()
    expect(offerRuleFor([{ ...spewa, active: false }], 'business')).toBeNull()
  })
})

describe('rulesFromRows and ruleFromSetting', () => {
  it('reads database rows (numeric strings) and leaves out broken ones', () => {
    expect(
      rulesFromRows([
        {
          id: 'r1',
          funder_id: SPEWA,
          applicant_type: 'business',
          min_deposit_share: '0.3000',
          tenures: [3, 6, 9, 12],
          offer: 'spewa',
          is_default: true,
          active: true,
          sort_order: 1,
        },
        {
          id: 'r2',
          funder_id: SPEWA,
          applicant_type: 'x',
          min_deposit_share: 0.3,
          tenures: [],
          offer: null,
          is_default: false,
          active: true,
          sort_order: 2,
        },
      ]),
    ).toEqual([spewa])
  })

  it('the PR #44 setting as a rule (before migration 0039)', () => {
    expect(
      ruleFromSetting({ funderId: SPEWA, minDepositShare: 0.3, applicantTypes: ['business'] }),
    ).toMatchObject({
      funderId: SPEWA,
      applicantType: 'business',
      minDepositShare: 0.3,
      tenures: [3, 6, 9, 12],
      offer: 'spewa',
      isDefault: true,
    })
    expect(ruleFromSetting(null)).toBeNull()
  })
})

describe('routingRuleSchema (admin form)', () => {
  const ok = {
    funderId: SPEWA,
    applicantType: 'business',
    minDepositShare: 30,
    tenures: [3, 6, 9, 12],
    offer: 'spewa',
    isDefault: true,
    active: true,
  }
  it('takes the deposit in percent', () => {
    expect(routingRuleSchema.parse(ok).minDepositShare).toBe(0.3)
  })
  it('refuses a deposit below 20% or above 95%, and no lengths', () => {
    expect(routingRuleSchema.safeParse({ ...ok, minDepositShare: 10 }).success).toBe(false)
    expect(routingRuleSchema.safeParse({ ...ok, minDepositShare: 96 }).success).toBe(false)
    expect(routingRuleSchema.safeParse({ ...ok, tenures: [] }).success).toBe(false)
    expect(routingRuleSchema.safeParse({ ...ok, tenures: [5] }).success).toBe(false)
  })
  it('an offer rule needs 12 months and must be the default', () => {
    expect(routingRuleSchema.safeParse({ ...ok, tenures: [3, 6] }).error?.issues[0]?.message).toBe(
      'An offer rule needs 12 months (plans are first shown at 12 months).',
    )
    expect(routingRuleSchema.safeParse({ ...ok, isDefault: false }).success).toBe(false)
    expect(
      routingRuleSchema.safeParse({ ...ok, offer: null, isDefault: false, tenures: [3] }).success,
    ).toBe(true)
  })
})
