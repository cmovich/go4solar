import { z } from 'zod'

import { TENURES, type TenureMonths } from '@/lib/pricing/types'

import { routingFromSetting } from './rules'

/**
 * Funder routing rules (pure; Admin → Funders → Routing rules, table funder_routing_rules).
 * A file whose applicant type, deposit and length match an active rule goes to that funder's
 * approval queue once the deposit is paid. The active DEFAULT rule with an offer also sets how
 * that applicant type is priced (SPEWA offer for businesses and institutions).
 */
export type ApplicantType = 'individual' | 'business'

export type RoutingRule = {
  id: string
  funderId: string
  applicantType: ApplicantType
  minDepositShare: number
  tenures: TenureMonths[]
  offer: 'spewa' | null
  isDefault: boolean
  active: boolean
  sortOrder: number
}

const tenure = z.union(
  TENURES.map((t) => z.literal(t)) as [z.ZodLiteral<3>, ...z.ZodLiteral<TenureMonths>[]],
)

const rowSchema = z.object({
  id: z.string(),
  funder_id: z.string().uuid(),
  applicant_type: z.enum(['individual', 'business']),
  min_deposit_share: z.coerce.number().min(0).max(1),
  tenures: z.array(tenure).min(1),
  offer: z.enum(['spewa']).nullable(),
  is_default: z.boolean(),
  active: z.boolean(),
  sort_order: z.coerce.number(),
})

export function rulesFromRows(rows: unknown[]): RoutingRule[] {
  return rows.flatMap((r) => {
    const p = rowSchema.safeParse(r)
    if (!p.success) return []
    const d = p.data
    return [
      {
        id: d.id,
        funderId: d.funder_id,
        applicantType: d.applicant_type,
        minDepositShare: d.min_deposit_share,
        tenures: [...d.tenures].sort((a, b) => a - b),
        offer: d.offer,
        isDefault: d.is_default,
        active: d.active,
        sortOrder: d.sort_order,
      },
    ]
  })
}

/** Before migration 0039: the PR #44 setting (settings.funder_routing) as one rule. */
export function ruleFromSetting(value: unknown): RoutingRule | null {
  const r = routingFromSetting(value)
  if (!r.funderId || !r.applicantTypes.includes('business')) return null
  return {
    id: 'setting',
    funderId: r.funderId,
    applicantType: 'business',
    minDepositShare: r.minDepositShare,
    tenures: [3, 6, 9, 12],
    offer: 'spewa',
    isDefault: true,
    active: true,
    sortOrder: 0,
  }
}

const byOrder = (rules: RoutingRule[]) => [...rules].sort((a, b) => a.sortOrder - b.sortOrder)

/** The funder whose queue this file goes to (first matching active rule), or null. */
export function routeByRules(
  rules: RoutingRule[],
  input: { applicantType: string; depositShare: number; tenureMonths?: number },
): string | null {
  const hit = byOrder(rules).find(
    (r) =>
      r.active &&
      r.applicantType === input.applicantType &&
      // A stored share like 0.29999999 is still 30%.
      input.depositShare + 1e-6 >= r.minDepositShare &&
      (input.tenureMonths === undefined || (r.tenures as number[]).includes(input.tenureMonths)),
  )
  return hit?.funderId ?? null
}

/** The rule that prices this applicant type with an offer (active default with an offer). */
export function offerRuleFor(rules: RoutingRule[], applicantType: string): RoutingRule | null {
  return (
    byOrder(rules).find(
      (r) => r.active && r.isDefault && r.offer !== null && r.applicantType === applicantType,
    ) ?? null
  )
}

/** Admin form: deposit in percent (20–95), at least one length. */
export const routingRuleSchema = z
  .object({
    funderId: z.string().uuid('Choose a funder.'),
    applicantType: z.enum(['individual', 'business']),
    minDepositShare: z
      .number({ error: 'Enter the minimum deposit.' })
      .min(20, 'The minimum deposit is at least 20%.')
      .max(95, 'The minimum deposit is at most 95%.')
      .transform((p) => Math.round(p * 100) / 10_000),
    tenures: z
      .array(tenure, { error: 'Choose the lengths.' })
      .min(1, 'Choose at least one length.'),
    offer: z.enum(['spewa']).nullable(),
    isDefault: z.boolean(),
    active: z.boolean(),
    id: z.string().uuid().optional(),
    sortOrder: z.number().int().min(0).max(1000).default(0),
  })
  .refine((r) => !r.offer || r.tenures.includes(12), {
    message: 'An offer rule needs 12 months (plans are first shown at 12 months).',
    path: ['tenures'],
  })
  .refine((r) => !r.offer || r.isDefault, {
    message: 'An offer rule must be the default for its customer type.',
    path: ['isDefault'],
  })
export type RoutingRuleInput = z.input<typeof routingRuleSchema>

export const APPLICANT_TYPE_LABELS: Record<ApplicantType, string> = {
  individual: 'Individual',
  business: 'Business or institution',
}
