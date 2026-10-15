import { NextResponse } from 'next/server'

import { retentionDryRun } from '@/lib/retention/rules'
import { runRetention } from '@/lib/retention/server'

export const dynamic = 'force-dynamic'

/**
 * Vercel Cron (weekly): deletes failed-KYC images older than 30 days and waiting-list rows cleared
 * more than 7 days ago. Counts only (deletes nothing) unless RETENTION_ENABLED=true; `?dry=1`
 * always only counts. Bearer CRON_SECRET required.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorised' }, { status: 401 })
  }
  const dryRun = retentionDryRun(process.env, new URL(req.url).searchParams.get('dry') === '1')
  try {
    return NextResponse.json(await runRetention({ dryRun }))
  } catch {
    return NextResponse.json({ error: 'retention run failed' }, { status: 500 })
  }
}
