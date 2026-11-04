import { headers } from 'next/headers'
import { z } from 'zod'

import { getSessionInfo } from '@/lib/auth/session'
import { problemPage, signedInvoiceUrl } from '@/lib/invoices/response'
import { ensureInvoiceForQuote } from '@/lib/invoices/server'
import { originFor } from '@/lib/site/origin'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/** My account: the customer's own invoice (issued if needed), then its signed PDF link. */
export async function GET(_req: Request, ctx: { params: Promise<{ quoteId: string }> }) {
  const { quoteId } = await ctx.params
  const session = await getSessionInfo()
  if (!session.user) return problemPage('signin')
  if (!z.uuid().safeParse(quoteId).success) return problemPage('not_found')
  const { data: quote } = await createAdminClient()
    .from('quotes')
    .select('id')
    .eq('id', quoteId)
    .eq('owner_id', session.user.id)
    .maybeSingle()
  if (!quote) return problemPage('not_found')
  const r = await ensureInvoiceForQuote(quote.id, originFor(await headers()))
  if (!r.ok || !r.id) return problemPage(r.ok ? 'not_ready' : r.reason)
  return Response.redirect(new URL(signedInvoiceUrl(r.id), originFor(await headers())), 303)
}
