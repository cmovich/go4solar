import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { SessionInfo } from '@/lib/auth/session'

const getSessionInfo = vi.fn<() => Promise<SessionInfo>>()
vi.mock('@/lib/auth/session', () => ({ getSessionInfo: () => getSessionInfo() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

type Call = { table: string; op: string; payload?: unknown; match?: unknown }
const calls: Call[] = []
let rows: Record<string, unknown>[] = []
const uploads: { path: string; type: string }[] = []

function fakeClient() {
  return {
    from: (table: string) => {
      let match: Record<string, unknown> = {}
      const builder = {
        select: () => builder,
        order: () => builder,
        eq: (k: string, v: unknown) => {
          match = { ...match, [k]: v }
          return builder
        },
        maybeSingle: async () => ({
          data: rows.find((r) => Object.entries(match).every(([k, v]) => r[k] === v)) ?? null,
          error: null,
        }),
        then: (resolve: (v: unknown) => void) => {
          const op = calls[calls.length - 1]
          if (op && op.table === table && !('done' in op)) {
            ;(op as Call & { done?: boolean }).done = true
            op.match = match
            return resolve({ error: null })
          }
          return resolve({ data: rows, error: null })
        },
        insert: (payload: unknown) => {
          calls.push({ table, op: 'insert', payload })
          return builder
        },
        update: (payload: unknown) => {
          calls.push({ table, op: 'update', payload })
          return builder
        },
        delete: () => {
          calls.push({ table, op: 'delete' })
          return builder
        },
      }
      return builder
    },
    storage: {
      from: () => ({
        upload: async (path: string, _body: unknown, o: { contentType: string }) => {
          uploads.push({ path, type: o.contentType })
          return { error: null }
        },
      }),
    },
  }
}
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => fakeClient() }))

const actions = await import('./actions')

const content: SessionInfo = {
  user: { id: 'c1', email: 'c@go4solar.test' },
  role: 'content',
  aal: 'aal2',
}
const T1 = '11111111-1111-4111-8111-111111111111'
const T2 = '22222222-2222-4222-8222-222222222222'

beforeEach(() => {
  calls.length = 0
  uploads.length = 0
  rows = []
  getSessionInfo.mockResolvedValue(content)
})

const pngBytes = (w: number, h: number) => {
  const b = new Uint8Array(64)
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52])
  new DataView(b.buffer).setUint32(16, w)
  new DataView(b.buffer).setUint32(20, h)
  return b
}
const form = (kind: string, bytes: Uint8Array<ArrayBuffer>, type = 'image/png', name = 'x.png') => {
  const f = new FormData()
  f.set('kind', kind)
  f.set('file', new File([bytes as BlobPart], name, { type }))
  return f
}

describe('content actions: who may use them', () => {
  it('only super admin or content staff with two-factor', async () => {
    for (const s of [
      { ...content, role: 'operations' as const },
      { ...content, aal: 'aal1' as const },
      { user: null, role: null, aal: null },
    ]) {
      getSessionInfo.mockResolvedValue(s)
      expect(await actions.setTestimonialPublished({ id: T1, published: true })).toEqual({
        ok: false,
        error: 'Only a super admin or content staff can change the home page.',
      })
    }
    expect(calls).toEqual([])
  })
})

describe('testimonials', () => {
  it('cannot be published without both consents', async () => {
    rows = [{ id: T1, consent_client: true, consent_installer: false }]
    expect(await actions.setTestimonialPublished({ id: T1, published: true })).toEqual({
      ok: false,
      error: 'Tick both consents (client and installer) before publishing.',
    })
    expect(calls.filter((c) => c.op === 'update')).toEqual([])
  })

  it('publishes once both consents are ticked', async () => {
    rows = [{ id: T1, consent_client: true, consent_installer: true }]
    expect(await actions.setTestimonialPublished({ id: T1, published: true })).toEqual({ ok: true })
    expect(calls).toContainEqual(
      expect.objectContaining({
        table: 'testimonials',
        op: 'update',
        payload: { published: true },
      }),
    )
  })

  it('editing away a consent of a published testimonial takes it off the home page', async () => {
    rows = [{ id: T1, published: true, consent_client: true, consent_installer: true }]
    const r = await actions.saveTestimonial({
      id: T1,
      clientName: 'Amaka',
      clientCity: 'Ikeja',
      clientQuote: 'Quiet nights.',
      systemSize: '3.5 kVA',
      installerName: 'Musa',
      consentClient: false,
      consentInstaller: true,
    })
    expect(r).toEqual({ ok: true, unpublished: true })
    expect(calls[0]?.payload).toMatchObject({ consent_client: false, published: false })
  })

  it('reorder rewrites the positions in the new order', async () => {
    rows = [
      { id: T1, sort_order: 1 },
      { id: T2, sort_order: 2 },
    ]
    expect(await actions.moveTestimonial({ id: T2, dir: 'up' })).toEqual({ ok: true })
    const updates = calls.filter((c) => c.op === 'update')
    expect(updates.map((u) => [u.payload, u.match])).toEqual([
      [{ sort_order: 1 }, { id: T2 }],
      [{ sort_order: 2 }, { id: T1 }],
    ])
  })
})

describe('uploadSiteImage', () => {
  it('stores a correctly processed photo under its kind', async () => {
    const r = await actions.uploadSiteImage(form('installer', pngBytes(400, 400)))
    expect(r).toMatchObject({ ok: true })
    expect(uploads[0]?.path).toMatch(/^installer\/[0-9a-f-]{36}\.png$/)
    expect(uploads[0]?.type).toBe('image/png')
  })

  it('refuses a file that is not a picture, whatever its name says', async () => {
    const r = await actions.uploadSiteImage(
      form('job', new TextEncoder().encode('%PDF-1.7'), 'image/png', 'photo.png'),
    )
    expect(r).toEqual({ ok: false, error: 'That file is not a picture (use JPG, PNG or WebP).' })
    expect(uploads).toEqual([])
  })

  it('refuses a picture of the wrong size and anything over 10 MB', async () => {
    expect(await actions.uploadSiteImage(form('job', pngBytes(1000, 800)))).toEqual({
      ok: false,
      error: 'The job photo must be 1200 × 800 after cropping.',
    })
    const big = new Uint8Array(10 * 1024 * 1024 + 1)
    big.set(pngBytes(1200, 800))
    expect(await actions.uploadSiteImage(form('job', big))).toEqual({
      ok: false,
      error: 'That picture is larger than 10 MB.',
    })
    expect(uploads).toEqual([])
  })
})
