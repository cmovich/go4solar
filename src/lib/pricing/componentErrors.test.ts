import { describe, expect, it } from 'vitest'

import { componentsSchema, type ComponentDraft } from './adminSchemas'
import {
  componentDbErrorMessage,
  componentIssueMessage,
  duplicateSkuMessage,
} from './componentErrors'

const row = (sku: string, extra: Partial<ComponentDraft> = {}): ComponentDraft => ({
  sku,
  name: `${sku} part`,
  category: 'panels',
  unitCost: 120000,
  size: 550,
  source: 'oem',
  active: true,
  sample: false,
  ...extra,
})

describe('duplicateSkuMessage', () => {
  it('none when every SKU is different', () => {
    expect(duplicateSkuMessage([row('PNL-500'), row('PNL-550')])).toBeNull()
  })

  it('names the SKU and both rows (ignoring case and spaces)', () => {
    expect(duplicateSkuMessage([row('PNL-550'), row('INV-1'), row(' pnl-550 ')])).toBe(
      'PNL-550 already exists (rows 1 and 3). Use a different SKU. Nothing was saved.',
    )
  })
})

describe('componentIssueMessage (a form check that failed)', () => {
  it('names the row by number and SKU, and the field', () => {
    const drafts = [row('PNL-500'), row('PNL-550', { size: 0 })]
    const parsed = componentsSchema.safeParse(drafts)
    expect(parsed.success).toBe(false)
    expect(componentIssueMessage(parsed.error!.issues[0]!, drafts)).toBe(
      'Row 2 (PNL-550), size: Enter the size. Nothing was saved.',
    )
  })

  it('a row with no SKU yet is still named by its number', () => {
    const drafts = [row('PNL-500'), row('')]
    const parsed = componentsSchema.safeParse(drafts)
    expect(componentIssueMessage(parsed.error!.issues[0]!, drafts)).toBe(
      'Row 2, SKU: SKU is required. Nothing was saved.',
    )
  })
})

describe('componentDbErrorMessage (the database refused the save)', () => {
  const drafts = [row('PNL-500'), row('PNL-550')]

  it('a SKU used by another component: plain words, not the database text', () => {
    expect(
      componentDbErrorMessage(
        {
          code: '23505',
          message: 'duplicate key value violates unique constraint "components_sku_key"',
          details: 'Key (sku)=(PNL-550) already exists.',
        },
        drafts,
      ),
    ).toBe('PNL-550 already exists (row 2). Use a different SKU. Nothing was saved.')
  })

  it('anything else: says nothing was saved, without database jargon', () => {
    expect(componentDbErrorMessage({ code: 'XX000', message: 'boom', details: null }, drafts)).toBe(
      'The components could not be saved, so nothing was changed. Please try again.',
    )
  })
})
