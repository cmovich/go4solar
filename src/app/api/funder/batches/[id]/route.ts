import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'

import { getSessionInfo } from '@/lib/auth/session'
import { canExport } from '@/lib/auth/staffRoles'
import { loadCompany } from '@/lib/company/server'
import { renderFunderBatchPdf } from '@/lib/pdf/FunderBatchPdf'
import { createAdminClient } from '@/lib/supabase/admin'
import { batchCsv, batchXlsx, oneCustomer } from '@/lib/tradeLenda/exports'
import { funderBatch } from '@/lib/tradeLenda/server'
import { exportOf } from '@/lib/tradeLenda/view'

export const dynamic = 'force-dynamic'

/**
 * Batch downloads: the whole batch or one customer (`ref`), as CSV, Excel or PDF. The funder (its
 * own batches), or super admin and Operations (any funder's); built from the funder-safe
 * snapshot only.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const s = await getSessionInfo()
  const staff = canExport(s.role)
  if (!s.user || s.aal !== 'aal2' || (!staff && s.role !== 'funder_partner')) {
    return new NextResponse('Not allowed', { status: 403 })
  }
  const { id } = await params
  const format = req.nextUrl.searchParams.get('format') ?? 'csv'
  const ref = req.nextUrl.searchParams.get('ref')
  if (!z.uuid().safeParse(id).success || !['csv', 'xlsx', 'pdf'].includes(format)) {
    return new NextResponse('Not found', { status: 404 })
  }
  // Super admin and Operations (Admin → Exports): any funder's batch; a funder: its own only.
  const view = await funderBatch({ id: s.user.id, role: s.role }, id, { anyFunder: staff })
  if (!view) return new NextResponse('Not found', { status: 404 })
  let data = exportOf(view)
  if (ref) {
    const one = oneCustomer(data, ref)
    if (!one) return new NextResponse('Not found', { status: 404 })
    data = one
  }
  const name = `${view.number}${view.version > 1 ? `-v${view.version}` : ''}${ref ? `-${ref}` : ''}`
  await createAdminClient()
    .from('audit_log')
    .insert({
      actor_id: s.user.id,
      action: 'funder_batch.export',
      entity: 'funder_batches',
      entity_id: id,
      after: { format, ref: ref ?? null },
    })
  if (format === 'csv') {
    return new NextResponse(batchCsv(data), {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="${name}.csv"`,
      },
    })
  }
  const company = await loadCompany()
  if (format === 'xlsx') {
    return new NextResponse(new Uint8Array(await batchXlsx(data, company)), {
      headers: {
        'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'content-disposition': `attachment; filename="${name}.xlsx"`,
      },
    })
  }
  return new NextResponse(new Uint8Array(await renderFunderBatchPdf(data, company)), {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `inline; filename="${name}.pdf"`,
    },
  })
}
