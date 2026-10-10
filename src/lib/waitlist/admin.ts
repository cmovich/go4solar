import 'server-only'

import type { LoadItem, LoadTotals } from '@/lib/load/types'
import type { Estimate, RepricedPlan } from '@/lib/quotes/buildEstimate'
import type { Plan } from '@/lib/sizing/types'
import type { Database } from '@/lib/supabase/database.types'
import { createClient } from '@/lib/supabase/server'

import { DEPOSIT_BANDS, depositBandOf, type ApplicantType, type BusinessInput } from './schema'

type ConsumerRow = Database['public']['Tables']['waitlist_consumers']['Row']
type InstallerRow = Database['public']['Tables']['waitlist_installers']['Row']

/** Everything the admin table and exports need for one consumer, already decoded. */
export type ConsumerLead = {
  id: string
  status: 'incomplete' | 'complete'
  createdAt: string
  phone: string
  whatsapp: string | null
  email: string | null
  firstName: string | null
  surname: string | null
  state: string | null
  lga: string | null
  consentAt: string | null
  applicantType: ApplicantType | null
  business: BusinessInput | null
  loadItems: LoadItem[]
  loadTotals: Partial<LoadTotals>
  plan: Plan | null
  depositShare: number | null
  depositBand: string | null
  readyWhen: 'now' | '30_days' | 'later' | null
  systemPrice: number | null
  deposit: number | null
  monthly: number | null
  financing: number | null
  sample: boolean
  duplicateOf: string | null
  enteredBy: string | null
  enteredByName: string | null
  entryChannel: string | null
}

export type ConsumerFilters = {
  tab: 'complete' | 'incomplete'
  state?: string
  band?: string
  plan?: string
  ready?: string
  type?: string
  from?: string
  to?: string
}

type EstimateWithChosen = Estimate & {
  chosen?: { plan: Plan; depositShare: number } & RepricedPlan
}

function decode(row: ConsumerRow, names: Map<string, string>): ConsumerLead {
  const est = (row.estimate as EstimateWithChosen | null) ?? null
  const chosen = est?.chosen ?? (row.chosen_plan && est ? est.plans[row.chosen_plan as Plan] : null)
  const quote = chosen?.quote ?? null
  const type =
    row.applicant_type === 'individual' || row.applicant_type === 'business'
      ? row.applicant_type
      : null
  return {
    id: row.id,
    status: row.status,
    createdAt: row.created_at,
    phone: row.phone_e164,
    whatsapp: row.whatsapp_e164,
    email: row.email,
    firstName: row.first_name,
    surname: row.surname,
    state: row.state,
    lga: row.lga,
    consentAt: row.consent_at,
    applicantType: type,
    business: type === 'business' ? ((row.business as BusinessInput | null) ?? null) : null,
    loadItems: (row.load_items as LoadItem[]) ?? [],
    loadTotals: (row.load_totals as Partial<LoadTotals>) ?? {},
    plan: (row.chosen_plan as Plan | null) ?? null,
    depositShare: row.deposit_share === null ? null : Number(row.deposit_share),
    depositBand: depositBandOf(row.deposit_share === null ? null : Number(row.deposit_share)),
    readyWhen: row.ready_when,
    systemPrice: quote?.systemPrice ?? null,
    deposit: quote?.deposit ?? null,
    monthly: quote?.monthly ?? null,
    financing: quote ? quote.systemPrice - quote.deposit : null,
    sample: est?.sample ?? false,
    duplicateOf: row.duplicate_of,
    enteredBy: row.entered_by,
    enteredByName: row.entered_by ? (names.get(row.entered_by) ?? null) : null,
    entryChannel: row.entry_channel,
  }
}

async function staffNames(ids: (string | null)[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((v): v is string => Boolean(v)))]
  if (unique.length === 0) return new Map()
  const supabase = await createClient()
  const { data } = await supabase.from('profiles').select('id, full_name, email').in('id', unique)
  return new Map((data ?? []).map((p) => [p.id, p.full_name ?? p.email ?? p.id]))
}

