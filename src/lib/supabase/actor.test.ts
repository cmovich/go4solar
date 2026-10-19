import { beforeEach, describe, expect, it, vi } from 'vitest'

let cookieNames: string[] = []
let cookiesThrow = false
let userId: string | null = 'staff-1'
const getUser = vi.fn(async () => ({ data: { user: userId ? { id: userId } : null } }))

vi.mock('next/headers', () => ({
  cookies: async () => {
    if (cookiesThrow) throw new Error('outside a request')
    return { getAll: () => cookieNames.map((name) => ({ name, value: 'x' })) }
  },
}))
vi.mock('./server', () => ({ createClient: async () => ({ auth: { getUser } }) }))

const { actorFetch } = await import('./actor')

function capture() {
  const seen: Headers[] = []
  const base = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    seen.push(new Headers(init?.headers))
    return new Response('{}')
  })
  return { seen, base, f: actorFetch(base as unknown as typeof fetch) }
}

beforeEach(() => {
  cookieNames = ['sb-abc-auth-token']
  cookiesThrow = false
  userId = 'staff-1'
  getUser.mockClear()
})

describe('actorFetch (who is changing data through the service role)', () => {
  it('a write by a signed-in person carries their id', async () => {
    const { f, seen } = capture()
    await f('https://db/rest/v1/components', { method: 'POST', headers: { a: '1' } })
    expect(seen[0]?.get('x-g4s-actor-id')).toBe('staff-1')
    expect(seen[0]?.get('a')).toBe('1')
  })

  it('reads never look at the session (pre-built pages stay pre-built)', async () => {
    const { f, seen } = capture()
    await f('https://db/rest/v1/components', { method: 'GET' })
    await f('https://db/rest/v1/components')
    expect(seen.every((h) => !h.has('x-g4s-actor-id'))).toBe(true)
    expect(getUser).not.toHaveBeenCalled()
  })

  it('no sign-in cookie, no session, or outside a request: no actor (cron, webhooks)', async () => {
    cookieNames = []
    const a = capture()
    await a.f('u', { method: 'PATCH' })
    expect(a.seen[0]?.has('x-g4s-actor-id')).toBe(false)

    cookieNames = ['sb-abc-auth-token']
    userId = null
    const b = capture()
    await b.f('u', { method: 'DELETE' })
    expect(b.seen[0]?.has('x-g4s-actor-id')).toBe(false)

    cookiesThrow = true
    const c = capture()
    await c.f('u', { method: 'POST' })
    expect(c.seen[0]?.has('x-g4s-actor-id')).toBe(false)
  })

  it('a header sent by the caller is replaced, never trusted', async () => {
    const { f, seen } = capture()
    await f('u', { method: 'POST', headers: { 'x-g4s-actor-id': 'someone-else' } })
    expect(seen[0]?.get('x-g4s-actor-id')).toBe('staff-1')
  })
})
