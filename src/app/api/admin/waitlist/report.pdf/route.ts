import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer'
import { NextResponse } from 'next/server'
import { createElement, type ReactElement } from 'react'

import { requireStaffWithMfa } from '@/lib/auth/roles'
import { includeTestData } from '@/lib/testmode/server'
import { exportLimit } from '@/lib/ratelimit/staffExport'
import { WaitlistReport } from '@/lib/pdf/WaitlistReport'
import { getQuoteSettings } from '@/lib/settings/getQuoteSettings'
import { createAdminClient } from '@/lib/supabase/admin'
import { headline, listConsumers } from '@/lib/waitlist/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** Staff only. Funder-ready PDF: summary + chart, then every complete sign-up. */
export async function GET(req: Request) {
  const includeTest = await includeTestData(new URL(req.url).searchParams.get('test') ?? undefined)
  const session = await requireStaffWithMfa()
  const limited = await exportLimit(session.user!.id)
  if (limited) return limited
  const [stats, leads, settings] = await Promise.all([
    headline(includeTest),
    listConsumers({ tab: 'complete', includeTest }),
    getQuoteSettings(),
  ])
  const generatedAt = new Date()

  const buffer = await renderToBuffer(
    createElement(WaitlistReport, {
      stats,
      leads,
      generatedAt,
      energy: settings.energy,
    }) as unknown as ReactElement<DocumentProps>,
  )

  await createAdminClient()
    .from('waitlist_exports')
    .insert({
      kind: 'pdf',
      row_count: leads.length,
      exported_by: session.user?.id ?? null,
    })

  const stamp = generatedAt.toISOString().slice(0, 10)
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `attachment; filename="go4solar-waiting-list-${stamp}.pdf"`,
      'cache-control': 'no-store',
    },
  })
}