/** Consumers for the admin table, newest first, filtered. Reads as the staff user (RLS). */
export async function listConsumers(filters: ConsumerFilters): Promise<ConsumerLead[]> {
  const supabase = await createClient()
  let q = supabase
    .from('waitlist_consumers')
    .select('*')
    .eq('status', filters.tab)
    .order('created_at', { ascending: false })
    .limit(2000)
  if (filters.state) q = q.eq('state', filters.state)
  if (filters.plan) q = q.eq('chosen_plan', filters.plan)
  if (filters.ready) q = q.eq('ready_when', filters.ready as 'now' | '30_days' | 'later')
  if (filters.type === 'individual' || filters.type === 'business') {
    q = q.eq('applicant_type', filters.type)
  }
  if (filters.from) q = q.gte('created_at', filters.from)
  if (filters.to) q = q.lte('created_at', `${filters.to}T23:59:59.999Z`)
  const band = DEPOSIT_BANDS.find((b) => b.id === filters.band)
  if (band) q = q.gte('deposit_share', band.min).lt('deposit_share', band.max)

  const { data, error } = await q
  if (error) throw new Error(`waitlist_consumers: ${error.message}`)
  const names = await staffNames(data.map((r) => r.entered_by))
  return data.map((r) => decode(r, names))
}

export type Segment = {
  count: number
  systemValue: number
  depositsPledged: number
  financingNeeded: number
}

export type Headline = {
  total: number
  complete: number
  incomplete: number
  byState: { state: string; count: number }[]
  /** Complete sign-ups split by who the solar is for. */
  byType: { individual: Segment; business: Segment; unknown: Segment }
  systemValue: number
  depositsPledged: number
  financingNeeded: number
  averageDepositShare: number | null
  readyNow: number
  installers: number
  sample: boolean
}

function segment(leads: ConsumerLead[]): Segment {
  return {
    count: leads.length,
    systemValue: leads.reduce((s, l) => s + (l.systemPrice ?? 0), 0),
    depositsPledged: leads.reduce((s, l) => s + (l.deposit ?? 0), 0),
    financingNeeded: leads.reduce((s, l) => s + (l.financing ?? 0), 0),
  }
}

/** The funder numbers (PRD "Admin waiting-list view"), over every complete sign-up. */
export async function headline(): Promise<Headline> {
  const supabase = await createClient()
  const [{ data: rows, error }, { count: installers }] = await Promise.all([
    supabase.from('waitlist_consumers').select('*').limit(5000),
    supabase.from('waitlist_installers').select('id', { count: 'exact', head: true }),
  ])
  if (error) throw new Error(`waitlist_consumers: ${error.message}`)
  const leads = rows.map((r) => decode(r, new Map()))
  const complete = leads.filter((l) => l.status === 'complete')

  const byStateMap = new Map<string, number>()
  for (const l of leads) {
    const key = l.state ?? 'Not given'
    byStateMap.set(key, (byStateMap.get(key) ?? 0) + 1)
  }
  const deposits = complete.map((l) => l.depositShare).filter((d): d is number => d !== null)
  const all = segment(complete)

  return {
    total: leads.length,
    complete: complete.length,
    incomplete: leads.length - complete.length,
    byState: [...byStateMap.entries()]
      .map(([state, count]) => ({ state, count }))
      .sort((a, b) => b.count - a.count),
    byType: {
      individual: segment(complete.filter((l) => l.applicantType === 'individual')),
      business: segment(complete.filter((l) => l.applicantType === 'business')),
      unknown: segment(complete.filter((l) => l.applicantType === null)),
    },
    systemValue: all.systemValue,
    depositsPledged: all.depositsPledged,
    financingNeeded: all.financingNeeded,
    averageDepositShare: deposits.length
      ? deposits.reduce((a, b) => a + b, 0) / deposits.length
      : null,
    readyNow: complete.filter((l) => l.readyWhen === 'now').length,
    installers: installers ?? 0,
    sample: complete.some((l) => l.sample),
  }
}

export type InstallerLead = InstallerRow & { enteredByName: string | null }

export async function listInstallers(): Promise<InstallerLead[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('waitlist_installers')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(2000)
  if (error) throw new Error(`waitlist_installers: ${error.message}`)
  const names = await staffNames(data.map((r) => r.entered_by))
  return data.map((r) => ({
    ...r,
    enteredByName: r.entered_by ? (names.get(r.entered_by) ?? null) : null,
  }))
}

/** When was the waiting list last exported (PDF or CSV)? Gates "Clear waiting list". */
export async function lastExportAt(): Promise<string | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('waitlist_exports')
    .select('created_at')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data?.created_at ?? null
}
