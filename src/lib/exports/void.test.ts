import { describe, expect, it } from 'vitest'

import { nextBatchNumber } from '@/lib/tradeLenda/batch'

import { canVoidBatch, voidNumber, voidReasonSchema } from './void'

describe('voiding a batch exported by mistake', () => {
  it('TL-Batch-001 becomes TL-VOID-001, so the next real batch is TL-Batch-001 again', () => {
    expect(voidNumber('TL-Batch-001', [])).toBe('TL-VOID-001')
    // nextBatchNumber only counts "-Batch-" numbers.
    expect(nextBatchNumber('TL', ['TL-VOID-001'])).toBe('TL-Batch-001')
  })
  it('a second void of the same number takes the next free VOID number', () => {
    expect(voidNumber('TL-Batch-001', ['TL-VOID-001'])).toBe('TL-VOID-002')
    expect(voidNumber('SPT-Batch-012', [])).toBe('SPT-VOID-012')
  })
  it('a reason is required (3–500 characters)', () => {
    expect(voidReasonSchema.safeParse('exported by mistake from preview').success).toBe(true)
    expect(voidReasonSchema.safeParse(' ').success).toBe(false)
  })
  it('only a super admin may void', () => {
    expect(canVoidBatch('super_admin')).toBe(true)
    for (const r of ['operations', 'sales', 'funder_partner', 'finance'] as const)
      expect(canVoidBatch(r)).toBe(false)
  })
})
