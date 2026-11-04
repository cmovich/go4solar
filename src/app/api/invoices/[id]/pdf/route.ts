import { z } from 'zod'

import { verifyInvoiceLink } from '@/lib/invoices/link'
import { pdfResponse, problemPage } from '@/lib/invoices/response'
import { invoiceById } from '@/lib/invoices/server'

export const dynamic = 'force-dynamic'

/**
 * An issued invoice PDF through its short-lived signed link (made by My account and admin), so
 * it opens without the sign-in cookie, like the signed agreement.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const url = new URL(req.url)
  if (!z.uuid().safeParse(id).success) return problemPage('not_found')
  const ok = verifyInvoiceLink(
    id,
    url.searchParams.get('exp') ?? '',
    url.searchParams.get('sig') ?? '',
    new Date(),
    process.env.ID_HASH_SECRET ?? '',
  )
  if (!ok) return problemPage('expired')
  const invoice = await invoiceById(id)
  return invoice ? pdfResponse(invoice) : problemPage('not_found')
}
