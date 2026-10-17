import { describe, expect, it } from 'vitest'

import { afterPasswordSet, amrMethods, canSetPassword, parseAuthLink } from './authLink'

describe('parseAuthLink (what an invite / password email link brought back)', () => {
  it('a working link: the session tokens and the link type', () => {
    expect(
      parseAuthLink(
        '#access_token=a.b.c&expires_in=3600&refresh_token=r1&token_type=bearer&type=invite',
        '',
      ),
    ).toEqual({ kind: 'session', accessToken: 'a.b.c', refreshToken: 'r1', type: 'invite' })
    expect(parseAuthLink('#access_token=x&refresh_token=y&type=recovery', '')).toMatchObject({
      kind: 'session',
      type: 'recovery',
    })
  })

  it('an expired or used link (error in the fragment or the query)', () => {
    expect(
      parseAuthLink(
        '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired',
        '',
      ),
    ).toEqual({ kind: 'expired' })
    expect(parseAuthLink('', '?error=access_denied&error_code=otp_expired')).toEqual({
      kind: 'expired',
    })
  })

  it('any other error, or nothing at all, is treated as a broken link', () => {
    expect(parseAuthLink('#error=server_error', '')).toEqual({ kind: 'expired' })
    expect(parseAuthLink('', '')).toEqual({ kind: 'expired' })
    expect(parseAuthLink('#access_token=only', '')).toEqual({ kind: 'expired' })
  })
})

describe('canSetPassword (only a session that came from an emailed link)', () => {
  it('invite, password-reset and one-time-code sessions may set a password', () => {
    expect(canSetPassword(['invite'])).toBe(true)
    expect(canSetPassword(['recovery'])).toBe(true)
    expect(canSetPassword(['otp'])).toBe(true)
  })

  it('a normal password sign-in may not (no changing a password without the email link)', () => {
    expect(canSetPassword(['password'])).toBe(false)
    expect(canSetPassword(['password', 'totp'])).toBe(false)
    expect(canSetPassword([])).toBe(false)
  })
})

describe('afterPasswordSet (where the person goes next)', () => {
  it('staff set up the authenticator next (then /admin)', () => {
    expect(afterPasswordSet('super_admin', 'prelaunch')).toBe('/admin/mfa')
    expect(afterPasswordSet('operations', 'live')).toBe('/admin/mfa')
  })

  it('customers go to their dashboard when live, home in prelaunch', () => {
    expect(afterPasswordSet('consumer', 'live')).toBe('/app')
    expect(afterPasswordSet('consumer', 'prelaunch')).toBe('/')
    expect(afterPasswordSet(null, 'live')).toBe('/app')
  })
})

describe('amrMethods', () => {
  it('reads both shapes Supabase uses for the sign-in methods', () => {
    expect(amrMethods([{ method: 'invite' }, 'recovery'])).toEqual(['invite', 'recovery'])
    expect(amrMethods(undefined)).toEqual([])
  })
})
