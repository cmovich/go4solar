import { z } from 'zod'

import { docResponse, problemPage } from '@/lib/invoices/response'
import { quotationForBuilderLead } from '@/lib/invoices/server'
import { currentVisitorHash } from '@/lib/waitlist/token'

export const dynamic = 'force-dynamic'

/** Prelaunch builder: the quotation PDF for the system this visitor submitted. */
export async function GET(_req: Request, ctx: { params: Promise<{ leadId: string }> }) {
  const { leadId } = await ctx.params
  const hash = await currentVisitorHash()
  if (!hash || !z.uuid().safeParse(leadId).success) return problemPage('not_found')
  return docResponse(await quotationForBuilderLead(leadId, hash))
}
