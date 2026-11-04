import { z } from 'zod'

import { getSessionInfo } from '@/lib/auth/session'
import { docResponse, problemPage } from '@/lib/invoices/response'
import { quotationForQuote } from '@/lib/invoices/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { currentVisitorHash } from '@/lib/waitlist/token'

export const dynamic = 'force-dynamic'

/** "Your quotation" → Download PDF: the visitor who made the quote, or its signed-in owner. */
export async function GET(_req: Request, ctx: { params: Promise<{ quoteId: string }> }) {
  const { quoteId } = await ctx.params
  if (!z.uuid().safeParse(quoteId).success) return problemPage('not_found')
  const [hash, session] = await Promise.all([currentVisitorHash(), getSessionInfo()])
  const { data: quote } = await createAdminClient()
    .from('quotes')
    .select('id, anon_token_hash, owner_id')
    .eq('id', quoteId)
    .maybeSingle()
  const mine =
    quote &&
    ((hash && quote.anon_token_hash === hash) ||
      (session.user && quote.owner_id === session.user.id))
  if (!mine) return problemPage('not_found')
  return docResponse(await quotationForQuote(quote.id))
}
