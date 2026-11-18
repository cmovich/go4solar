import type { LendingFigures, LendingType } from './figures'
import type { PlanItem } from './planBasis'

/**
 * What Trade Lenda may see about one customer (pure). Built ONLY by `funderSnapshot`, which copies
 * named fields: our cost, vendor prices, margins, profit, return and per-item prices never get in.
 * `funderSafetyProblems` checks any object (API data, export rows) for words that must never
 * appear; tests run it on every page's data and every download.
 */
export type FunderCustomer = {
  reference: string
  name: string
  phone: string
  whatsapp: string | null
  email: string | null
  dateOfBirth: string | null
  address: {
    street: string | null
    landmark: string | null
    lga: string | null
    state: string | null
  }
  work: {
    employmentType: string | null
    employer: string | null
    jobTitle: string | null
    incomeRange: string | null
  }
  ninLast4: string | null
  bvnLast4: string | null
  applicantType: 'individual' | 'business'
  guarantor: {
    name: string | null
    phone: string | null
    relationship: string | null
    address: string | null
  }
  plan: { label: string; items: PlanItem[] }
  figures: {
    lendingType: LendingType
    costToCustomer: number
    depositShare: number
    deposit: number
    financed: number
    ratePerMonth: number
    months: number
    monthly: number
    totalRepayment: number
    /** Lends to Go4Solar only: the customer's own payments to Go4Solar (our quoted terms). */
    customerTotalPayable: number | null
    customerMonthly: number | null
  }
  records: {
    verifiedByPhone: { by: string; at: string; note: string | null }
    consent: { by: string; at: string; note: string | null }
    figuresAgreed: { by: string; at: string; note: string | null }
  }
}

type SnapshotInput = Omit<FunderCustomer, 'figures' | 'plan'> & {
  planLabel: string
  items: PlanItem[]
  figures: LendingFigures
}

/** The only way a funder snapshot is made: field by field, nothing else is copied. */
export function funderSnapshot(i: SnapshotInput): FunderCustomer {
  const f = i.figures
  return {
    reference: i.reference,
    name: i.name,
    phone: i.phone,
    whatsapp: i.whatsapp,
    email: i.email,
    dateOfBirth: i.dateOfBirth,
    address: {
      street: i.address.street,
      landmark: i.address.landmark,
      lga: i.address.lga,
      state: i.address.state,
    },
    work: {
      employmentType: i.work.employmentType,
      employer: i.work.employer,
      jobTitle: i.work.jobTitle,
      incomeRange: i.work.incomeRange,
    },
    ninLast4: i.ninLast4,
    bvnLast4: i.bvnLast4,
    applicantType: i.applicantType,
    guarantor: {
      name: i.guarantor.name,
      phone: i.guarantor.phone,
      relationship: i.guarantor.relationship,
      address: i.guarantor.address,
    },
    plan: {
      label: i.planLabel,
      items: i.items.map((it) => ({ name: it.name, spec: it.spec, qty: it.qty })),
    },
    figures: {
      lendingType: f.lendingType,
      costToCustomer: f.price,
      depositShare: f.depositShare,
      deposit: f.deposit,
      financed: f.financed,
      ratePerMonth: f.monthlyRate,
      months: f.months,
      monthly: f.monthly,
      totalRepayment: f.totalRepayment,
      customerTotalPayable: f.customerTotalPayable,
      customerMonthly: f.customerMonthly,
    },
    records: {
      verifiedByPhone: { ...i.records.verifiedByPhone },
      consent: { ...i.records.consent },
      figuresAgreed: { ...i.records.figuresAgreed },
    },
  }
}

/** Words (keys or labels) that must never reach a funder, in data or in any export. */
export const FORBIDDEN = [
  'cost price',
  'costprice',
  'vendorcost',
  'vendor cost',
  'unitcost',
  'unit cost',
  'margin',
  'markup',
  'profit',
  'netprofit',
  'return %',
  'annualreturn',
  'linetotal',
  'unitprice',
  'installcost',
  'snapshot',
  'pricingrate',
  'spewa',
] as const

/**
 * Problems found in data or a file meant for a funder: forbidden words in any key or text, and
 * (lends to Go4Solar) any of our cost figures appearing as a number.
 */
export function funderSafetyProblems(data: unknown, ourCostFigures: number[] = []): string[] {
  const text = (typeof data === 'string' ? data : JSON.stringify(data)).toLowerCase()
  const out: string[] = []
  for (const w of FORBIDDEN) if (text.includes(w)) out.push(`contains "${w}"`)
  const plain = text.replace(/[,₦\s]/g, '')
  for (const n of ourCostFigures) {
    if (n > 0 && new RegExp(`(^|[^0-9])${n}([^0-9]|$)`).test(plain)) {
      out.push(`contains a cost figure (${n})`)
    }
  }
  return out
}
