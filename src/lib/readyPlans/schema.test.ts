import { describe, expect, it } from 'vitest'

import { SEEDED_PLANS } from './plans.fixture'
import { planFromRow, planProblems, planToRow, readyPlanSchema } from './schema'

const base = SEEDED_PLANS[0]!

describe('readyPlanSchema (admin form)', () => {
  it('accepts every seeded plan', () => {
    for (const p of SEEDED_PLANS) expect(readyPlanSchema.safeParse(p).success, p.slug).toBe(true)
  })
  it('defaults: 20% deposit, 5% a month, 6/9/12 months, Kaduna delivery, starts SAMPLE', () => {
    const p = readyPlanSchema.parse({
      slug: 'new-plan',
      name: 'New plan',
      summary: '1 kVA · 1 kWh lithium-ion · 12 V',
      systemVoltage: 12,
      inverterKva: 1,
      lines: [base.lines[0]],
    })
    expect(p).toMatchObject({
      depositShare: 0.2,
      monthlyRate: 0.05,
      tenures: [6, 9, 12],
      fullDiscount: 0,
      deliveryState: 'Kaduna',
      active: true,
      sample: true,
      canPower: [],
      backup: [],
    })
  })
  it('refuses a bad slug, a voltage other than 12/24/48, a deposit under 20% or no lines', () => {
    for (const bad of [
      { slug: 'Has Spaces' },
      { systemVoltage: 36 },
      { depositShare: 0.1 },
      { lines: [] },
      { tenures: [7] },
    ]) {
      expect(readyPlanSchema.safeParse({ ...base, ...bad }).success, JSON.stringify(bad)).toBe(
        false,
      )
    }
  })
})

describe('planProblems (plain-English checks before saving)', () => {
  it('none for the seeded plans', () => {
    for (const p of SEEDED_PLANS) expect(planProblems(p), p.slug).toEqual([])
  })
  it('12 months must be offered (full payment is priced from it), and a delivery line is needed', () => {
    expect(planProblems({ ...base, tenures: [6, 9] })).toContain(
      'Offer 12 months: the pay-in-full price is worked out from it.',
    )
    expect(
      planProblems({ ...base, lines: base.lines.filter((l) => l.kind !== 'logistics') }),
    ).toContain('Add the included delivery as a "logistics" line.')
  })
})

describe('database rows', () => {
  it('round trip: plan → row → plan', () => {
    const row = planToRow(base)
    expect(row).toMatchObject({ slug: base.slug, system_voltage: 12, full_discount: 0.25 })
    expect(
      planFromRow({
        ...(row as Required<typeof row>),
        id: 'x',
        created_at: '',
        updated_at: '',
      }),
    ).toEqual({
      ...base,
      id: 'x',
    })
  })
})
