import { headers } from 'next/headers'
import { z } from 'zod'

import { requireStaffWithMfa } from '@/lib/auth/roles'
import { problemPage, signedInvoiceUrl } from '@/lib/invoices/response'
import { ensureInvoiceForQuote } from '@/lib/invoices/server'
import { originFor } from '@/lib/site/origin'

export const dynamic = 'force-dynamic'

/** Staff (two-factor): any customer's invoice (issued if needed), then its signed PDF link. */
export async function GET(_req: Request, ctx: { params: Promise<{ quoteId: string }> }) {
  await requireStaffWithMfa()
  const { quoteId } = await ctx.params
  if (!z.uuid().safeParse(quoteId).success) return problemPage('not_found')
  const origin = originFor(await headers())
  const r = await ensureInvoiceForQuote(quoteId, origin)
  if (!r.ok || !r.id) return problemPage(r.ok ? 'not_ready' : r.reason)
  return Response.redirect(new URL(signedInvoiceUrl(r.id), origin), 303)
}
