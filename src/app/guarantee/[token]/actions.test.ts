import { beforeEach, describe, expect, it, vi } from 'vitest'

import { idHash } from '@/lib/ids/idHash'

const ID_SECRET = 'local-test-only-id-hash-0123456789abcdef'
process.env.ID_HASH_SECRET = ID_SECRET

vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'x-forwarded-for': '1.2.3.4' }),
}))
vi.mock('@/lib/auth/emailVerification', () => ({ siteOrigin: () => 'http://localhost:3000' }))
vi.mock('@/lib/ratelimit/hitRateLimit', () => ({ hitRateLimit: async () => true }))

const row = {
  id: 'g-1',
  application_id: 'app-1',
  name: 'Bola Ade',
  phone: '+2348030000000',
  email: 'bola@x.test',
  status: 'in_progress',
  steps: { intro: true },
  details: {},
  expires_at: '2099-01-01T00:00:00Z',
}
let check: 'ok' | 'expired' = 'ok'
let active = 0
const APPLICANT_NIN = '11111111111'
vi.mock('@/lib/agreements/guarantor', () => ({
  openGuarantee: async () => ({ check, row }),
  guaranteeContext: async () => ({
    applicantNinHash: idHash('nin', APPLICANT_NIN, ID_SECRET),
    applicantName: 'Ada Obi',
    template: { id: 't-2', version: 1, status: 'draft' },
    text: 'Guarantee text',
    reference: 'G4S-TEST',
  }),
  activeGuaranteesFor: async () => active,
}))
const finaliseAgreement = vi.fn<(input: unknown) => Promise<object>>(async () => ({}))
vi.mock('@/lib/agreements/server', async () => {
  const real =
    await vi.importActual<typeof import('@/lib/agreements/server')>('@/lib/agreements/server')
  return {
    maxActiveGuarantees: async () => 2,
    CODE_MESSAGES: real.CODE_MESSAGES,
    signaturePngFromDataUrl: real.signaturePngFromDataUrl,
    verifySignatureCode: async () => ({ result: 'ok', at: '2026-10-10T10:00:00Z' }),
    finaliseAgreement: (i: unknown) => finaliseAgreement(i),
  }
})
const consents: unknown[] = []
vi.mock('@/lib/consent/server', () => ({
  recordConsents: async (rows: unknown[]) => {
    consents.push(...rows)
  },
}))

const verifyNin = vi.fn(async () => ({
  status: 'passed' as const,
  nameMatch: true,
  dobMatch: true,
}))
vi.mock('@/lib/providers/kyc', () => ({
  getKycProvider: async () => ({ name: 'mock', verifyNin }),
}))
vi.mock('@/lib/applications/server', () => ({ checkSummaries: async () => [] }))

const updates: unknown[] = []
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      insert: async () => ({}),
      update: (u: unknown) => {
        updates.push(u)
        return { eq: async () => ({}) }
      },
    }),
  }),
}))

const { verifyGuarantorNin, acceptGuarantee, signGuarantee } = await import('./actions')
const { SIGN_FAILED } = await import('@/lib/agreements/signFailure')

const adult = { firstName: 'Bola', surname: 'Ade', dob: '1980-05-01', nin: '12345678901' }

beforeEach(() => {
  vi.clearAllMocks()
  updates.length = 0
  consents.length = 0
  check = 'ok'
  active = 0
})

describe('guarantor NIN step', () => {
  it('rejects the applicant guaranteeing their own plan (same NIN), before any paid lookup', async () => {
    const r = await verifyGuarantorNin('token', { ...adult, nin: APPLICANT_NIN })
    expect(r).toEqual({ ok: false, error: 'The applicant cannot be their own guarantor.' })
    expect(verifyNin).not.toHaveBeenCalled()
  })

  it('enforces the maximum number of active guarantees per person', async () => {
    active = 2
    const r = await verifyGuarantorNin('token', adult)
    expect(r).toEqual({
      ok: false,
      error: 'You are already guaranteeing the maximum number of payment plans.',
    })
    expect(verifyNin).not.toHaveBeenCalled()
  })

  it('rejects under-18s', async () => {
    const r = await verifyGuarantorNin('token', { ...adult, dob: '2015-01-01' })
    expect(r).toEqual({ ok: false, error: 'A guarantor must be 18 or older.' })
  })

  it('accepts a different adult and stores only the hash and last 4 digits', async () => {
    const r = await verifyGuarantorNin('token', adult)
    expect(r).toEqual({ ok: true, status: 'passed' })
    const saved = JSON.stringify(updates)
    expect(saved).toContain('"nin_last4":"8901"')
    expect(saved).toContain(`"nin_hash":"${idHash('nin', adult.nin, ID_SECRET)}"`)
    expect(saved).not.toContain(adult.nin)
  })
})

describe('guarantor link', () => {
  it('an expired link cannot be used', async () => {
    check = 'expired'
    expect(await acceptGuarantee('token')).toEqual({
      ok: false,
      error: 'This link has expired. Ask the customer to send you a new one.',
    })
    expect(updates).toHaveLength(0)
  })
})

// Fix-up 1 #3: on Vercel the PDF step threw and the guarantor saw a bare 500.
describe('guarantor signing', () => {
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.alloc(200, 1),
  ])
  const valid = {
    typedName: 'Bola Ade',
    ticks: { agreement: true, liability: true, bureau: true, biometrics: true },
    scrolledToEnd: true,
    signature: `data:image/png;base64,${png.toString('base64')}`,
    code: '123456',
  }
  const ready = { intro: true, nin: true, consent: true, face: true, about: true }

  it('a failure while finishing the guarantee returns a clear message and logs the reason', async () => {
    const saved = row.steps
    row.steps = ready
    finaliseAgreement.mockRejectedValueOnce(new Error('ENOENT: Inter-Regular.ttf'))
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await signGuarantee('token', valid)).toEqual({ ok: false, error: SIGN_FAILED })
    expect(log).toHaveBeenCalledWith(
      '[agreements] could not finish the guarantor agreement:',
      'ENOENT: Inter-Regular.ttf',
    )
    // The guarantee is not marked signed and no consents are stored.
    expect(updates).toEqual([])
    expect(consents).toEqual([])
    log.mockRestore()
    row.steps = saved
  })
})
