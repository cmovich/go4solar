import { describe, expect, it } from 'vitest'

import {
  DEFAULT_WIRING,
  gridFromAnswers,
  gridHoursProblem,
  gridTimeProblem,
  quoteNotes,
  rackAlert,
  screensFor,
  siteAnswersSchema,
  wireEstimate,
  type SiteAnswers,
} from './questions'

describe('screensFor: one question per screen, skipping what does not apply', () => {
  it('a complete system on a roof, with daily grid', () => {
    const a: SiteAnswers = {
      scope: 'complete',
      grid: { mode: 'A', pattern: 'daily', hours: 6 },
      mounting: 'roof',
    }
    expect(screensFor(a)).toEqual([
      'scope',
      'style',
      'grid',
      'gridHours',
      'gridTime',
      'mounting',
      'roofType',
      'rack',
      'height',
      'wire',
    ])
  })
  it('"some items" asks what they already have', () => {
    expect(screensFor({ scope: 'some' }).slice(0, 2)).toEqual(['scope', 'existing'])
  })
  it('no grid (D) skips the hours; uncertain or blackout skip the time of day', () => {
    expect(screensFor({ grid: { mode: 'D' } })).not.toContain('gridHours')
    expect(screensFor({ grid: { mode: 'A', pattern: 'uncertain' } })).not.toContain('gridTime')
    expect(screensFor({ grid: { mode: 'B', pattern: 'blackout' } })).not.toContain('gridTime')
    expect(screensFor({ grid: { mode: 'A', pattern: 'daily', hours: 0 } })).not.toContain(
      'gridTime',
    )
  })
  it('ground, car park or other mounting skips the roof questions', () => {
    for (const mounting of ['ground', 'carpark', 'other'] as const) {
      const s = screensFor({ mounting })
      expect(s).not.toContain('roofType')
      expect(s).not.toContain('rack')
      expect(s).not.toContain('height')
      expect(s).toContain('wire')
    }
  })
})

describe('grid hours', () => {
  it('hours 0–24 (half hours allowed)', () => {
    expect(gridHoursProblem(6)).toBeNull()
    expect(gridHoursProblem(24)).toBeNull()
    expect(gridHoursProblem(-1)).toMatch(/0 and 24/)
    expect(gridHoursProblem(25)).toMatch(/0 and 24/)
    expect(gridHoursProblem(2.25)).toMatch(/half/)
  })
  it('day + night must add up to the hours, each within its part of the day', () => {
    expect(gridTimeProblem(6, 2, 4)).toBeNull()
    expect(gridTimeProblem(6, 2, 3)).toBe('Day and night hours should add up to 6 hours.')
    expect(gridTimeProblem(20, 4, 16)).toMatch(/at most 12/)
  })
})

describe('gridFromAnswers (what the sizing engine uses)', () => {
  it('daily or some days: the day/night split', () => {
    expect(
      gridFromAnswers({
        grid: { mode: 'A', pattern: 'daily', hours: 6, dayHours: 2, nightHours: 4 },
      }),
    ).toEqual({
      mode: 'A',
      pattern: 'daily',
      dayHours: 2,
      nightHours: 4,
    })
    expect(
      gridFromAnswers({
        grid: { mode: 'B', pattern: 'some_days', hours: 4, dayHours: 0, nightHours: 4 },
      }),
    ).toMatchObject({
      pattern: 'some_days',
      nightHours: 4,
    })
  })
  it('uncertain and blackout pass through (the engine treats them); D is no grid', () => {
    expect(gridFromAnswers({ grid: { mode: 'C', pattern: 'uncertain' } })).toEqual({
      mode: 'C',
      pattern: 'uncertain',
      dayHours: 0,
      nightHours: 0,
    })
    expect(gridFromAnswers({ grid: { mode: 'A', pattern: 'blackout' } })).toMatchObject({
      pattern: 'blackout',
    })
    expect(gridFromAnswers({ grid: { mode: 'D' } })).toEqual({
      mode: 'D',
      pattern: 'blackout',
      dayHours: 0,
      nightHours: 0,
    })
  })
  it('not answered yet → null', () => {
    expect(gridFromAnswers({})).toBeNull()
    expect(gridFromAnswers({ grid: { mode: 'A' } })).toBeNull()
  })
})

