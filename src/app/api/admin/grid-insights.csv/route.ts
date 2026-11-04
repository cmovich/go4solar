import { NextResponse } from 'next/server'

import { requireStaffWithMfa } from '@/lib/auth/roles'
import { insightsCsv } from '@/lib/grid/insights'
import { GRID_INSIGHT_ROLES, loadGridInsights } from '@/lib/grid/server'
import { exportLimit } from '@/lib/ratelimit/staffExport'
import { createAdminClient } from '@/lib/supabase/admin'
import { includeTestData } from '@/lib/testmode/server'

export const dynamic = 'force-dynamic'

/** Grid insights as CSV, with the page's date filters; every download is recorded. */
export async function GET(req: Request) {
  const session = await requireStaffWithMfa()
  if (!(GRID_INSIGHT_ROLES as readonly string[]).includes(session.role ?? '')) {
    return new NextResponse('Not allowed', { status: 403 })
  }
  const limited = await exportLimit(session.user!.id)
  if (limited) return limited
  const sp = new URL(req.url).searchParams
  const filters = {
    from: sp.get('from') ?? undefined,
    to: sp.get('to') ?? undefined,
    includeTest: await includeTestData(sp.get('test') ?? undefined),
  }
  const csv = insightsCsv(await loadGridInsights(filters))
  const { error } = await createAdminClient().from('audit_log').insert({
    actor_id: session.user!.id,
    action: 'grid_insights.export',
    entity: 'waitlist_consumers',
    entity_id: null,
    before: null,
    after: filters,
  })
  if (error) console.error('[audit] insert failed:', error.message)
  const day = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' })
  return new NextResponse(`${csv}\n`, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="go4solar-grid-insights-${day}.csv"`,
      'cache-control': 'private, no-store',
    },
  })
}
