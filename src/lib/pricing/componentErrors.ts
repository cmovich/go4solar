import type { z } from 'zod'

import type { ComponentDraft } from './adminSchemas'

/** Plain-English messages for the components price list. Each says nothing was saved. */

const NOTHING_SAVED = 'Nothing was saved.'
const FIELD_LABELS: Partial<Record<keyof ComponentDraft, string>> = {
  sku: 'SKU',
  name: 'name',
  category: 'category',
  unitCost: 'unit cost',
  size: 'size',
  source: 'source',
}

const norm = (sku: string) => sku.trim().toUpperCase()

/** Two rows with the same SKU (ignoring case and spaces), or null. */
export function duplicateSkuMessage(drafts: ComponentDraft[]): string | null {
  const seen = new Map<string, number>()
  for (const [i, d] of drafts.entries()) {
    const key = norm(d.sku)
    if (!key) continue
    const first = seen.get(key)
    if (first !== undefined) {
      return `${key} already exists (rows ${first + 1} and ${i + 1}). Use a different SKU. ${NOTHING_SAVED}`
    }
    seen.set(key, i)
  }
  return null
}

/** A form check that failed, naming the row (number and SKU) and the field. */
export function componentIssueMessage(issue: z.core.$ZodIssue, drafts: ComponentDraft[]): string {
  const [index, field] = issue.path
  if (typeof index !== 'number') return `${issue.message}. ${NOTHING_SAVED}`
  const sku = drafts[index]?.sku?.trim()
  const rowName = sku ? `Row ${index + 1} (${sku})` : `Row ${index + 1}`
  const label = typeof field === 'string' ? FIELD_LABELS[field as keyof ComponentDraft] : undefined
  return `${rowName}${label ? `, ${label}` : ''}: ${issue.message}. ${NOTHING_SAVED}`
}

/** The database refused the save (the whole save is one transaction, so nothing changed). */
export function componentDbErrorMessage(
  error: { code?: string; message: string; details?: string | null },
  drafts: ComponentDraft[],
): string {
  if (error.code === '23505') {
    const sku = /\(sku\)=\((.+?)\)/.exec(error.details ?? '')?.[1]
    if (sku) {
      const row = drafts.findIndex((d) => norm(d.sku) === norm(sku))
      const where = row >= 0 ? ` (row ${row + 1})` : ''
      return `${sku} already exists${where}. Use a different SKU. ${NOTHING_SAVED}`
    }
  }
  return 'The components could not be saved, so nothing was changed. Please try again.'
}
