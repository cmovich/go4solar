import type { EmailOtpType } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const TYPES: EmailOtpType[] = ['magiclink', 'email']

/**
 * One-time sign-in links (assisted entry): verify the token on our own server, which signs the
 * customer in with their own session cookies, then continue to a page on this site.
 */
export async function GET(req: Request) {
  const url = new URL(req.url)
  const tokenHash = url.searchParams.get('token_hash')
  const type = url.searchParams.get('type') as EmailOtpType | null
  const next = url.searchParams.get('next') ?? '/app'
  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/app'
  if (tokenHash && type && TYPES.includes(type)) {
    const supabase = await createClient()
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
    if (!error) return NextResponse.redirect(new URL(safeNext, url.origin), 303)
  }
  return NextResponse.redirect(new URL('/login?link=expired', url.origin), 303)
}
