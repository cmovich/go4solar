import { z } from 'zod'

import { getSessionInfo } from '@/lib/auth/session'
import { SALES_ROLE, STAFF_ROLES } from '@/lib/auth/staffRoles'
import { docResponse, problemPage } from '@/lib/invoices/response'
import { quotationForLead } from '@/lib/invoices/server'

export const dynamic = 'force-dynamic'

/** Admin → Waiting list → "Download PDF": the person's quotation (staff and Sales, two-factor). */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const s = await getSessionInfo()
  const allowed =
    s.user &&
    s.aal === 'aal2' &&
    (s.role === SALES_ROLE || (STAFF_ROLES as readonly string[]).includes(s.role ?? ''))
  if (!allowed) return problemPage('signin')
  if (!z.uuid().safeParse(id).success) return problemPage('not_found')
  return docResponse(await quotationForLead(id))
}
