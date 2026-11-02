import { NextResponse, type NextRequest } from 'next/server'

import { cleanClientError } from '@/lib/monitoring/clientError'
import { clientIp } from '@/lib/ratelimit/clientIp'
import { hitRateLimit } from '@/lib/ratelimit/hitRateLimit'

/** At most this many crash reports per visitor an hour (one crash can repeat on every render). */
const REPORTS_PER_HOUR = 20

/**
 * A page crashed in a visitor's browser: write the cleaned message to the server log (Vercel
 * runtime logs), so the cause can be read without the visitor's console. Nothing is stored.
 */
export async function POST(req: NextRequest) {
  let body: unknown = null
  try {
    body = await req.json()
  } catch {
    return new NextResponse(null, { status: 400 })
  }
  const report = cleanClientError(body)
  if (!report) return new NextResponse(null, { status: 400 })
  if (!(await hitRateLimit(`client-error:${clientIp(req.headers)}`, REPORTS_PER_HOUR, '1 hour'))) {
    return new NextResponse(null, { status: 429 })
  }
  console.error(
    `[client-error] ${report.kind} on ${report.path}: ${report.message}${report.digest ? ` (digest ${report.digest})` : ''}`,
  )
  return new NextResponse(null, { status: 204 })
}
