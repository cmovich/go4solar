import { z } from 'zod'

import { computeLoadTotals } from '@/lib/load/totals'
import type { LoadItem } from '@/lib/load/types'
import { NG_STATE_IDS, type NgStateId } from '@/lib/nigeria/states'
import { TENURES, type TenureMonths } from '@/lib/pricing/types'
import { siteAnswersSchema, type SiteAnswers } from '@/lib/wizard/questions'

/** The builder's progress on this device ("I don't know my load" → calculator → back). */
export const BUILDER_STORAGE_KEY = 'g4s.builder.v1'

export const BUILDER_STEPS = [
  'start',
  'existing',
  'items',
  'mounting',
  'roofType',
  'rack',
  'height',
  'wire',
  'installer',
  'summary',
] as const
export type BuilderStep = (typeof BUILDER_STEPS)[number]

export type BuilderState = {
  step: BuilderStep
  scope?: 'complete' | 'some'
  existing?: { brand: string; kva: number | null; batteryV: number | null }
  state?: NgStateId
  loadKva?: number | null
  items: { sku: string; qty: number }[]
  site: SiteAnswers
  installer: 'go4solar' | 'own' | null
  ownDelivery?: boolean
  depositPct: number
  tenure: TenureMonths
}

const stateSchema = z.object({
  version: z.literal(1),
  state: z.object({
    step: z.enum(BUILDER_STEPS),
    scope: z.enum(['complete', 'some']).optional(),
    existing: z
      .object({ brand: z.string(), kva: z.number().nullable(), batteryV: z.number().nullable() })
      .optional(),
    state: z.enum(NG_STATE_IDS as [NgStateId, ...NgStateId[]]).optional(),
    loadKva: z.number().nullable().optional(),
    items: z.array(z.object({ sku: z.string(), qty: z.number().min(0) })),
    site: siteAnswersSchema,
    installer: z.enum(['go4solar', 'own']).nullable(),
    ownDelivery: z.boolean().optional(),
    depositPct: z.number().min(20).max(95),
    tenure: z.number().refine((t): t is TenureMonths => (TENURES as readonly number[]).includes(t)),
  }),
})

export function serialiseBuilderState(s: BuilderState): string {
  return JSON.stringify({ version: 1, state: s })
}

export function parseBuilderState(raw: string | null): BuilderState | null {
  if (!raw) return null
  try {
    const p = stateSchema.safeParse(JSON.parse(raw))
    return p.success ? (p.data.state as BuilderState) : null
  } catch {
    return null
  }
}

/** The calculator's list as a kVA load (running watts ÷ 0.8, up to the next 0.1). */
export function kvaFromItems(items: LoadItem[]): number | null {
  if (items.length === 0) return null
  const w = computeLoadTotals(items).runningW
  return w > 0 ? Math.ceil(Math.round((w / 800) * 1e6) / 1e5) / 10 : null
}

/** Which bar an item belongs to: inverter, battery, panels, dc_wire, ac_wire, or one per accessory kind. */
export function choiceKey(item: { group: string; kind: string | null }): string {
  if (item.group === 'accessories') return `acc:${item.kind}`
  return item.group
}

/** Choose `sku` (qty; 0 removes it), replacing whatever was chosen in the same bar. */
export function setChoice(
  items: { sku: string; qty: number }[],
  sku: string,
  qty: number,
  keyOf: (sku: string) => string | null,
): { sku: string; qty: number }[] {
  const key = keyOf(sku)
  const rest = items.filter((i) => i.sku !== sku && (key === null || keyOf(i.sku) !== key))
  return qty > 0 ? [...rest, { sku, qty }] : rest
}
