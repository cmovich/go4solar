'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

import { launchMode } from '@/config/site'
import { isStaffRole } from '@/lib/auth/roles'
import { getSessionInfo } from '@/lib/auth/session'
import { clientIp } from '@/lib/ratelimit/clientIp'
import { hitRateLimit } from '@/lib/ratelimit/hitRateLimit'
import { createClient } from '@/lib/supabase/server'

import { signInSchema, signUpSchema } from './schema'

export type AuthActionResult = { error?: string; message?: string }

const SLOW_DOWN = 'Too many attempts. Please wait a few minutes and try again.'
const LOGINS_PER_IP_PER_HOUR = 30
const LOGINS_PER_EMAIL_PER_HOUR = 10
const SIGNUPS_PER_IP_PER_HOUR = 10

/** Only allow redirects to our own pages (never to another site). */
function safeNext(next: string | undefined): string | null {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : null
}

async function redirectAfterLogin(next: string | undefined): Promise<never> {
  const { role } = await getSessionInfo()
  if (isStaffRole(role)) redirect('/admin')
  // Customers land on "My account" (it sends them on to their application if unfinished).
  redirect(safeNext(next) ?? '/app')
}

export async function signIn(input: unknown): Promise<AuthActionResult> {
  const parsed = signInSchema.safeParse(input)
  if (!parsed.success) return { error: 'Please check your email and password.' }
  const ip = clientIp(await headers())
  const email = parsed.data.email.trim().toLowerCase()
  if (
    !(await hitRateLimit(`login:${ip}`, LOGINS_PER_IP_PER_HOUR, '1 hour')) ||
    !(await hitRateLimit(`login-email:${email}`, LOGINS_PER_EMAIL_PER_HOUR, '1 hour'))
  ) {
    return { error: SLOW_DOWN }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  })
  if (error) return { error: 'Wrong email or password.' }

  return redirectAfterLogin(parsed.data.next)
}

export async function signUp(input: unknown): Promise<AuthActionResult> {
  // Prelaunch: no customer accounts yet (staff accounts are created by invite).
  if (launchMode() !== 'live') return { error: 'Accounts open at launch.' }
  const parsed = signUpSchema.safeParse(input)
  if (!parsed.success) return { error: 'Please check the details you entered.' }
  if (
    !(await hitRateLimit(`signup:${clientIp(await headers())}`, SIGNUPS_PER_IP_PER_HOUR, '1 hour'))
  ) {
    return { error: SLOW_DOWN }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { data: { full_name: parsed.data.fullName } },
  })
  if (error) {
    return /already|registered|exists/i.test(error.message)
      ? { error: 'An account with this email already exists. Sign in instead.' }
      : { error: 'Could not create your account. Please try again.' }
  }

  // With "Confirm email" switched on in Supabase there is no session yet.
  if (!data.session) {
    return { message: 'Account created. Check your email for a confirmation link, then sign in.' }
  }
  return redirectAfterLogin(parsed.data.next)
}

export async function signOut(): Promise<void> {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
