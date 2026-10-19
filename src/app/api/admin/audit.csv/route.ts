import { NextResponse } from 'next/server'

import { requireStaffWithMfa } from '@/lib/auth/roles'
import { AUDIT_EXPORT_LIMIT, auditEntries } from '@/lib/audit/server'
import { auditCsv, parseAuditFilters } from '@/lib/audit/view'
import { exportLimit } from '@/lib/ratelimit/staffExport'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/** Super admin only: the audit log entries matching the page's filters, as CSV. */
export async function GET(req: Request) {
  const session = await requireStaffWithMfa()
  if (session.role !== 'super_admin') return new NextResponse('Not allowed', { status: 403 })
  const limited = await exportLimit(session.user!.id)
  if (limited) return limited
  const params = Object.fromEntries(new URL(req.url).searchParams)
  const filters = parseAuditFilters(params)
  const rows = await auditEntries(filters, AUDIT_EXPORT_LIMIT)
  // Downloading the log is itself recorded.
  await createAdminClient()
    .from('audit_log')
    .insert({
      actor_id: session.user!.id,
      action: 'audit.export',
      entity: 'audit_log',
      before: null,
      after: { ...filters, rows: rows.length },
    })
  const day = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' })
  return new NextResponse(auditCsv(rows), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="go4solar-audit-${day}.csv"`,
      'cache-control': 'no-store',
    },
  })
}
