import { beforeEach, describe, expect, it, vi } from 'vitest'

import { DEFAULT_VISION_SETTINGS } from '@/lib/vision/spend'

let open = true
let allowed = true
const recordLookup = vi.fn(async (cost: number) => void cost)
const lookup = vi.fn(async (_image: Blob, kind: string) => ({
  result:
    kind === 'item'
      ? { watts: 170, method: 'estimate', low: 100, high: 200, appliance: 'Standing fan' }
      : { watts: 150, method: 'label' },
  usage: { inputTokens: 2000, outputTokens: 300, webSearches: 0 },
}))
vi.mock('@/lib/vision/server', () => ({
  photoLookupOpen: async () => ({
    open,
    settings: { ...DEFAULT_VISION_SETTINGS, nairaPerUsd: 1600 },
  }),
  recordLookup: (cost: number) => recordLookup(cost),
}))
vi.mock('@/lib/ratelimit/hitRateLimit', () => ({ hitRateLimit: async () => allowed }))
vi.mock('@/lib/providers/vision', () => ({
  getVisionProvider: async () => ({ name: 'mock', lookup: (i: Blob, k: string) => lookup(i, k) }),
}))

const { POST } = await import('./route')

const send = (kind?: string) => {
  const form = new FormData()
  form.append('image', new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' }))
  if (kind) form.append('kind', kind)
  return POST(new Request('http://x/api/vision/watts', { method: 'POST', body: form }))
}

beforeEach(() => {
  open = true
  allowed = true
  recordLookup.mockClear()
  lookup.mockClear()
})

describe('POST /api/vision/watts', () => {
  it('a label photo: the reading, and the lookup’s cost recorded (₦5.60)', async () => {
    const res = await send('label')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ watts: 150, method: 'label' })
    expect(lookup.mock.calls[0]![1]).toBe('label')
    expect(recordLookup).toHaveBeenCalledWith(5.6)
  })

  it('an appliance photo: the estimate sized at the 70th percentile', async () => {
    const res = await send('item')
    expect(await res.json()).toMatchObject({ watts: 170, method: 'estimate', low: 100, high: 200 })
    expect(lookup.mock.calls[0]![1]).toBe('item')
  })

  it('cap reached or no key: no lookup, nothing spent', async () => {
    open = false
    expect((await send('label')).status).toBe(404)
    expect(lookup).not.toHaveBeenCalled()
    expect(recordLookup).not.toHaveBeenCalled()
  })

  it('over the per-visitor limit: 429, no lookup', async () => {
    allowed = false
    expect((await send('item')).status).toBe(429)
    expect(lookup).not.toHaveBeenCalled()
  })
})
