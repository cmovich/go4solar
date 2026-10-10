import { createHash, randomInt } from 'node:crypto'

/** A code lives for 10 minutes and allows 5 tries. */
export const OTP_TTL_MS = 10 * 60 * 1000
export const OTP_MAX_ATTEMPTS = 5

export function generateOtpCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0')
}

/** Only this hash is stored. Salting with the record id means equal codes never share a hash. */
export function hashOtp(recordId: string, code: string): string {
  return createHash('sha256').update(`${recordId}:${code}`).digest('hex')
}

export type OtpRecord = {
  id: string
  code_hash: string
  attempts: number
  expires_at: string
  consumed_at: string | null
}

export type OtpCheck = 'ok' | 'wrong' | 'expired' | 'locked' | 'used'

/** Decide a verification attempt. The caller increments `attempts` for every non-ok result. */
export function checkOtp(record: OtpRecord, input: string, now = new Date()): OtpCheck {
  if (record.consumed_at) return 'used'
  if (record.attempts >= OTP_MAX_ATTEMPTS) return 'locked'
  if (now.getTime() > new Date(record.expires_at).getTime()) return 'expired'
  const code = input.replace(/\D/g, '')
  return hashOtp(record.id, code) === record.code_hash ? 'ok' : 'wrong'
}
