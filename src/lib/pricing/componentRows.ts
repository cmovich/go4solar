import { componentDraftSchema, SIZE_KEY, type ComponentDraft } from './adminSchemas'
import { specProblems } from '@/lib/components/specs'

/**
 * Admin → Pricing → Components, row by row (pure). Each row is checked on its own: valid rows are
 * saved and a bad row only shows its own error. Ordinary accessories have no size (blank or 0 =
 * not applicable); a pack needs its max kVA (that is how it is picked); inverters, batteries and
 * panels need their size. Missing volts is a warning, never a block.
 */
export type RowError = { index: number; sku: string; message: string }

const UNITS = { panels: 'W', battery: 'kWh', inverter: 'kVA', accessories: 'max kVA' } as const

const isPackDraft = (c: Pick<ComponentDraft, 'category' | 'kind'>) =>
  c.category === 'accessories' && (c.kind === 'pack' || c.kind == null)

/** What a row stores in stock_sizes: nothing for ordinary accessories. */
export function stockSizesFor(c: ComponentDraft): Record<string, number> {
  if (c.category === 'accessories' && !(isPackDraft(c) && c.size > 0)) return {}
  return { [SIZE_KEY[c.category]]: c.size }
}

/**
 * Picked by size as the "Protection, cables and mounting" pack: accessories marked as a pack (or
 * older rows with no type) WITH a max kVA above 0. Ordinary accessories never are.
 */
export function isPackRow(r: {
  category: string
  kind: string | null | undefined
  maxKva: number | null | undefined
}): boolean {
  return (
    r.category === 'accessories' &&
    (r.kind === 'pack' || r.kind == null) &&
    typeof r.maxKva === 'number' &&
    r.maxKva > 0
  )
}

export function checkComponentRows(input: unknown[]): {
  valid: { index: number; draft: ComponentDraft }[]
  errors: RowError[]
  warnings: RowError[]
} {
  const valid: { index: number; draft: ComponentDraft }[] = []
  const errors: RowError[] = []
  const warnings: RowError[] = []
  const seen = new Map<string, number>()
  input.forEach((raw, index) => {
    const rawSku = String((raw as { sku?: unknown })?.sku ?? '')
      .trim()
      .toUpperCase()
    const fail = (message: string) => errors.push({ index, sku: rawSku, message })
    const p = componentDraftSchema.safeParse(raw)
    if (!p.success) {
      const issue = p.error.issues[0]
      const field = issue?.path[0]
      return fail(`${issue?.message ?? 'Check the row'}${field ? ` (${String(field)})` : ''}.`)
    }
    const c = p.data
    const sku = c.sku.toUpperCase()
    const first = seen.get(sku)
    if (first !== undefined) {
      return fail(`${sku} is already used on row ${first + 1}. Use a different SKU.`)
    }
    seen.set(sku, index)
    const size = c.size
    if (c.category !== 'accessories' && !(size > 0)) {
      return fail(`Enter the size (${UNITS[c.category]}).`)
    }
    if (c.category === 'accessories' && c.kind === 'pack' && !(size > 0)) {
      return fail('Enter the max kVA for this pack (it is picked by it).')
    }
    const problem = specProblems({
      category: c.category,
      specs: c.specs,
      nominalVoltage: c.nominalVoltage,
    })[0]
    if (problem) return fail(`${problem}.`)
    if (c.category !== 'accessories' && c.nominalVoltage == null) {
      warnings.push({ index, sku, message: 'Volts not entered yet.' })
    }
    valid.push({ index, draft: c })
  })
  return { valid, errors, warnings }
}
