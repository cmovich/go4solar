import { docResponse, problemPage } from '@/lib/invoices/response'
import { quotationForReadyPlan } from '@/lib/invoices/server'
import { isNgStateId } from '@/lib/nigeria/states'
import { loadDeliveryRows, loadReadyPlan, storedReadyPlan } from '@/lib/readyPlans/server'
import { siteAnswersSchema } from '@/lib/wizard/questions'

export const dynamic = 'force-dynamic'

function decodeSite(raw: string | null) {
  if (!raw || raw.length > 2000) return {}
  try {
    const json = Buffer.from(raw, 'base64url').toString('utf8')
    return siteAnswersSchema.safeParse(JSON.parse(json)).data ?? {}
  } catch {
    return {}
  }
}

/** Download PDF of a ready-made plan's quotation (months, state and site answers in the link). */
export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params
  const url = new URL(req.url)
  const plan = await loadReadyPlan(slug)
  const months = Number(url.searchParams.get('months'))
  const state = url.searchParams.get('state') ?? ''
  if (!plan || !plan.tenures.includes(months) || !isNgStateId(state)) {
    return problemPage('not_found')
  }
  const stored = storedReadyPlan(
    plan,
    months,
    state,
    decodeSite(url.searchParams.get('site')),
    await loadDeliveryRows(),
    url.searchParams.get('pay') === 'full' ? 'full' : 'plan',
  )
  return docResponse(await quotationForReadyPlan(stored))
}
