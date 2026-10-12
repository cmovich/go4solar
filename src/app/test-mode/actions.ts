'use server'

import { timingSafeEqual } from 'node:crypto'

import { cookies, headers } from 'next/headers'

import { clientIp } from '@/lib/ratelimit/clientIp'
import { hitRateLimit } from '@/lib/ratelimit/hitRateLimit'
import { TEST_MODE_COOKIE, deployEnv, unlockToken } from '@/lib/testmode/policy'

/** Unlock test-only switches on a preview for 30 days (never possible in production). */
export async function unlockTestMode(input: {
  secret: string
}): Promise<{ ok: boolean; error?: string }> {
  if (deployEnv() !== 'preview') return { ok: false, error: 'Not available here.' }
  const secret = process.env.TEST_MODE_SECRET
  if (!secret || secret.length < 16)
    return { ok: false, error: 'Test mode is not set up on this preview.' }
  if (!(await hitRateLimit(`test-mode:${clientIp(await headers())}`, 10, '1 hour'))) {
    return { ok: false, error: 'Too many tries. Please wait an hour.' }
  }
  const given = Buffer.from(String(input.secret ?? ''))
  const want = Buffer.from(secret)
  if (given.length !== want.length || !timingSafeEqual(given, want))
    return { ok: false, error: 'That is not the test-mode secret.' }
  ;(await cookies()).set(TEST_MODE_COOKIE, unlockToken(secret), {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 30 * 24 * 60 * 60,
  })
  return { ok: true }
}

export async function lockTestMode(): Promise<void> {
  ;(await cookies()).delete(TEST_MODE_COOKIE)
}
