import type { ExportFinancing } from '@/lib/exports/financing'

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
  applicantType: 'individual' | 'business'
  /** Business only: its name and the contact person's role (the contact is `name`). */
  business: { name: string; contactRole: string | null } | null
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
  /** Export level (0043; batches before it are full): Basic leaves out the Full-only details. */
  level?: 'basic' | 'full'
  /** What the funder finances and earns (exports from 0043 on). */
  financing?: ExportFinancing
  /** Exported without a quote (25 Nov 2026): the figures are blank in every file and page. */
  noQuote?: true
}

type SnapshotInput = Omit<FunderCustomer, 'figures' | 'plan'> & {
  planLabel: string
  items: PlanItem[]
  figures: LendingFigures
}

/** The only way a funder snapshot is made: field by field, nothing else is copied. */
export function funderSnapshot(i: SnapshotInput): FunderCustomer {
  const f = i.figures
  // Basic: date of birth, work and income and the guarantor are never copied.
  const full = i.level !== 'basic'
  return {
    reference: i.reference,
    name: i.name,
    phone: i.phone,
    whatsapp: i.whatsapp,
    email: i.email,
    dateOfBirth: full ? i.dateOfBirth : null,
    address: {
      street: i.address.street,
      landmark: i.address.landmark,
      lga: i.address.lga,
      state: i.address.state,
    },
    work: {
      employmentType: full ? i.work.employmentType : null,
      employer: full ? i.work.employer : null,
      jobTitle: full ? i.work.jobTitle : null,
      incomeRange: full ? i.work.incomeRange : null,
    },
    applicantType: i.applicantType,
    business: i.business ? { name: i.business.name, contactRole: i.business.contactRole } : null,
    guarantor: {
      name: full ? i.guarantor.name : null,
      phone: full ? i.guarantor.phone : null,
      relationship: full ? i.guarantor.relationship : null,
      address: full ? i.guarantor.address : null,
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
    ...(i.level ? { level: i.level } : {}),
    ...(i.noQuote ? { noQuote: true as const } : {}),
    ...(i.financing
      ? {
          financing: {
            months: i.financing.months,
            deposit: i.financing.deposit,
            depositStatus: i.financing.depositStatus,
            depositPaid: i.financing.depositPaid,
            financed: i.financing.financed,
            monthly: i.financing.monthly,
            totalRepayment: i.financing.totalRepayment,
            earnings: i.financing.earnings,
          },
        }
      : {}),
  }
}

/** Words (keys or labels) that must never reach a funder, in data or in any export. */
export const FORBIDDEN = [
  // We never collect NIN/BVN for Trade Lenda (it collects them itself).
  'ninlast4',
  'bvnlast4',
  '(last 4)',
  'bvn',
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
export function funderSafetyProblems(
  data: unknown,
  ourCostFigures: number[] = [],
  /** allow: words this funder may see ("spewa" in exports to SPEWA only). */
  opts: { allow?: string[] } = {},
): string[] {
  const text = (typeof data === 'string' ? data : JSON.stringify(data)).toLowerCase()
  const out: string[] = []
  for (const w of FORBIDDEN)
    if (!opts.allow?.includes(w) && text.includes(w)) out.push(`contains "${w}"`)
  // A funder's earnings are only its interest/charge on what it finances (never our margin).
  if (typeof data === 'object' && data !== null && hasBadEarnings(data))
    out.push('earnings are not the interest/charge on the amount financed')
  const plain = text.replace(/[,₦\s]/g, '')
  for (const n of ourCostFigures) {
    if (n > 0 && new RegExp(`(^|[^0-9])${n}([^0-9]|$)`).test(plain)) {
      out.push(`contains a cost figure (${n})`)
    }
  }
  return out
}

/** Any `financing` block whose earnings ≠ repayment − financed (or negative). */
function hasBadEarnings(data: unknown): boolean {
  if (Array.isArray(data)) return data.some(hasBadEarnings)
  if (typeof data !== 'object' || data === null) return false
  const o = data as Record<string, unknown>
  const f = o.financing as Partial<ExportFinancing> | undefined
  if (
    f &&
    typeof f.earnings === 'number' &&
    typeof f.financed === 'number' &&
    typeof f.totalRepayment === 'number' &&
    (f.earnings < 0 || f.earnings !== f.totalRepayment - f.financed)
  )
    return true
  return Object.values(o).some((v) => typeof v === 'object' && v !== null && hasBadEarnings(v))
}
