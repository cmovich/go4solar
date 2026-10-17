import { beforeEach, describe, expect, it, vi } from 'vitest'

const sendPasswordLink = vi.fn(async () => ({ ok: true as const }))
let allowed = true
vi.mock('@/lib/auth/passwordLinks', () => ({ sendPasswordLink }))
vi.mock('@/lib/ratelimit/hitRateLimit', () => ({ hitRateLimit: async () => allowed }))
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ host: 'localhost:3000', 'x-forwarded-for': '1.2.3.4' }),
}))

const { requestPasswordLink } = await import('./actions')
const { SENT_MESSAGE } = await import('./messages')

beforeEach(() => {
  sendPasswordLink.mockClear()
  allowed = true
})

describe('requestPasswordLink', () => {
  it('sends a link back to this site and gives the same answer for any email', async () => {
    expect(await requestPasswordLink({ email: 'Someone@Go4Solar.test ' })).toEqual({
      message: SENT_MESSAGE,
    })
    expect(sendPasswordLink).toHaveBeenCalledWith('someone@go4solar.test', 'http://localhost:3000')
  })

  it('the same answer even when sending fails (nobody can test which emails have accounts)', async () => {
    sendPasswordLink.mockResolvedValueOnce({ ok: false, error: 'User not found' } as never)
    expect(await requestPasswordLink({ email: 'x@go4solar.test' })).toEqual({
      message: SENT_MESSAGE,
    })
  })

  it('a bad email is rejected before anything is sent', async () => {
    expect(await requestPasswordLink({ email: 'nope' })).toEqual({
      error: 'Enter a valid email address',
    })
    expect(sendPasswordLink).not.toHaveBeenCalled()
  })

  it('rate-limited', async () => {
    allowed = false
    expect(await requestPasswordLink({ email: 'x@go4solar.test' })).toEqual({
      error: expect.stringMatching(/Too many/),
    })
    expect(sendPasswordLink).not.toHaveBeenCalled()
  })
})
