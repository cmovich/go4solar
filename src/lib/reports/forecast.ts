import 'server-only'

import { z } from 'zod'

import { testProfileIds } from '@/lib/approvals/admin'
import { unitCostsRow } from '@/lib/approvals/server'
import type { ScenarioInputs, WaitlistLeadSummary } from '@/lib/forecast/scenario'
import type { QuoteResult } from '@/lib/pricing/types'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Json } from '@/lib/supabase/database.types'

const PRD = 'PRD illustration'

/**
 * A new scenario starts from today's numbers: unit costs, overheads, funders, minimum deposit and
 * real loans or sign-ups where there are any. Anything taken from SAMPLE data, the PRD
 * illustration or unverified factors is listed in sampleInputs so exports can label it.
 */
export async function defaultInputs(): Promise<ScenarioInputs> {
  const admin = createAdminClient()
  const [costs, costsRow, fundersRes, overheadsRes, settingsRes, loansRes, testIds] =
    await Promise.all([
      unitCostsRow(),
      admin.from('unit_costs').select('sample').eq('id', 1).maybeSingle(),
      admin.from('funders').select('kind, annual_rate, balance_available, status, sample, is_test'),
      admin
        .from('overheads')
        .select('*')
        .order('month', { ascending: false })
        .limit(1)
        .maybeSingle(),
      admin
        .from('settings')
        .select('key, value')
        .in('key', ['min_deposit_share', 'customers_per_staff']),
      admin
        .from('loans')
        .select('consumer_id, system_price, cost_price, deposit, tenure')
        .in('status', ['approved', 'active', 'completed']),
      testProfileIds(),
    ])
  const sample: string[] = []
  const setting = (k: string) => (settingsRes.data ?? []).find((s) => s.key === k)?.value

  const funders = (fundersRes.data ?? []).filter((f) => f.status === 'active' && !f.is_test)
  const totalBalance = funders.reduce((s, f) => s + Number(f.balance_available), 0)
  const external = funders.filter((f) => f.kind === 'external')
  const externalBalance = external.reduce((s, f) => s + Number(f.balance_available), 0)
  const funderRate = externalBalance
    ? external.reduce((s, f) => s + Number(f.annual_rate) * Number(f.balance_available), 0) /
      externalBalance
    : 0.16
  if (!externalBalance || external.some((f) => f.sample))
    sample.push('Funder rate (SAMPLE funders)')
  const ownFundShare = totalBalance ? (totalBalance - externalBalance) / totalBalance : 0
  if (funders.some((f) => f.sample)) sample.push('Own-fund share (SAMPLE funders)')
  if (costsRow.data?.sample) sample.push('Unit costs (SAMPLE)')

  const overheads = overheadsRes.data
  if (!overheads) sample.push(`Overheads (${PRD}: ₦4m a month, ₦40,000 per system)`)
  else if (overheads.sample) sample.push('Overheads (SAMPLE)')

  const loans = (loansRes.data ?? []).filter((l) => !testIds.has(l.consumer_id))
  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
  const mix = { 3: 0, 6: 0, 9: 0, 12: 0 } as Record<3 | 6 | 9 | 12, number>
  for (const l of loans) mix[l.tenure as 3 | 6 | 9 | 12] += 1 / loans.length
  if (!loans.length) {
    mix[12] = 1
    sample.push(`System price, cost and tenure mix (${PRD}: ₦2,475,248 / ₦1,800,000, 12 months)`)
  }
  sample.push(
    `New customers, growth and inflation (${PRD})`,
    'CO₂ per system (grid factor unverified)',
  )

  return {
    years: 10,
    mode: 'booked',
    newPerMonthYear1: 20,
    growthLow: 0.2,
    growthBase: 0.4,
    growthHigh: 0.6,
    inflationPerYear: 0.12,
    nairaDevaluationPerYear: 0,
    defaultRateExtra: 0,
    avgSystemPrice: loans.length
      ? Math.round(avg(loans.map((l) => Number(l.system_price))))
      : 2475248,
    avgCostPrice: loans.length ? Math.round(avg(loans.map((l) => Number(l.cost_price)))) : 1800000,
    depositShare: loans.length
      ? avg(loans.map((l) => Number(l.deposit) / Number(l.system_price)))
      : z.number().safeParse(Number(setting('min_deposit_share'))).data || 0.2,
    tenureMix: mix,
    funderAnnualRate: Math.round(funderRate * 10000) / 10000,
    ownFundShare: Math.round(ownFundShare * 1000) / 1000,
    unitCosts: {
      kycPerLoan: costs.kycPerLoan,
      feePerInstalment: costs.feePerInstalment,
      lossProvisionShare: costs.lossProvisionShare,
    },
    overheadFixedPerMonthYear1: overheads ? Number(overheads.fixed_amount) : 4000000,
    overheadGrowthPerYear: 0.15,
    overheadPerSystemYear1: overheads ? Number(overheads.per_system_amount) : 40000,
    co2TonnesPerSystemYear: 1.5,
    customersPerStaff: Number(setting('customers_per_staff')) || 250,
    sampleInputs: sample,
  }
}

