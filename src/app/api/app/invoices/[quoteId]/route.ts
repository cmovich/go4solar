import { headers } from 'next/headers'
import { z } from 'zod'

import { getSessionInfo } from '@/lib/auth/session'
import { invoiceResponse } from '@/lib/invoices/response'
import { invoiceForQuote } from '@/lib/invoices/server'
import { originFor } from '@/lib/site/origin'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/** My account: the invoice for the customer's own quote. Nobody else's. */
export async function GET(_req: Request, ctx: { params: Promise<{ quoteId: string }> }) {
  const { quoteId } = await ctx.params
  const session = await getSessionInfo()
  if (!session.user) return new Response('Sign in to download your invoice.', { status: 401 })
  if (!z.uuid().safeParse(quoteId).success) return new Response('Not found', { status: 404 })
  const { data: quote } = await createAdminClient()
    .from('quotes')
    .select('id')
    .eq('id', quoteId)
    .eq('owner_id', session.user.id)
    .maybeSingle()
  if (!quote) return new Response('Not found', { status: 404 })
  return invoiceResponse(await invoiceForQuote(quote.id, originFor(await headers())))
}
