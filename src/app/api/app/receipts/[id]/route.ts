import { z } from 'zod'

import { getSessionInfo } from '@/lib/auth/session'
import { renderReceiptPdf } from '@/lib/pdf/ReceiptPdf'
import { quoteReference } from '@/lib/quotes/quote'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/**
 * A receipt (PDF) for one successful payment: the deposit or a monthly payment. Only the
 * customer who made the payment can download it.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const session = await getSessionInfo()
  if (!session.user) return new Response('Sign in to download your receipt.', { status: 401 })
  if (!z.uuid().safeParse(id).success) return new Response('Not found', { status: 404 })

  const admin = createAdminClient()
  const { data: pay } = await admin
    .from('payments')
    .select(
      'id, reference, kind, consumer_id, application_id, loan_id, schedule_id, amount, status, channel, paid_at',
    )
    .eq('id', id)
    .eq('consumer_id', session.user.id)
    .eq('status', 'success')
    .maybeSingle()
  if (!pay || (pay.kind !== 'deposit' && pay.kind !== 'instalment') || !pay.application_id) {
    return new Response('Not found', { status: 404 })
  }

  const [{ data: profile }, { data: app }] = await Promise.all([
    admin.from('profiles').select('full_name').eq('id', session.user.id).maybeSingle(),
    admin.from('applications').select('quote_id').eq('id', pay.application_id).maybeSingle(),
  ])
  const { data: quote } = app?.quote_id
    ? await admin.from('quotes').select('id, result').eq('id', app.quote_id).maybeSingle()
    : { data: null }
  const financed = Number((quote?.result as { balance?: number } | null)?.balance ?? 0)

  let label = 'Deposit'
  let amountLeft = financed
  if (pay.kind === 'instalment') {
    const [{ data: months }, { data: paidBefore }] = await Promise.all([
      pay.loan_id
        ? admin.from('repayment_schedule').select('id, n').eq('loan_id', pay.loan_id)
        : Promise.resolve({ data: [] as { id: string; n: number }[] }),
      admin
        .from('payments')
        .select('amount, paid_at')
        .eq('application_id', pay.application_id)
        .eq('kind', 'instalment')
        .eq('status', 'success'),
    ])
    const n = (months ?? []).find((m) => m.id === pay.schedule_id)?.n
    label = n ? `Payment ${n} of ${(months ?? []).length}` : 'Monthly payment'
    const upToThis = (paidBefore ?? [])
      .filter((p) => (p.paid_at ?? '') <= (pay.paid_at ?? ''))
      .reduce((s, p) => s + Number(p.amount), 0)
    amountLeft = Math.max(0, financed - upToThis)
  }

  const pdf = await renderReceiptPdf({
    receiptNo: pay.reference,
    customerName: profile?.full_name ?? 'Customer',
    planReference: quote ? quoteReference(quote.id) : '—',
    label,
    amount: Number(pay.amount),
    paidAt: pay.paid_at,
    channel: pay.channel,
    amountLeft,
  })
  return new Response(new Uint8Array(pdf), {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `attachment; filename="go4solar-receipt-${pay.reference}.pdf"`,
      'cache-control': 'private, no-store',
    },
  })
}
