import { NextResponse } from 'next/server'

import { runRetention } from '@/lib/retention/server'

export const dynamic = 'force-dynamic'

/**
 * Vercel Cron (weekly): deletes failed-KYC images older than 30 days and waiting-list rows cleared
 * more than 7 days ago. `?dry=1` only counts. Bearer CRON_SECRET required.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorised' }, { status: 401 })
  }
  const dryRun = new URL(req.url).searchParams.get('dry') === '1'
  try {
    return NextResponse.json(await runRetention({ dryRun }))
  } catch {
    return NextResponse.json({ error: 'retention run failed' }, { status: 500 })
  }
}
