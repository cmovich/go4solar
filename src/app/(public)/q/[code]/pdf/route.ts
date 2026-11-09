import { docResponse, problemPage } from '@/lib/invoices/response'
import { quotationForStaff } from '@/lib/invoices/server'
import { staffQuotationByCode } from '@/lib/staffQuotes/server'

export const dynamic = 'force-dynamic'

/** Download PDF for a shared quotation: whoever has the link (the code is the secret). */
export async function GET(_req: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params
  const row = await staffQuotationByCode(code)
  if (!row) return problemPage('not_found')
  return docResponse(await quotationForStaff(row))
}
