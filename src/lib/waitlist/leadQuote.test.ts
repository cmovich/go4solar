import { describe, expect, it } from 'vitest'

import { sampleHomeItems } from '@/lib/load/load.fixture'
import { computeLoadTotals } from '@/lib/load/totals'
import { buildEstimate, repriceEstimate } from '@/lib/quotes/buildEstimate'
import { DEFAULT_QUOTE_SETTINGS } from '@/lib/settings/schemas'

import { leadQuote } from './leadQuote'

const est = buildEstimate(computeLoadTotals(sampleHomeItems), 'Kaduna', 0.2, DEFAULT_QUOTE_SETTINGS)

describe('leadQuote (waiting list: "View quote" / "Download PDF")', () => {
  it('the plan chosen at the deposit step', () => {
    const chosen = { ...repriceEstimate(est, 'comfort', 0.3), plan: 'comfort', depositShare: 0.3 }
    const q = leadQuote({ builder: null, chosen_plan: 'comfort', estimate: { ...est, chosen } })
    expect(q).toMatchObject({ title: 'Comfort plan', sample: true })
    expect(q!.result.deposit).toBe(chosen.quote.deposit)
  })

  it('a plan picked but no deposit yet: that plan as priced', () => {
    const q = leadQuote({ builder: null, chosen_plan: 'essential', estimate: est })
    expect(q!.title).toBe('Essential plan')
    expect(q!.result.systemPrice).toBe(est.plans.essential.quote.systemPrice)
  })

  it('their own system (builder, a ready-made plan or an accepted staff quotation) comes first', () => {
    const builder = { kind: 'builder', sample: false, quote: est.plans.comfort.quote }
    const q = leadQuote({ builder, chosen_plan: 'essential', estimate: est })
    expect(q).toMatchObject({ title: 'Your own system', sample: false })
  })

  it('no plan chosen, nothing built: no quote yet', () => {
    expect(leadQuote({ builder: null, chosen_plan: null, estimate: est })).toBeNull()
    expect(leadQuote({ builder: null, chosen_plan: null, estimate: null })).toBeNull()
  })

  it('a broken stored quote is no quote (never a crash)', () => {
    expect(
      leadQuote({ builder: null, chosen_plan: 'comfort', estimate: { plans: { comfort: {} } } }),
    ).toBeNull()
  })
})
