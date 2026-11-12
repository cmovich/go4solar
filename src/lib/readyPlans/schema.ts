import { z } from 'zod'

import type { Database, Json } from '@/lib/supabase/database.types'

import { LINE_KINDS, SYSTEM_VOLTAGES, type ReadyPlan } from './types'

/** Admin → Pricing → Ready-made plans: one plan (shared by the form and the server action). */
const money = z.number().min(0).max(1_000_000_000)
export const readyLineSchema = z.object({
  kind: z.enum(LINE_KINDS),
  name: z.string().trim().min(1, 'Give every line a name').max(80),
  spec: z.string().trim().max(120).default(''),
  qty: z.number().int().min(1).max(1000),
  vendorCost: money,
  price: money,
  sku: z.string().trim().max(40).nullable().optional(),
})

const text = (max: number) =>
  z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
    z.string().trim().max(max).nullable(),
  )

export const readyPlanSchema = z.object({
  id: z.string().optional(),
  slug: z
    .string()
    .trim()
    .regex(
      /^[a-z0-9]+(-[a-z0-9]+)*$/,
      'Use lower-case letters, numbers and dashes (e.g. oga-boss)',
    ),
  name: z.string().trim().min(2).max(80),
  tagline: text(160).default(null),
  summary: z.string().trim().min(2).max(160),
  tag: text(40).default(null),
  systemVoltage: z.union(
    SYSTEM_VOLTAGES.map((v) => z.literal(v)) as [
      z.ZodLiteral<12>,
      z.ZodLiteral<24>,
      z.ZodLiteral<48>,
    ],
  ),
  inverterKva: z.number().positive().max(100),
  image: z.string().max(300).nullable().default(null),
  lines: z.array(readyLineSchema).min(1, 'Add at least one line').max(40),
  canPower: z.array(z.string().trim().min(1).max(120)).max(20).default([]),
  backup: z.array(z.string().trim().min(1).max(160)).max(10).default([]),
  depositShare: z.number().min(0.2).max(0.95).default(0.2),
  monthlyRate: z.number().min(0).max(0.2).default(0.05),
  tenures: z
    .array(
      z.union(
        [3, 6, 9, 12, 18, 24].map((t) => z.literal(t)) as [
          z.ZodLiteral<3>,
          ...z.ZodLiteral<number>[],
        ],
      ),
    )
    .min(1)
    .default([6, 9, 12]),
  fullDiscount: z.number().min(0).max(0.89).default(0),
  deliveryState: z.string().trim().min(2).max(40).default('Kaduna'),
  adminNote: text(500).default(null),
  sortOrder: z.number().int().default(0),
  active: z.boolean().default(true),
  sample: z.boolean().default(true),
})

/** Checks the form cannot express on its own, in plain words. */
export function planProblems(p: ReadyPlan): string[] {
  const out: string[] = []
  if (!p.tenures.includes(12))
    out.push('Offer 12 months: the pay-in-full price is worked out from it.')
  if (!p.lines.some((l) => l.kind === 'logistics'))
    out.push('Add the included delivery as a "logistics" line.')
  if (p.lines.some((l) => l.price === 0)) out.push('Every line needs a Go4Solar price above ₦0.')
  return out
}

type Row = Database['public']['Tables']['ready_plans']['Row']
type Insert = Database['public']['Tables']['ready_plans']['Insert']

export function planToRow(p: ReadyPlan): Insert {
  return {
    ...(p.id ? { id: p.id } : {}),
    slug: p.slug,
    name: p.name,
    tagline: p.tagline,
    summary: p.summary,
    tag: p.tag,
    system_voltage: p.systemVoltage,
    inverter_kva: p.inverterKva,
    image: p.image,
    lines: p.lines as unknown as Json,
    can_power: p.canPower as unknown as Json,
    backup: p.backup as unknown as Json,
    deposit_share: p.depositShare,
    monthly_rate: p.monthlyRate,
    tenures: p.tenures,
    full_discount: p.fullDiscount,
    delivery_state: p.deliveryState,
    admin_note: p.adminNote,
    sort_order: p.sortOrder,
    active: p.active,
    sample: p.sample,
  }
}

/** A database row as a plan (numeric columns arrive as numbers or strings). */
export function planFromRow(r: Row): ReadyPlan {
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    tagline: r.tagline,
    summary: r.summary,
    tag: r.tag,
    systemVoltage: Number(r.system_voltage) as ReadyPlan['systemVoltage'],
    inverterKva: Number(r.inverter_kva),
    image: r.image,
    lines: (r.lines as unknown as ReadyPlan['lines']).map((l) => ({
      ...l,
      qty: Number(l.qty),
      vendorCost: Number(l.vendorCost),
      price: Number(l.price),
    })),
    canPower: r.can_power as unknown as string[],
    backup: r.backup as unknown as string[],
    depositShare: Number(r.deposit_share),
    monthlyRate: Number(r.monthly_rate),
    tenures: [...r.tenures].sort((a, b) => a - b),
    fullDiscount: Number(r.full_discount),
    deliveryState: r.delivery_state,
    adminNote: r.admin_note,
    sortOrder: r.sort_order,
    active: r.active,
    sample: r.sample,
  }
}
