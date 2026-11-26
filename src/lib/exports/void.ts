import { z } from 'zod'

import type { AppRole } from '@/lib/auth/staffRoles'

/**
 * Voiding a funder batch exported by mistake (pure; Semako, 26 Nov 2026). The batch is renamed
 * from TL-Batch-001 to TL-VOID-001 (the old number is kept), so its number is free for the next
 * real batch; the funder never sees it and its people can be exported again. Nothing is deleted.
 */
export function voidNumber(number: string, existingVoid: string[]): string {
  const m = /^([A-Z]{2,5})-Batch-(\d+)$/.exec(number)
  if (!m) throw new Error(`Not a batch number: ${number}`)
  const [, prefix, digits] = m
  let n = Number(digits)
  const taken = new Set(existingVoid)
  const as = (k: number) => `${prefix}-VOID-${String(k).padStart(3, '0')}`
  while (taken.has(as(n))) n += 1
  return as(n)
}

export const voidReasonSchema = z
  .string()
  .trim()
  .min(3, 'Give the reason (at least 3 characters).')
  .max(500)

export const canVoidBatch = (role: AppRole | null | undefined) => role === 'super_admin'
