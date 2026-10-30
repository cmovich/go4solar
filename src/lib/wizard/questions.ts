import { z } from 'zod'

import type { GridInput, GridMode, GridPattern } from '@/lib/sizing/types'

/**
 * Part E: the quote wizard questions (one per screen). Pure rules: which screens apply, the
 * checks, the grid answers the sizing engine uses, the wire estimate and the notes every quote
 * and invoice carries.
 */

export const STYLES = ['independence', 'comfort', 'essential'] as const
export const MOUNTINGS = ['roof', 'ground', 'carpark', 'other'] as const
export type Mounting = (typeof MOUNTINGS)[number]

const hours = z.number().min(0).max(24)

export const siteAnswersSchema = z.object({
  /** A complete system financed, or just some items. */
  scope: z.enum(['complete', 'some']).optional(),
  /** What they already have (scope "some"). */
  existing: z
    .object({
      brand: z.string().trim().max(80),
      kva: z.number().min(0.1).max(100).nullable(),
      batteryV: z.number().min(6).max(800).nullable(),
    })
    .optional(),
  /** Power management style → the plan to highlight. */
  style: z.enum(STYLES).optional(),
  grid: z
    .object({
      mode: z.enum(['A', 'B', 'C', 'D']),
      pattern: z.enum(['daily', 'some_days', 'uncertain', 'blackout']).optional(),
      hours: hours.optional(),
      dayHours: hours.optional(),
      nightHours: hours.optional(),
    })
    .optional(),
  mounting: z.enum(MOUNTINGS).optional(),
  mountingOther: z.string().trim().max(120).optional(),
  roofTypeId: z.uuid().optional(),
  roofTypeName: z.string().max(80).optional(),
  rack: z
    .object({ wanted: z.boolean(), material: z.enum(['metal', 'aluminium']).optional() })
    .optional(),
  building: z
    .object({
      unit: z.enum(['storeys', 'feet']),
      height: z.number().min(0).max(300),
      floor: z.number().int().min(0).max(100),
    })
    .refine((b) => b.unit !== 'storeys' || b.floor <= b.height, {
      message: 'The floor cannot be higher than the building.',
      path: ['floor'],
    })
    .optional(),
  wire: z
    .object({
      known: z.boolean(),
      dcMetres: z.number().min(1).max(1000).optional(),
      acMetres: z.number().min(1).max(1000).optional(),
    })
    .optional(),
})
export type SiteAnswers = z.infer<typeof siteAnswersSchema>

export type ScreenId =
  | 'scope'
  | 'existing'
  | 'style'
  | 'grid'
  | 'gridHours'
  | 'gridTime'
  | 'mounting'
  | 'roofType'
  | 'rack'
  | 'height'
  | 'wire'

/** The screens for these answers, in order (questions that do not apply are left out). */
export function screensFor(a: SiteAnswers): ScreenId[] {
  const out: ScreenId[] = ['scope']
  if (a.scope === 'some') out.push('existing')
  out.push('style', 'grid')
  const g = a.grid
  if (g && g.mode !== 'D') {
    out.push('gridHours')
    if ((g.pattern === 'daily' || g.pattern === 'some_days') && (g.hours ?? 0) > 0) {
      out.push('gridTime')
    }
  }
  out.push('mounting')
  if (!a.mounting || a.mounting === 'roof') out.push('roofType', 'rack', 'height')
  out.push('wire')
  return out
}

export function gridHoursProblem(h: number): string | null {
  if (!Number.isFinite(h) || h < 0 || h > 24) return 'Enter a number of hours between 0 and 24.'
  if (Math.round(h * 2) !== h * 2) return 'Use whole or half hours.'
  return null
}

/** Day + night must make up the hours, each within its part of the day (12 h each). */
export function gridTimeProblem(total: number, day: number, night: number, nightHours = 12) {
  if (day < 0 || night < 0) return 'Hours cannot be below 0.'
  if (day > 24 - nightHours || night > nightHours) {
    return `Day and night can each be at most ${nightHours} hours.`
  }
  if (Math.abs(day + night - total) > 1e-9) {
    return `Day and night hours should add up to ${total} hours.`
  }
  return null
}

/** The grid supply the sizing engine uses (null until the questions are answered). */
export function gridFromAnswers(a: SiteAnswers): GridInput | null {
  const g = a.grid
  if (!g) return null
  if (g.mode === 'D') return { mode: 'D', pattern: 'blackout', dayHours: 0, nightHours: 0 }
  if (!g.pattern) return null
  if (g.pattern === 'uncertain' || g.pattern === 'blackout') {
    return { mode: g.mode as GridMode, pattern: g.pattern, dayHours: 0, nightHours: 0 }
  }
  if ((g.hours ?? 0) === 0) {
    return {
      mode: g.mode as GridMode,
      pattern: g.pattern as GridPattern,
      dayHours: 0,
      nightHours: 0,
    }
  }
  if (g.dayHours === undefined || g.nightHours === undefined) return null
  return {
    mode: g.mode as GridMode,
    pattern: g.pattern as GridPattern,
    dayHours: g.dayHours,
    nightHours: g.nightHours,
  }
}

