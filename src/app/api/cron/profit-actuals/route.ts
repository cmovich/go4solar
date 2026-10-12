import { NextResponse } from 'next/server'

import { recordProfitSnapshots } from '@/lib/reports/profit'

export const dynamic = 'force-dynamic'

/**
 * Vercel Cron: per-loan profit snapshots (Quoted and Approved once, Actual for this month from
 * real payments and recorded fees). Runs daily so the month's Actual stays current.
 * Vercel calls it with `Authorization: Bearer $CRON_SECRET`; anything else is refused.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorised' }, { status: 401 })
  }
  const result = await recordProfitSnapshots()
  return NextResponse.json(result)
}
