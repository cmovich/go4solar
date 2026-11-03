import { headers } from 'next/headers'
import { z } from 'zod'

import { requireStaffWithMfa } from '@/lib/auth/roles'
import { invoiceResponse } from '@/lib/invoices/response'
import { invoiceForQuote } from '@/lib/invoices/server'
import { originFor } from '@/lib/site/origin'

export const dynamic = 'force-dynamic'

/** Staff (with two-factor): the invoice for any customer's quote, from its stored prices. */
export async function GET(_req: Request, ctx: { params: Promise<{ quoteId: string }> }) {
  await requireStaffWithMfa()
  const { quoteId } = await ctx.params
  if (!z.uuid().safeParse(quoteId).success) return new Response('Not found', { status: 404 })
  return invoiceResponse(await invoiceForQuote(quoteId, originFor(await headers())))
}
