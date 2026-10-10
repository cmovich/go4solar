import { describe, expect, it } from 'vitest'

import { OTP_MAX_ATTEMPTS, OTP_TTL_MS, checkOtp, generateOtpCode, hashOtp } from './otp'

const now = new Date('2026-10-10T12:00:00Z')
const record = (over: Partial<Parameters<typeof checkOtp>[0]> = {}) => ({
  id: 'otp-1',
  code_hash: hashOtp('otp-1', '123456'),
  attempts: 0,
  expires_at: new Date(now.getTime() + OTP_TTL_MS).toISOString(),
  consumed_at: null,
  ...over,
})

describe('generateOtpCode', () => {
  it('is always six digits', () => {
    for (let i = 0; i < 200; i++) expect(generateOtpCode()).toMatch(/^\d{6}$/)
  })
})

describe('hashOtp', () => {
  it('never stores the code itself and is bound to the record id', () => {
    const h = hashOtp('otp-1', '123456')
    expect(h).not.toContain('123456')
    expect(h).toMatch(/^[0-9a-f]{64}$/)
    expect(hashOtp('otp-2', '123456')).not.toBe(h)
  })
})

describe('checkOtp', () => {
  it('accepts the right code inside 10 minutes', () => {
    expect(OTP_TTL_MS).toBe(10 * 60 * 1000)
    expect(checkOtp(record(), '123456', now)).toBe('ok')
    expect(checkOtp(record(), ' 123 456 ', now)).toBe('ok')
  })

  it('rejects a wrong code', () => {
    expect(checkOtp(record(), '654321', now)).toBe('wrong')
  })

  it('rejects an expired code even when it is right', () => {
    const later = new Date(now.getTime() + OTP_TTL_MS + 1)
    expect(checkOtp(record(), '123456', later)).toBe('expired')
  })

  it('locks after 5 attempts: the 6th try fails even with the right code', () => {
    expect(OTP_MAX_ATTEMPTS).toBe(5)
    expect(checkOtp(record({ attempts: 4 }), '123456', now)).toBe('ok')
    expect(checkOtp(record({ attempts: 5 }), '123456', now)).toBe('locked')
  })

  it('a used code cannot be used again', () => {
    expect(checkOtp(record({ consumed_at: now.toISOString() }), '123456', now)).toBe('used')
  })
})