describe('wireEstimate (when the customer does not know the length)', () => {
  it('roof: DC runs down from the roof to the inverter floor and back (+/−), plus slack', () => {
    // 2 storeys, inverter on the ground floor: (2 × 3 + 10) × 2 × 1.15 = 36.8 → 37 m; AC 10 × 1.15 → 12 m
    expect(
      wireEstimate(
        { mounting: 'roof', building: { unit: 'storeys', height: 2, floor: 0 } },
        DEFAULT_WIRING,
      ),
    ).toEqual({ dcMetres: 37, acMetres: 12 })
  })
  it('a higher inverter floor shortens the DC run; feet are turned into storeys', () => {
    expect(
      wireEstimate(
        { mounting: 'roof', building: { unit: 'storeys', height: 3, floor: 2 } },
        DEFAULT_WIRING,
      )!.dcMetres,
    ).toBe(30) // (1 × 3 + 10) × 2 × 1.15 = 29.9
    expect(
      wireEstimate(
        { mounting: 'roof', building: { unit: 'feet', height: 20, floor: 0 } },
        DEFAULT_WIRING,
      )!.dcMetres,
    ).toBe(37) // 20 ft ≈ 2 storeys
  })
  it('ground mounting: just the run across the ground', () => {
    expect(wireEstimate({ mounting: 'ground' }, DEFAULT_WIRING)).toEqual({
      dcMetres: 23,
      acMetres: 12,
    })
  })
  it('known lengths are not estimated', () => {
    expect(
      wireEstimate(
        { mounting: 'roof', wire: { known: true, dcMetres: 20, acMetres: 8 } },
        DEFAULT_WIRING,
      ),
    ).toBeNull()
  })
})

describe('racks', () => {
  it('no rack on a roof that needs one → the orange alert', () => {
    expect(rackAlert({ name: 'Stone-coated tiles', needsRack: true }, { wanted: false })).toBe(
      'Your roof type (Stone-coated tiles) needs a rack to mount panels safely.',
    )
    expect(
      rackAlert(
        { name: 'Stone-coated tiles', needsRack: true },
        { wanted: true, material: 'aluminium' },
      ),
    ).toBeNull()
    expect(rackAlert({ name: 'Flat', needsRack: false }, { wanted: false })).toBeNull()
  })
})

describe('quoteNotes (on every quote and the invoice)', () => {
  it('always: accessories pack and ladder/scaffold', () => {
    const n = quoteNotes(
      { mounting: 'roof', wire: { known: true, dcMetres: 10, acMetres: 5 } },
      { needsRack: true },
    )
    expect(n).toContain('Includes the standard accessories pack.')
    expect(n).toContain('Customer provides ladder/scaffold (not charged).')
  })
  it('ground mounting, estimated wire and a declined rack each add their note', () => {
    expect(quoteNotes({ mounting: 'ground' }, { needsRack: false })).toContain(
      'Customer provides the space and the mounting structure (not charged).',
    )
    expect(
      quoteNotes({ mounting: 'roof', wire: { known: false } }, { needsRack: false }),
    ).toContain("This is an estimate — you may need extra wire, as we haven't seen your site.")
    expect(
      quoteNotes({ mounting: 'roof', rack: { wanted: false } }, { needsRack: true }),
    ).toContain(
      'Customer declined rack; installation on this roof may not be possible without one.',
    )
  })
})

describe('siteAnswersSchema', () => {
  it('accepts a full set and rejects nonsense', () => {
    expect(
      siteAnswersSchema.safeParse({
        scope: 'complete',
        style: 'comfort',
        grid: { mode: 'A', pattern: 'daily', hours: 6, dayHours: 2, nightHours: 4 },
        mounting: 'roof',
        roofTypeId: '11111111-1111-4111-8111-111111111111',
        rack: { wanted: true, material: 'metal' },
        building: { unit: 'storeys', height: 2, floor: 0 },
        wire: { known: false },
      }).success,
    ).toBe(true)
    expect(siteAnswersSchema.safeParse({ style: 'luxury' }).success).toBe(false)
    expect(
      siteAnswersSchema.safeParse({ building: { unit: 'storeys', height: 2, floor: 5 } }).success,
    ).toBe(false)
  })
})

describe('describeAnswers (admin drawer)', () => {
  it('turns the answers into plain rows', async () => {
    const { describeAnswers } = await import('./questions')
    expect(
      describeAnswers({
        scope: 'some',
        existing: { brand: 'Felicity', kva: 5, batteryV: 48 },
        style: 'comfort',
        grid: { mode: 'A', pattern: 'daily', hours: 6, dayHours: 2, nightHours: 4 },
        mounting: 'roof',
        roofTypeName: 'Stone-coated tiles',
        rack: { wanted: true, material: 'aluminium' },
        building: { unit: 'storeys', height: 2, floor: 0 },
        wire: { known: false, dcMetres: 37, acMetres: 12 },
      }),
    ).toEqual([
      ['Wants', 'Just some items'],
      ['Has already', 'Felicity · 5 kVA · 48 V battery'],
      ['Style', 'Comfort'],
      ['Grid', 'A · charge + bypass'],
      ['Grid hours', '6 h a day (2 day, 4 night)'],
      ['Panels on', 'Roof · Stone-coated tiles'],
      ['Rack', 'Yes, aluminium'],
      ['Building', '2 storeys · inverter on floor 0'],
      ['Wire', 'Estimated: DC 37 m · AC 12 m'],
    ])
    expect(describeAnswers({})).toEqual([])
  })
})
