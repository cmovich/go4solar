'use server'

import { redirect } from 'next/navigation'

import { isStaffRole } from '@/lib/auth/roles'
import { getSessionInfo } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'

import { signInSchema, signUpSchema } from './schema'

export type AuthActionResult = { error?: string; message?: string }

/** Only allow redirects to our own pages (never to another site). */
function safeNext(next: string | undefined): string | null {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : null
}

async function redirectAfterLogin(next: string | undefined): Promise<never> {
  const { role } = await getSessionInfo()
  if (isStaffRole(role)) redirect('/admin')
  redirect(safeNext(next) ?? '/')
}

export async function signIn(input: unknown): Promise<AuthActionResult> {
  const parsed = signInSchema.safeParse(input)
  if (!parsed.success) return { error: 'Please check your email and password.' }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  })
  if (error) return { error: 'Wrong email or password.' }

  return redirectAfterLogin(parsed.data.next)
}

export async function signUp(input: unknown): Promise<AuthActionResult> {
  const parsed = signUpSchema.safeParse(input)
  if (!parsed.success) return { error: 'Please check the details you entered.' }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { data: { full_name: parsed.data.fullName } },
  })
  if (error) return { error: error.message }

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
