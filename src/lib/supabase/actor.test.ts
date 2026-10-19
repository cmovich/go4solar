import { beforeEach, describe, expect, it, vi } from 'vitest'

let forwarded: Record<string, string> = {}
let headersThrow = false

vi.mock('next/headers', () => ({
  headers: async () => {
    if (headersThrow) throw new Error('outside a request')
    return new Headers(forwarded)
  },
}))

const { actorFetch, USER_HEADER } = await import('./actor')

function capture() {
  const seen: Headers[] = []
  const base = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    seen.push(new Headers(init?.headers))
    return new Response('{}')
  })
  return { seen, f: actorFetch(base as unknown as typeof fetch) }
}

beforeEach(() => {
  forwarded = { [USER_HEADER]: 'staff-1' }
  headersThrow = false
})

describe('actorFetch (who is changing data through the service role)', () => {
  it('a write carries the person the middleware verified for this request', async () => {
    const { f, seen } = capture()
    await f('https://db/rest/v1/components', { method: 'POST', headers: { a: '1' } })
    expect(seen[0]?.get('x-g4s-actor-id')).toBe('staff-1')
    expect(seen[0]?.get('a')).toBe('1')
  })

  it('reads are left alone (pre-built pages stay pre-built)', async () => {
    const { f, seen } = capture()
    await f('https://db/rest/v1/components', { method: 'GET' })
    await f('https://db/rest/v1/components')
    expect(seen.every((h) => !h.has('x-g4s-actor-id'))).toBe(true)
  })

  it('nobody signed in, or outside a request (cron, webhooks): no actor', async () => {
    forwarded = {}
    const a = capture()
    await a.f('u', { method: 'PATCH' })
    expect(a.seen[0]?.has('x-g4s-actor-id')).toBe(false)
    headersThrow = true
    const b = capture()
    await b.f('u', { method: 'POST' })
    expect(b.seen[0]?.has('x-g4s-actor-id')).toBe(false)
  })

  it('a header sent by the caller is replaced, never trusted', async () => {
    forwarded = {}
    const { f, seen } = capture()
    await f('u', { method: 'POST', headers: { 'x-g4s-actor-id': 'someone-else' } })
    expect(seen[0]?.has('x-g4s-actor-id')).toBe(false)
  })
})
