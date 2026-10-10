import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { SessionInfo } from '@/lib/auth/session'

const getSessionInfo = vi.fn<() => Promise<SessionInfo>>()
vi.mock('@/lib/auth/session', () => ({ getSessionInfo: () => getSessionInfo() }))
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'x-forwarded-for': '1.2.3.4', 'user-agent': 'test' }),
}))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
vi.mock('@/lib/auth/emailVerification', () => ({ siteOrigin: () => 'http://localhost:3000' }))

const ctx = {
  applicationId: 'app-1',
  userId: 'u-1',
  isBusiness: false,
  customerName: 'Ada Obi',
  signerName: 'Ada Obi',
  defaultTitle: null,
  phone: '+2348031234567',
  email: 'ada@x.test',
  reference: 'G4S-ABC',
  quote: { monthly: 100000 },
  tenure: 6,
  values: {},
  template: { id: 't-1', version: 1, status: 'draft' },
  text: 'Agreement text',
  lateFee: { daily: 0.0075, cap: 0.25 },
  guarantee: null,
  signed: null as null | { id: string },
}
const loadConsumerSignContext = vi.fn(async () => ctx)
vi.mock('@/lib/agreements/consumer', () => ({
  loadConsumerSignContext: () => loadConsumerSignContext(),
}))

const sendSignatureCode = vi.fn(async () => ({ ok: true as const }))
const verifySignatureCode = vi.fn(async () => ({
  result: 'ok' as const,
  at: '2026-10-10T10:00:00Z',
}))
const finaliseAgreement = vi.fn<(input: unknown) => Promise<object>>(async () => ({}))
vi.mock('@/lib/agreements/server', async () => {
  const real =
    await vi.importActual<typeof import('@/lib/agreements/server')>('@/lib/agreements/server')
  return {
    CODE_MESSAGES: real.CODE_MESSAGES,
    signaturePngFromDataUrl: real.signaturePngFromDataUrl,
    sendSignatureCode: () => sendSignatureCode(),
    verifySignatureCode: () => verifySignatureCode(),
    finaliseAgreement: (i: unknown) => finaliseAgreement(i),
    inviteGuarantor: async () => ({ id: 'g' }),
  }
})

const updates: unknown[] = []
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ single: async () => ({ data: { steps: { review: true } } }) }),
      }),
      update: (u: unknown) => {
        updates.push(u)
        return { eq: async () => ({}) }
      },
    }),
  }),
}))

const { sendConsumerSignCode, signConsumerAgreement } = await import('./actions')

// A real (tiny) PNG: 8-byte signature + padding so it passes the size check.
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(200, 1),
])
const valid = {
  typedName: 'Ada Obi',
  ticks: { agreement: true, collateral: true, lock: true, bureau: true, biometrics: true },
  scrolledToEnd: true,
  signature: `data:image/png;base64,${png.toString('base64')}`,
  code: '123456',
}
const verified: SessionInfo = {
  user: { id: 'u-1', email: 'ada@x.test' },
  role: 'consumer',
  aal: 'aal1',
  emailVerified: true,
}

beforeEach(() => {
  vi.clearAllMocks()
  updates.length = 0
  ctx.signed = null
  getSessionInfo.mockResolvedValue(verified)
})

describe('consumer signing', () => {
  it('an unverified email cannot get a code or sign', async () => {
    getSessionInfo.mockResolvedValue({ ...verified, emailVerified: false })
    expect(await sendConsumerSignCode()).toMatchObject({
      ok: false,
      needsEmail: true,
      error: 'Verify your email to sign.',
    })
    expect(await signConsumerAgreement(valid)).toMatchObject({ ok: false, needsEmail: true })
    expect(sendSignatureCode).not.toHaveBeenCalled()
    expect(finaliseAgreement).not.toHaveBeenCalled()
  })

  it('refuses without scrolling to the end (server check too)', async () => {
    const r = await signConsumerAgreement({ ...valid, scrolledToEnd: false })
    expect(r).toMatchObject({ ok: false })
    expect(finaliseAgreement).not.toHaveBeenCalled()
  })

  it('refuses unless every box is ticked', async () => {
    const r = await signConsumerAgreement({ ...valid, ticks: { ...valid.ticks, lock: false } })
    expect(r).toEqual({ ok: false, error: 'Please tick every box.' })
  })

  it('refuses a wrong phone code', async () => {
    verifySignatureCode.mockResolvedValueOnce({ result: 'wrong' } as never)
    const r = await signConsumerAgreement(valid)
    expect(r).toMatchObject({ ok: false })
    expect(finaliseAgreement).not.toHaveBeenCalled()
  })

  it('signs the stored agreement text and marks the terms step done', async () => {
    expect(await signConsumerAgreement(valid)).toEqual({ ok: true })
    expect(finaliseAgreement).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'consumer',
        text: 'Agreement text',
        folder: 'u-1/app-1',
        ip: '1.2.3.4',
        otpVerifiedAt: '2026-10-10T10:00:00Z',
      }),
    )
    expect(updates).toContainEqual({ steps: { review: true, terms: true } })
  })

  it('cannot sign twice', async () => {
    ctx.signed = { id: 'a-1' }
    expect(await signConsumerAgreement(valid)).toEqual({
      ok: false,
      error: 'You have already signed.',
    })
  })
})
