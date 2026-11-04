import 'server-only'

import { createClient } from '@/lib/supabase/server'

import { gridInsights, lagosDayRange, type GridInsights, type GridLead } from './insights'

export type GridFilters = { from?: string; to?: string; includeTest: boolean }

/** Staff who see the waiting list see grid insights (same people, same data). */
export const GRID_INSIGHT_ROLES = [
  'super_admin',
  'credit_officer',
  'operations',
  'content',
] as const

const PAGE = 1000

/**
 * Grid answers from the waiting list (read as the signed-in staff member, under RLS): cleared
 * entries left out, test data left out unless asked for, dates as whole Lagos days.
 */
export async function loadGridInsights(f: GridFilters): Promise<GridInsights> {
  const supabase = await createClient()
  const range = lagosDayRange(f.from, f.to)
  const leads: GridLead[] = []
  for (let start = 0; ; start += PAGE) {
    let q = supabase
      .from('waitlist_consumers')
      .select('state, grid')
      .is('cleared_at', null)
      .not('grid', 'is', null)
      .order('created_at')
      .range(start, start + PAGE - 1)
    if (!f.includeTest) q = q.eq('is_test', false)
    if (range.from) q = q.gte('created_at', range.from)
    if (range.to) q = q.lte('created_at', range.to)
    const { data, error } = await q
    if (error) throw new Error(error.message)
    leads.push(...(data ?? []))
    if (!data || data.length < PAGE) break
  }
  return gridInsights(leads)
}
