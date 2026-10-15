import 'server-only'

import { NextResponse } from 'next/server'

import { hitRateLimit } from './hitRateLimit'

const EXPORTS_PER_HOUR = 30

/** Staff downloads (CSV / PDF / Excel): 30 an hour per person; a friendly 429 otherwise. */
export async function exportLimit(userId: string): Promise<NextResponse | null> {
  if (await hitRateLimit(`export:${userId}`, EXPORTS_PER_HOUR, '1 hour')) return null
  return NextResponse.json(
    { error: 'Too many downloads. Please wait a few minutes.' },
    { status: 429 },
  )
}
