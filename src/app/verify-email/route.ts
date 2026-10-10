import { NextResponse } from 'next/server'

import { consumeEmailVerification } from '@/lib/auth/emailVerification'

export const dynamic = 'force-dynamic'

/** The link in the "verify your email" message. */
export async function GET(req: Request) {
  const url = new URL(req.url)
  const outcome = await consumeEmailVerification(url.searchParams.get('token') ?? '')
  return NextResponse.redirect(
    new URL(`/app/apply?email=${outcome === 'ok' ? 'verified' : outcome}`, url.origin),
  )
}
