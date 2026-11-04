import { describe, expect, it } from 'vitest'

import { gridInsights, insightsCsv, lagosDayRange, type GridLead } from './insights'

const lead = (state: string, grid: GridLead['grid']): GridLead => ({ state, grid })
const g = (
  mode: 'A' | 'B' | 'C' | 'D',
  pattern: 'daily' | 'some_days' | 'uncertain' | 'blackout',
  dayHours = 0,
  nightHours = 0,
) => ({ mode, pattern, dayHours, nightHours })

const leads: GridLead[] = [
  lead('Lagos', g('A', 'daily', 4, 2)),
  lead('Lagos', g('A', 'daily', 2, 6)),
  lead('Lagos', g('B', 'uncertain')),
  lead('Lagos', g('D', 'blackout')),
  lead('Kaduna', g('C', 'some_days', 6, 0)),
  lead('Kaduna', g('B', 'blackout')),
  lead('Kaduna', null), // never answered the grid questions: not counted
  lead('Kaduna', { mode: 'Z', pattern: 'daily', dayHours: 1, nightHours: 1 } as never), // broken: ignored
]

describe('gridInsights (admin "Grid insights")', () => {
  const r = gridInsights(leads)

  it('one row per state that has answers, A–Z, plus a total for every state', () => {
    expect(r.states.map((s) => s.state)).toEqual(['Kaduna', 'Lagos'])
    expect(r.total.answered).toBe(6)
  })

  it('average day and night grid hours over the leads that gave hours', () => {
    const lagos = r.states.find((s) => s.state === 'Lagos')!
    expect(lagos).toMatchObject({ answered: 4, withHours: 2, avgDayHours: 3, avgNightHours: 4 })
    const kaduna = r.states.find((s) => s.state === 'Kaduna')!
    expect(kaduna).toMatchObject({ withHours: 1, avgDayHours: 6, avgNightHours: 0 })
    expect(r.total).toMatchObject({ withHours: 3, avgDayHours: 4, avgNightHours: 2.7 })
  })

  it('% total blackout (incl. "D · no grid") and % uncertain', () => {
    const lagos = r.states.find((s) => s.state === 'Lagos')!
    expect(lagos.blackoutShare).toBe(0.25)
    expect(lagos.uncertainShare).toBe(0.25)
    expect(r.total.blackoutShare).toBeCloseTo(2 / 6)
  })

  it('grid mode choices A/B/C/D: counts and shares', () => {
    const lagos = r.states.find((s) => s.state === 'Lagos')!
    expect(lagos.modes).toEqual({ A: 2, B: 1, C: 0, D: 1 })
    expect(r.total.modes).toEqual({ A: 2, B: 2, C: 1, D: 1 })
  })

  it('no hours given: averages are null (shown as "—"), never 0', () => {
    const only = gridInsights([lead('Kano', g('B', 'uncertain'))])
    expect(only.states[0]).toMatchObject({ avgDayHours: null, avgNightHours: null })
    expect(gridInsights([]).total).toMatchObject({ answered: 0, blackoutShare: null })
  })
})

describe('insightsCsv', () => {
  it('a header, one line per state, then the total; percentages as numbers', () => {
    const csv = insightsCsv(gridInsights(leads)).split('\n')
    expect(csv[0]).toBe(
      'State,Answered,With hours,Avg day grid hours,Avg night grid hours,Blackout %,Uncertain %,Mode A,Mode B,Mode C,Mode D',
    )
    expect(csv[1]).toBe('Kaduna,2,1,6,0,50,0,0,1,1,0')
    expect(csv[2]).toBe('Lagos,4,2,3,4,25,25,2,1,0,1')
    expect(csv[3]).toBe('All states,6,3,4,2.7,33.3,16.7,2,2,1,1')
  })
})

describe('lagosDayRange (date filters are Lagos days)', () => {
  it('from the start of the first day to the end of the last, in Lagos time', () => {
    expect(lagosDayRange('2026-11-01', '2026-11-05')).toEqual({
      from: '2026-11-01T00:00:00+01:00',
      to: '2026-11-05T23:59:59.999+01:00',
    })
    expect(lagosDayRange(undefined, 'nonsense')).toEqual({ from: null, to: null })
  })
})