export type WiringSettings = {
  metresPerStorey: number
  /** Allowance for the run across the building or ground. */
  horizontalMetres: number
  /** DC needs two conductors (+ and −). */
  dcMultiplier: number
  slackShare: number
  sample?: boolean
}
export const DEFAULT_WIRING: WiringSettings = {
  metresPerStorey: 3,
  horizontalMetres: 10,
  dcMultiplier: 2,
  slackShare: 0.15,
  sample: true,
}
export const wiringSchema = z.object({
  metresPerStorey: z.number().positive().max(10),
  horizontalMetres: z.number().min(0).max(200),
  dcMultiplier: z.number().min(1).max(4),
  slackShare: z.number().min(0).max(1),
  sample: z.boolean().default(false),
})

/** Wire lengths when the customer does not know them (null when they gave the lengths). */
export function wireEstimate(
  a: Pick<SiteAnswers, 'mounting' | 'building' | 'wire'>,
  w: WiringSettings,
): { dcMetres: number; acMetres: number } | null {
  if (a.wire?.known) return null
  const b = a.building
  const storeys = !b
    ? 0
    : b.unit === 'feet'
      ? Math.max(1, Math.round(b.height / (w.metresPerStorey * 3.28)))
      : b.height
  const floor = b?.floor ?? 0
  const vertical = a.mounting === 'roof' || !a.mounting ? Math.max(0, storeys - floor) : floor
  const slack = 1 + w.slackShare
  const dc = (vertical * w.metresPerStorey + w.horizontalMetres) * w.dcMultiplier * slack
  const ac = w.horizontalMetres * slack
  return { dcMetres: Math.ceil(dc - 1e-9), acMetres: Math.ceil(ac - 1e-9) }
}

/** The orange alert when a roof that needs a rack gets none. */
export function rackAlert(
  roof: { name: string; needsRack: boolean } | null,
  rack: SiteAnswers['rack'],
): string | null {
  if (!roof?.needsRack || !rack || rack.wanted) return null
  return `Your roof type (${roof.name}) needs a rack to mount panels safely.`
}

/** Notes printed on every quote and invoice for these answers. */
export function quoteNotes(a: SiteAnswers, roof: { needsRack: boolean } | null): string[] {
  const notes = [
    'Includes the standard accessories pack.',
    'Customer provides ladder/scaffold (not charged).',
  ]
  if (a.mounting && a.mounting !== 'roof') {
    notes.push('Customer provides the space and the mounting structure (not charged).')
  }
  if (a.wire && !a.wire.known) {
    notes.push("This is an estimate — you may need extra wire, as we haven't seen your site.")
  }
  if (a.mounting === 'roof' && roof?.needsRack && a.rack && !a.rack.wanted) {
    notes.push('Customer declined rack; installation on this roof may not be possible without one.')
  }
  return notes
}

const MODE_LABELS = {
  A: 'A · charge + bypass',
  B: 'B · charge only',
  C: 'C · supply only',
  D: 'D · no grid',
} as const
const STYLE_LABELS = {
  independence: '24-hour off-grid',
  comfort: 'Comfort',
  essential: 'Essentials',
}
const MOUNT_LABELS = { roof: 'Roof', ground: 'Ground', carpark: 'Car park', other: 'Other' }

/** The answers as plain [label, value] rows (admin drawer and exports). */
export function describeAnswers(a: SiteAnswers): [string, string][] {
  const rows: [string, string][] = []
  if (a.scope) rows.push(['Wants', a.scope === 'some' ? 'Just some items' : 'A complete system'])
  if (a.existing) {
    const e = a.existing
    rows.push([
      'Has already',
      [
        e.brand || 'Brand not given',
        e.kva ? `${e.kva} kVA` : null,
        e.batteryV ? `${e.batteryV} V battery` : null,
      ]
        .filter(Boolean)
        .join(' · '),
    ])
  }
  if (a.style) rows.push(['Style', STYLE_LABELS[a.style]])
  const g = a.grid
  if (g) {
    rows.push(['Grid', MODE_LABELS[g.mode]])
    if (g.pattern === 'uncertain') rows.push(['Grid hours', "Can't be certain"])
    else if (g.pattern === 'blackout') rows.push(['Grid hours', 'No grid for a while (blackout)'])
    else if (g.pattern && g.hours !== undefined) {
      const split =
        g.dayHours !== undefined && g.nightHours !== undefined
          ? ` (${g.dayHours} day, ${g.nightHours} night)`
          : ''
      rows.push([
        'Grid hours',
        `${g.hours} h ${g.pattern === 'some_days' ? 'on grid days' : 'a day'}${split}`,
      ])
    }
  }
  if (a.mounting) {
    const where =
      a.mounting === 'roof' && a.roofTypeName
        ? `Roof · ${a.roofTypeName}`
        : a.mounting === 'other' && a.mountingOther
          ? `Other · ${a.mountingOther}`
          : MOUNT_LABELS[a.mounting]
    rows.push(['Panels on', where])
  }
  if (a.rack)
    rows.push(['Rack', a.rack.wanted ? `Yes, ${a.rack.material ?? 'material not chosen'}` : 'No'])
  if (a.building) {
    const b = a.building
    rows.push([
      'Building',
      `${b.height} ${b.unit === 'feet' ? 'ft' : 'storeys'} · inverter on floor ${b.floor}`,
    ])
  }
  if (a.wire) {
    rows.push([
      'Wire',
      `${a.wire.known ? 'Known' : 'Estimated'}: DC ${a.wire.dcMetres ?? '?'} m · AC ${a.wire.acMetres ?? '?'} m`,
    ])
  }
  return rows
}
