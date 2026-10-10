import 'server-only'

import { createHash, randomBytes } from 'node:crypto'

import { cookies } from 'next/headers'

/**
 * Per-visitor token for the waiting list. The browser holds the token in an httpOnly cookie;
 * the row holds its sha256. A later step may only update a row whose hash matches, so one
 * visitor can never edit another's sign-up, and no table policy for anon users is needed.
 */
export const VISITOR_COOKIE = 'g4s_wl'
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export async function getOrCreateVisitorToken(): Promise<{ token: string; hash: string }> {
  const jar = await cookies()
  let token = jar.get(VISITOR_COOKIE)?.value
  if (!token || token.length < 32) {
    token = randomBytes(24).toString('base64url')
    jar.set(VISITOR_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: MAX_AGE_SECONDS,
    })
  }
  return { token, hash: hashToken(token) }
}

/** The hash of the current visitor's token, or null if they have no cookie yet. */
export async function currentVisitorHash(): Promise<string | null> {
  const token = (await cookies()).get(VISITOR_COOKIE)?.value
  return token && token.length >= 32 ? hashToken(token) : null
}