/** Current sign-ups (test data left out by default) for "From the waiting list". */
export async function waitlistLeadSummaries(includeTest = false): Promise<WaitlistLeadSummary[]> {
  let q = createAdminClient()
    .from('waitlist_consumers')
    .select('created_at, estimate, chosen_plan, deposit_share, applicant_type, energy, status')
    .limit(5000)
  if (!includeTest) q = q.eq('is_test', false)
  const { data } = await q
  return (data ?? []).map((r) => {
    // Same rule as the waiting-list admin: the chosen variant, else the chosen plan's base price.
    const est = r.estimate as {
      chosen?: { quote?: QuoteResult }
      plans?: Record<string, { quote?: QuoteResult }>
    } | null
    const quote =
      est?.chosen?.quote ?? (r.chosen_plan ? est?.plans?.[r.chosen_plan]?.quote : undefined)
    const energy = r.energy as {
      current?: { fuelCo2KgPerYear?: number; gridCo2KgPerYear?: number }
    } | null
    const cur = energy?.current
    return {
      createdAt: r.created_at,
      systemPrice: r.status === 'complete' && quote ? quote.systemPrice : null,
      costPrice: r.status === 'complete' && quote ? quote.costPrice : null,
      depositShare: r.deposit_share === null ? null : Number(r.deposit_share),
      plan: r.chosen_plan,
      applicantType: r.applicant_type,
      co2Kg: cur
        ? (cur.fuelCo2KgPerYear ?? 0) +
          (r.chosen_plan === 'independence' ? (cur.gridCo2KgPerYear ?? 0) : 0)
        : null,
    }
  })
}

// ------------------------------------------------------------ saved scenarios
const share = z.number().min(-1).max(5)
export const scenarioInputsSchema = z.object({
  years: z.number().int().min(1).max(10),
  mode: z.enum(['booked', 'cash']),
  newPerMonthYear1: z.number().min(0).max(100000),
  growthLow: share,
  growthBase: share,
  growthHigh: share,
  inflationPerYear: share,
  nairaDevaluationPerYear: share,
  defaultRateExtra: z.number().min(0).max(1),
  avgSystemPrice: z.number().min(0),
  avgCostPrice: z.number().min(0),
  depositShare: z.number().min(0).max(1),
  tenureMix: z.object({
    3: z.number().min(0),
    6: z.number().min(0),
    9: z.number().min(0),
    12: z.number().min(0),
  }),
  funderAnnualRate: z.number().min(0).max(2),
  ownFundShare: z.number().min(0).max(1),
  unitCosts: z.object({
    kycPerLoan: z.number().min(0),
    feePerInstalment: z.number().min(0),
    lossProvisionShare: z.number().min(0).max(1),
  }),
  overheadFixedPerMonthYear1: z.number().min(0),
  overheadGrowthPerYear: share,
  overheadPerSystemYear1: z.number().min(0),
  co2TonnesPerSystemYear: z.number().min(0).max(100),
  customersPerStaff: z.number().min(1),
  sampleInputs: z.array(z.string().max(200)).max(30),
})

export type SavedScenario = { id: string; name: string; inputs: ScenarioInputs; updatedAt: string }

/** Saved scenarios; ones made by test accounts only when test data is shown. */
export async function listScenarios(includeTest = false): Promise<SavedScenario[]> {
  const [{ data }, testIds] = await Promise.all([
    createAdminClient()
      .from('forecast_scenarios')
      .select('*')
      .order('updated_at', { ascending: false }),
    includeTest ? Promise.resolve(new Set<string>()) : testProfileIds(),
  ])
  return (data ?? [])
    .filter((r) => !r.created_by || !testIds.has(r.created_by))
    .flatMap((r) => {
      const p = scenarioInputsSchema.safeParse(r.inputs)
      return p.success
        ? [{ id: r.id, name: r.name, inputs: p.data as ScenarioInputs, updatedAt: r.updated_at }]
        : []
    })
}

export async function getScenario(id: string): Promise<SavedScenario | null> {
  return (await listScenarios(true)).find((s) => s.id === id) ?? null
}

export async function saveScenario(input: {
  id?: string
  name: string
  inputs: unknown
  actorId: string
}) {
  const name = z.string().trim().min(2).max(80).safeParse(input.name)
  const inputs = scenarioInputsSchema.safeParse(input.inputs)
  if (!name.success)
    return { ok: false as const, error: 'Give the scenario a name (2–80 characters).' }
  if (!inputs.success)
    return {
      ok: false as const,
      error: `Check the inputs: ${inputs.error.issues[0]?.path.join('.')}`,
    }
  const admin = createAdminClient()
  const row = { name: name.data, inputs: inputs.data as unknown as Json }
  const res = input.id
    ? await admin.from('forecast_scenarios').update(row).eq('id', input.id).select('id').single()
    : await admin
        .from('forecast_scenarios')
        .insert({ ...row, created_by: input.actorId })
        .select('id')
        .single()
  if (res.error || !res.data) return { ok: false as const, error: 'Could not save the scenario.' }
  await admin.from('audit_log').insert({
    actor_id: input.actorId,
    action: input.id ? 'forecast.update' : 'forecast.create',
    entity: 'forecast_scenarios',
    entity_id: res.data.id,
    before: null,
    after: row as unknown as Json,
  })
  return { ok: true as const, id: res.data.id }
}
