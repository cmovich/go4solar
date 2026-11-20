import { SEEDED_PLANS } from '@/lib/readyPlans/plans.fixture'
import { DEFAULT_READY_TERMS, withTerms } from '@/lib/readyPlans/terms'

import { customerFigures, go4solarFigures, monthlyRateOf, type LendingType } from './figures'
import { readyPlanBasis } from './planBasis'
import { funderSnapshot } from './snapshot'

/** Test helper: Oga Boss, 12 months, 20% deposit, as a funder snapshot of either lending type. */
export const ogaBoss = withTerms(
  SEEDED_PLANS.find((p) => p.slug === 'oga-boss')!,
  DEFAULT_READY_TERMS,
)

/** Every internal figure of the plan (vendor costs, line prices, total cost). */
export const ogaCostFigures = () => [
  readyPlanBasis(ogaBoss, 12).cost,
  ...ogaBoss.lines.map((l) => l.vendorCost),
  ...ogaBoss.lines.map((l) => l.price),
]

const rec = { by: 'Staff A', at: '2026-11-18', note: null }

export function makeSnapshot(type: LendingType) {
  const r = monthlyRateOf(0.48)
  const basis = readyPlanBasis(ogaBoss, 12)
  const figures =
    type === 'customer'
      ? customerFigures({ price: basis.priceInFull, depositShare: 0.2, months: 12, monthlyRate: r })
      : go4solarFigures({
          priceInFull: basis.priceInFull,
          quoted: basis.quoted,
          months: 12,
          monthlyRate: r,
        })
  return funderSnapshot({
    reference: 'G4S-1234ABCD',
    name: 'Ada Obi',
    phone: '+2348031234567',
    whatsapp: null,
    email: null,
    dateOfBirth: '1990-01-01',
    address: { street: '1 Way', landmark: 'Market', lga: 'Kaduna North', state: 'Kaduna' },
    work: { employmentType: 'employed', employer: 'X', jobTitle: 'Y', incomeRange: 'Z' },
    applicantType: 'individual',
    business: null,
    guarantor: { name: 'B', phone: null, relationship: 'Brother', address: null },
    planLabel: basis.label,
    items: basis.items,
    figures,
    records: { verifiedByPhone: rec, consent: rec, figuresAgreed: rec },
  })
}
