import { createHash } from 'node:crypto'

import { GUARANTOR_TICKS, consumerTicks } from '@/lib/agreements/ticks'
import { CONSENT_TEXT } from '@/lib/waitlist/schema'

import { BIOMETRIC_CONSENT_TEXT } from './wording'

/** Shown before the face check (customer and guarantor). NDPA 2023 / GAID 2025: explicit consent. */
export { BIOMETRIC_CONSENT_TEXT }

export type ConsentKind =
  | 'contact'
  | 'biometric'
  | 'credit_check'
  | 'agreement'
  | 'collateral'
  | 'remote_lock'
  | 'guarantee'
  | 'marketing'

/**
 * Every consent text with its version (key-YYYY-MM-DD). Change the wording → change the date, so
 * stored consents always point at the exact text the person agreed to. No marketing consent is
 * collected in Phase 1 (no marketing messages are sent).
 */
export const CONSENTS = {
  contact: { kind: 'contact', version: 'contact-2026-10-09', text: CONSENT_TEXT },
  biometric: { kind: 'biometric', version: 'biometric-2026-10-10', text: BIOMETRIC_CONSENT_TEXT },
} as const satisfies Record<string, { kind: ConsentKind; version: string; text: string }>

const sha = (text: string) => createHash('sha256').update(text).digest('hex')

export function consentRecord(key: keyof typeof CONSENTS) {
  const c = CONSENTS[key]
  return { kind: c.kind as ConsentKind, text_version: c.version, text_sha256: sha(c.text) }
}

const CONSUMER_KIND: Record<string, ConsentKind> = {
  agreement: 'agreement',
  collateral: 'collateral',
  lock: 'remote_lock',
  bureau: 'credit_check',
  biometrics: 'biometric',
}
const GUARANTOR_KIND: Record<string, ConsentKind> = {
  agreement: 'guarantee',
  liability: 'guarantee',
  bureau: 'credit_check',
  biometrics: 'biometric',
}

/**
 * The signing ticks (one consent each), versioned by the date each tick's wording was written.
 * The consumer lock tick shows the lock days from the setting (wording of 2026-10-14).
 */
const TICK_DATES: Record<string, string> = { 'consumer:lock': '2026-10-14' }

export function tickConsents(who: 'consumer' | 'guarantor', lockAfterDays = 7) {
  const ticks = who === 'consumer' ? consumerTicks(lockAfterDays) : GUARANTOR_TICKS
  const kinds = who === 'consumer' ? CONSUMER_KIND : GUARANTOR_KIND
  return ticks.map((t) => ({
    tickId: t.id,
    kind: kinds[t.id]!,
    text_version: `${who}-tick-${t.id}-${TICK_DATES[`${who}:${t.id}`] ?? '2026-10-10'}`,
    text_sha256: sha(t.label),
  }))
}
