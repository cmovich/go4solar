/**
 * The quote a waiting-list person already has, used when staff have not picked one on the
 * Edit page (pure): their ready-made plan or built system (`builder`), else the plan chosen in
 * Get Started / the calculator, at their deposit (20% if none) over 12 months. Null: no quote.
 */
export type LeadPlan = {
  planKind: 'ready' | 'builder' | 'estimate'
  planRef: string
  depositShare: number
  months: number
}

export function leadPlan(lead: {
  builder: unknown
  chosen_plan: string | null
  deposit_share: number | string | null
}): LeadPlan | null {
  const share = lead.deposit_share === null ? NaN : Number(lead.deposit_share)
  const depositShare = Number.isFinite(share) && share >= 0.2 && share <= 0.95 ? share : 0.2
  const b = lead.builder as { kind?: string; plan?: { slug?: string } } | null
  if (b?.kind === 'ready' && b.plan?.slug)
    return { planKind: 'ready', planRef: b.plan.slug, depositShare, months: 12 }
  if (b && (b.kind === 'builder' || !b.kind))
    return { planKind: 'builder', planRef: 'builder', depositShare, months: 12 }
  if (lead.chosen_plan)
    return { planKind: 'estimate', planRef: lead.chosen_plan, depositShare, months: 12 }
  return null
}
