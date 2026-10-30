import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { SessionInfo } from '@/lib/auth/session'

// --- fakes ---------------------------------------------------------------
const getSessionInfo = vi.fn<() => Promise<SessionInfo>>()
vi.mock('@/lib/auth/session', () => ({ getSessionInfo: () => getSessionInfo() }))
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'x-forwarded-for': '1.2.3.4' }),
}))
vi.mock('@/lib/waitlist/token', () => ({ currentVisitorHash: async () => 'visitor-hash' }))
const hitRateLimit = vi.fn<(key: string, limit: number, window: string) => Promise<boolean>>()
vi.mock('@/lib/ratelimit/hitRateLimit', () => ({
  hitRateLimit: (k: string, l: number, w: string) => hitRateLimit(k, l, w),
}))
const sendOtpSms = vi.fn(async () => ({ id: 'm', status: 'queued' as const }))
vi.mock('@/lib/quotes/messages', () => ({ sendOtpSms: () => sendOtpSms() }))

const QUOTE_ID = '11111111-1111-4111-8111-111111111111'
type Call = { table: string; op: string; payload?: unknown }
const calls: Call[] = []
let otpRow: Record<string, unknown> | null = null
/** The signed-in account's profile (a brand-new account has no name or phone yet). */
let profileRow: Record<string, unknown> = { full_name: null, phone_e164: null }

function fakeAdmin() {
  const rows: Record<string, unknown> = {
    quotes: {
      id: QUOTE_ID,
      waitlist_id: 'lead-1',
      state: 'Lagos',
      plan: 'comfort',
      tenure: 12,
      deposit_share: 0.2,
      status: 'draft',
    },
    waitlist_consumers: {
      id: 'lead-1',
      first_name: 'Amaka',
      surname: 'Okoro',
      phone_e164: '+2348031234567',
      email: 'a@x.test',
      state: 'Lagos',
    },
  }
  const from = (table: string) => {
    const b = {
      select: () => b,
      eq: () => b,
      order: () => b,
      limit: () => b,
      maybeSingle: async () => ({
        data:
          table === 'phone_otps'
            ? otpRow
            : table === 'profiles'
              ? profileRow
              : (rows[table] ?? null),
        error: null,
      }),
      insert: (payload: unknown) => {
        calls.push({ table, op: 'insert', payload })
        return {
          select: () => ({ single: async () => ({ data: { id: 'otp-new' }, error: null }) }),
        }
      },
      update: (payload: unknown) => {
        calls.push({ table, op: 'update', payload })
        return b
      },
    }
    return b
  }
  return { from }
}
vi.mock('@/lib/auth/emailVerification', () => ({
  sendEmailVerification: async () => {},
  siteOrigin: () => 'http://localhost:3000',
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => fakeAdmin() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({}) }))

const { sendPhoneCode, verifyPhoneCode } = await import('./actions')
const { hashOtp } = await import('@/lib/otp/otp')

const user: SessionInfo = { user: { id: 'u-1', email: 'a@x.test' }, role: 'consumer', aal: 'aal1' }

beforeEach(() => {
  calls.length = 0
  otpRow = null
  profileRow = { full_name: null, phone_e164: null }
  hitRateLimit.mockReset()
  sendOtpSms.mockClear()
  getSessionInfo.mockResolvedValue(user)
})

