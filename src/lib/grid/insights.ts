import { z } from 'zod'

/** One waiting-list lead's stored grid answers (`waitlist_consumers.grid`; null if not answered). */
export type GridLead = { state: string | null; grid: unknown }

const gridSchema = z.object({
  mode: z.enum(['A', 'B', 'C', 'D']),
  pattern: z.enum(['daily', 'some_days', 'uncertain', 'blackout']),
  dayHours: z.number().min(0).max(24),
  nightHours: z.number().min(0).max(24),
})

export type GridRow = {
  state: string
  /** Leads that answered the grid questions. */
  answered: number
  /** Of those, the ones who gave hours (grid daily or on some days). */
  withHours: number
  /** Average grid hours by day and by night, over `withHours` (null when nobody gave hours). */
  avgDayHours: number | null
  avgNightHours: number | null
  /** No grid at all for a while, incl. "D · no grid" (null when nobody answered). */
  blackoutShare: number | null
  /** "Can't be certain". */
  uncertainShare: number | null
  /** A charge + bypass · B charge only · C supply only · D no grid. */
  modes: Record<'A' | 'B' | 'C' | 'D', number>
}

export type GridInsights = { states: GridRow[]; total: GridRow }

const one = (n: number) => Math.round(n * 10) / 10

function summarise(state: string, grids: z.infer<typeof gridSchema>[]): GridRow {
  const hours = grids.filter((g) => g.pattern === 'daily' || g.pattern === 'some_days')
  const share = (n: number) => (grids.length ? n / grids.length : null)
  const avg = (key: 'dayHours' | 'nightHours') =>
    hours.length ? one(hours.reduce((t, g) => t + g[key], 0) / hours.length) : null
  const modes = { A: 0, B: 0, C: 0, D: 0 }
  for (const g of grids) modes[g.mode] += 1
  return {
    state,
    answered: grids.length,
    withHours: hours.length,
    avgDayHours: avg('dayHours'),
    avgNightHours: avg('nightHours'),
    blackoutShare: share(grids.filter((g) => g.pattern === 'blackout').length),
    uncertainShare: share(grids.filter((g) => g.pattern === 'uncertain').length),
    modes,
  }
}

/**
 * Grid answers by state (admin "Grid insights"): averages, blackout and uncertain shares and the
 * grid mode choices. Leads that never answered, or with broken data, are left out. Pure.
 */
export function gridInsights(leads: GridLead[]): GridInsights {
  const byState = new Map<string, z.infer<typeof gridSchema>[]>()
  const all: z.infer<typeof gridSchema>[] = []
  for (const l of leads) {
    const g = gridSchema.safeParse(l.grid)
    if (!g.success) continue
    const state = l.state ?? 'Unknown'
    byState.set(state, [...(byState.get(state) ?? []), g.data])
    all.push(g.data)
  }
  return {
    states: [...byState.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([state, grids]) => summarise(state, grids)),
    total: summarise('All states', all),
  }
}

const pct = (share: number | null) => (share === null ? '' : String(one(share * 100)))
const num = (n: number | null) => (n === null ? '' : String(n))

/** The same table as CSV (one line per state, then the total). Pure. */
export function insightsCsv(r: GridInsights): string {
  const header =
    'State,Answered,With hours,Avg day grid hours,Avg night grid hours,Blackout %,Uncertain %,Mode A,Mode B,Mode C,Mode D'
  const line = (s: GridRow) =>
    [
      /[",\n]/.test(s.state) ? `"${s.state.replace(/"/g, '""')}"` : s.state,
      s.answered,
      s.withHours,
      num(s.avgDayHours),
      num(s.avgNightHours),
      pct(s.blackoutShare),
      pct(s.uncertainShare),
      s.modes.A,
      s.modes.B,
      s.modes.C,
      s.modes.D,
    ].join(',')
  return [header, ...r.states.map(line), line(r.total)].join('\n')
}

const DAY = /^\d{4}-\d{2}-\d{2}$/

/** Date filters are whole Lagos days (UTC+1): from 00:00 on the first to 23:59 on the last. */
export function lagosDayRange(
  from: string | undefined,
  to: string | undefined,
): { from: string | null; to: string | null } {
  return {
    from: from && DAY.test(from) ? `${from}T00:00:00+01:00` : null,
    to: to && DAY.test(to) ? `${to}T23:59:59.999+01:00` : null,
  }
}
