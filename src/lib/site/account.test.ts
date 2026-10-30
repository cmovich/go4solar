import { describe, expect, it } from 'vitest'

import { accountLink, hasAuthCookie } from './account'

describe('header/footer account link', () => {
  it('spots a Supabase sign-in cookie (whole or split in parts)', () => {
    expect(hasAuthCookie('g4s_wl=abc; sb-xyzref-auth-token=base64-eyJ')).toBe(true)
    expect(hasAuthCookie('sb-xyzref-auth-token.0=base64-eyJ; other=1')).toBe(true)
    expect(hasAuthCookie('g4s_wl=abc; sb-xyzref-auth-token-code-verifier=x')).toBe(false)
    expect(hasAuthCookie('')).toBe(false)
  })

  it('live: "Sign in" → /login, or "My account" → /app when signed in; prelaunch: nothing', () => {
    expect(accountLink('live', false)).toEqual({ label: 'Sign in', href: '/login' })
    expect(accountLink('live', true)).toEqual({ label: 'My account', href: '/app' })
    expect(accountLink('prelaunch', false)).toBeNull()
    expect(accountLink('prelaunch', true)).toBeNull()
  })
})