describe('sendPhoneCode', () => {
  it('sends a code, storing only its hash, when under the limit', async () => {
    hitRateLimit.mockResolvedValue(true)
    const r = await sendPhoneCode({ quoteId: QUOTE_ID })
    expect(r.ok).toBe(true)
    expect(hitRateLimit).toHaveBeenCalledWith('otp-send:+2348031234567', 5, '1 hour')
    expect(sendOtpSms).toHaveBeenCalledTimes(1)
    const hashUpdate = calls.find((c) => c.table === 'phone_otps' && c.op === 'update')
    expect((hashUpdate?.payload as { code_hash: string }).code_hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('refuses the 6th send in an hour (rate limit) and sends nothing', async () => {
    hitRateLimit.mockResolvedValue(false)
    const r = await sendPhoneCode({ quoteId: QUOTE_ID })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/too many codes/i)
    expect(sendOtpSms).not.toHaveBeenCalled()
    expect(calls).toEqual([])
  })
})

describe('verifyPhoneCode', () => {
  const fresh = (over: Record<string, unknown> = {}) => ({
    id: 'otp-1',
    code_hash: hashOtp('otp-1', '123456'),
    attempts: 0,
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    consumed_at: null,
    ...over,
  })

  it('is rate limited per IP (10 an hour)', async () => {
    hitRateLimit.mockResolvedValue(false)
    otpRow = fresh()
    const r = await verifyPhoneCode({ quoteId: QUOTE_ID, code: '123456' })
    expect(hitRateLimit).toHaveBeenCalledWith('otp-verify:1.2.3.4', 10, '1 hour')
    expect(r.ok).toBe(false)
    expect(calls).toEqual([])
  })

  it('rejects an expired code and counts the attempt', async () => {
    hitRateLimit.mockResolvedValue(true)
    otpRow = fresh({ expires_at: new Date(Date.now() - 1000).toISOString() })
    const r = await verifyPhoneCode({ quoteId: QUOTE_ID, code: '123456' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/expired/i)
    expect(calls).toContainEqual({ table: 'phone_otps', op: 'update', payload: { attempts: 1 } })
  })

  it('locks on the 6th attempt even with the right code', async () => {
    hitRateLimit.mockResolvedValue(true)
    otpRow = fresh({ attempts: 5 })
    const r = await verifyPhoneCode({ quoteId: QUOTE_ID, code: '123456' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/too many wrong tries/i)
    expect(calls.some((c) => c.table === 'quotes')).toBe(false)
  })

  it('on the right code: attaches the quote, marks it chosen and fills the profile', async () => {
    hitRateLimit.mockResolvedValue(true)
    otpRow = fresh()
    const r = await verifyPhoneCode({ quoteId: QUOTE_ID, code: '123456' })
    expect(r.ok).toBe(true)
    expect(calls).toContainEqual({
      table: 'quotes',
      op: 'update',
      payload: { owner_id: 'u-1', status: 'chosen' },
    })
    expect(calls).toContainEqual({
      table: 'profiles',
      op: 'update',
      payload: { full_name: 'Amaka Okoro', phone_e164: '+2348031234567', state: 'Lagos' },
    })
  })
})

// Never mix one person's quote with another person's account (Semako, 30 Oct).
describe('signed in as someone else', () => {
  const fresh = () => ({
    id: 'otp-1',
    code_hash: hashOtp('otp-1', '123456'),
    attempts: 0,
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    consumed_at: null,
  })
  beforeEach(() => {
    hitRateLimit.mockResolvedValue(true)
    profileRow = { full_name: 'Moses Donatus', phone_e164: '+2348031110000' }
  })

  it('without "Continue as": no code is sent and nothing is attached', async () => {
    const r = await sendPhoneCode({ quoteId: QUOTE_ID })
    expect(r).toMatchObject({ ok: false })
    if (!r.ok)
      expect(r.error).toBe(
        "You're signed in as Moses Donatus. Continue as Moses Donatus, or sign out to apply as someone else.",
      )
    expect(sendOtpSms).not.toHaveBeenCalled()
    otpRow = fresh()
    const v = await verifyPhoneCode({ quoteId: QUOTE_ID, code: '123456' })
    expect(v.ok).toBe(false)
    expect(calls.some((c) => c.table === 'quotes' || c.table === 'profiles')).toBe(false)
  })

  it('"Continue as Moses": the code goes to Moses’s phone and his name is never overwritten', async () => {
    const r = await sendPhoneCode({ quoteId: QUOTE_ID, asAccount: true })
    expect(r.ok).toBe(true)
    expect(hitRateLimit).toHaveBeenCalledWith('otp-send:+2348031110000', 5, '1 hour')
    otpRow = fresh()
    const v = await verifyPhoneCode({ quoteId: QUOTE_ID, code: '123456', asAccount: true })
    expect(v.ok).toBe(true)
    expect(calls).toContainEqual({
      table: 'quotes',
      op: 'update',
      payload: { owner_id: 'u-1', status: 'chosen' },
    })
    expect(calls.some((c) => c.table === 'profiles')).toBe(false)
  })

  it('the same person signed in (same name and phone) goes straight on, as before', async () => {
    profileRow = { full_name: 'Amaka Okoro', phone_e164: '+2348031234567' }
    expect((await sendPhoneCode({ quoteId: QUOTE_ID })).ok).toBe(true)
  })
})
