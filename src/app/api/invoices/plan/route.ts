import { z } from 'zod'

import { docResponse, problemPage } from '@/lib/invoices/response'
import { quotationForPlan } from '@/lib/invoices/server'
import { TENURES, type TenureMonths } from '@/lib/pricing/types'

export const dynamic = 'force-dynamic'

const query = z.object({
  lead: z.uuid(),
  plan: z.enum(['essential', 'comfort', 'independence']),
  deposit: z.coerce.number().min(0.2).max(0.95),
  tenure: z.coerce
    .number()
    .refine((t): t is TenureMonths => (TENURES as readonly number[]).includes(t)),
})

/**
 * "Download PDF" on the plans page: the QUOTATION for one plan at the chosen deposit and length
 * (no invoice number). Only the visitor whose cookie owns the estimate gets it.
 */
export async function GET(req: Request) {
  const p = query.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!p.success) return problemPage('not_found')
  return docResponse(
    await quotationForPlan({
      leadId: p.data.lead,
      plan: p.data.plan,
      depositShare: p.data.deposit,
      tenure: p.data.tenure as TenureMonths,
    }),
  )
}
