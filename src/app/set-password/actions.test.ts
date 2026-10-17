import { beforeEach, describe, expect, it, vi } from 'vitest'

// --- fakes ---------------------------------------------------------------
let user: { id: string; email: string } | null = null
let methods: string[] = []
let role: string | null = 'super_admin'
const updateUserById = vi.fn(async () => ({
  error: null as { message: string; code?: string } | null,
}))
const inserts: { table: string; payload: unknown }[] = []
const signInWithPassword = vi.fn(async () => ({ error: null as { message: string } | null }))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user } }),
      signInWithPassword,
      mfa: {
        getAuthenticatorAssuranceLevel: async () => ({
          data: { currentAuthenticationMethods: methods.map((method) => ({ method })) },
        }),
      },
    },
  }),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    auth: { admin: { updateUserById } },
    from: (table: string) => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: role ? { role } : null }) }),
      }),
      insert: async (payload: unknown) => {
        inserts.push({ table, payload })
        return { error: null }
      },
    }),
  }),
}))
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`)
  },
}))

const { setPassword } = await import('./actions')
const good = { password: 'a long enough password', confirm: 'a long enough password' }

beforeEach(() => {
  user = { id: 'u1', email: 'staff@go4solar.test' }
  methods = ['invite']
  role = 'super_admin'
  updateUserById.mockClear()
  signInWithPassword.mockClear()
  inserts.length = 0
})

describe('setPassword', () => {
  it('no session (link expired or never opened): nothing changes', async () => {
    user = null
    expect(await setPassword(good)).toEqual({ error: expect.stringMatching(/expired/) })
    expect(updateUserById).not.toHaveBeenCalled()
  })

  it('a normal password sign-in cannot set a password here', async () => {
    methods = ['password', 'totp']
    expect(await setPassword(good)).toEqual({ error: expect.stringMatching(/expired/) })
    expect(updateUserById).not.toHaveBeenCalled()
  })

  it('checks the form on the server too', async () => {
    expect(await setPassword({ password: 'short', confirm: 'short' })).toEqual({
      error: 'Use at least 12 characters',
    })
    expect(await setPassword({ password: good.password, confirm: 'different value!!' })).toEqual({
      error: 'The two passwords are not the same',
    })
    expect(updateUserById).not.toHaveBeenCalled()
  })

  it('invited staff: saves the password, writes the audit log, goes to the authenticator set-up', async () => {
    await expect(setPassword(good)).rejects.toThrow('NEXT_REDIRECT /admin/mfa')
    expect(updateUserById).toHaveBeenCalledWith('u1', { password: good.password })
    // Changing the password ends every session, so the person is signed in again with it.
    expect(signInWithPassword).toHaveBeenCalledWith({
      email: 'staff@go4solar.test',
      password: good.password,
    })
    expect(inserts).toEqual([
      {
        table: 'audit_log',
        payload: expect.objectContaining({
          actor_id: 'u1',
          action: 'auth.password_set',
          entity: 'profiles',
          entity_id: 'u1',
          after: { via: 'invite' },
        }),
      },
    ])
    // The password itself is never written anywhere else.
    expect(JSON.stringify(inserts)).not.toContain(good.password)
  })

  it('if signing in again fails, the password is still saved: go to sign in', async () => {
    signInWithPassword.mockResolvedValueOnce({ error: { message: 'x' } })
    await expect(setPassword(good)).rejects.toThrow('NEXT_REDIRECT /login?password=set')
  })

  it('a weak-password answer from the login system is shown in plain words', async () => {
    updateUserById.mockResolvedValueOnce({
      error: { message: 'Password is known to be weak', code: 'weak_password' },
    })
    expect(await setPassword(good)).toEqual({
      error: 'That password is too easy to guess. Please choose another.',
    })
  })
})
