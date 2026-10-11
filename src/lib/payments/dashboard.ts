import 'server-only'

import type { QuoteResult } from '@/lib/pricing/types'
import { quoteReference } from '@/lib/quotes/quote'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Database } from '@/lib/supabase/database.types'
import { createClient } from '@/lib/supabase/server'

import { readinessFor } from './server'
import { timeline, type TimelineStep } from './timeline'

type ApplicationStatus = Database['public']['Enums']['application_status']

export type DashboardData = {
  applicationId: string
  status: ApplicationStatus
  reviewed: boolean
  reference: string
  plan: {
    systemPrice: number
    deposit: number
    monthly: number
    months: number
    balance: number
    instalments: number[]
  }
  timeline: TimelineStep[]
  missing: string[]
  depositReady: boolean
  depositPaid: boolean
  /** Auto-pay: on (active mandate), pending, off (skipped / failed / not set up). */
  autoPay: { state: 'on' | 'pending' | 'off'; bank: string | null; last4: string | null }
  loan: { status: Database['public']['Enums']['loan_status']; balance: number } | null
  schedule: {
    n: number
    dueDate: string
    amount: number
    paidAmount: number
    status: 'due' | 'paid' | 'late'
  }[]
  documents: { label: string; url: string }[]
}

/** Everything the customer dashboard and the deposit step show, for the signed-in customer. */
export async function loadDashboard(userId: string): Promise<DashboardData | null> {
  const admin = createAdminClient()
  const { data: app } = await admin
    .from('applications')
    .select('*')
    .eq('consumer_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!app?.quote_id) return null
  const { data: quote } = await admin
    .from('quotes')
    .select('id, tenure, result')
    .eq('id', app.quote_id)
    .single()
  if (!quote?.tenure) return null
  const q = quote.result as unknown as QuoteResult

  const [readiness, consumerAgreement, guarantee, deposit, mandate, loanRes] = await Promise.all([
    readinessFor(app),
    admin
      .from('agreements')
      .select('id, pdf_path, signed_at')
      .eq('application_id', app.id)
      .eq('type', 'consumer')
      .order('signed_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from('guarantees')
      .select('status')
      .eq('application_id', app.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from('payments')
      .select('id')
      .eq('application_id', app.id)
      .eq('kind', 'deposit')
      .eq('status', 'success')
      .limit(1)
      .maybeSingle(),
    admin
      .from('mandates')
      .select('status, bank_name, account_last4')
      .eq('consumer_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from('loans')
      .select('id, status, balance, start_date')
      .eq('application_id', app.id)
      .maybeSingle(),
  ])
  const loan = loanRes.data
  const { data: schedule } = loan
    ? await admin
        .from('repayment_schedule')
        .select('n, due_date, amount, paid_amount, status')
        .eq('loan_id', loan.id)
        .order('n')
    : { data: [] }

  // The customer's own signed agreement: a 10-minute link through their own session (RLS + storage policy).
  const documents: DashboardData['documents'] = []
  if (consumerAgreement.data?.pdf_path) {
    const supabase = await createClient()
    const { data } = await supabase.storage
      .from('kyc')
      .createSignedUrl(consumerAgreement.data.pdf_path, 600)
    if (data?.signedUrl)
      documents.push({ label: 'Your signed payment plan agreement (PDF)', url: data.signedUrl })
  }

  const steps = (app.steps ?? {}) as Record<string, boolean>
  const depositPaid = Boolean(deposit.data)
  const missing = !steps.review
    ? ['Finish your application']
    : [...readiness.missing, ...(readiness.ready && !depositPaid ? ['Pay your deposit'] : [])]

  return {
    applicationId: app.id,
    status: app.status,
    reviewed: Boolean(steps.review),
    reference: quoteReference(quote.id),
    plan: {
      systemPrice: q.systemPrice,
      deposit: q.deposit,
      monthly: q.monthly,
      months: q.instalments.length,
      balance: q.balance,
      instalments: q.instalments,
    },
    timeline: timeline({
      consumerSigned: Boolean(consumerAgreement.data),
      guarantorSigned: guarantee.data?.status === 'signed',
      depositPaid,
      applicationStatus: app.status,
      installed: Boolean(loan?.start_date && loan.status !== 'pending_approval'),
    }),
    missing,
    depositReady: readiness.ready && Boolean(steps.review),
    depositPaid,
    autoPay: {
      state:
        mandate.data?.status === 'active'
          ? 'on'
          : mandate.data?.status === 'pending'
            ? 'pending'
            : 'off',
      bank: mandate.data?.bank_name ?? null,
      last4: mandate.data?.account_last4 ?? null,
    },
    loan: loan ? { status: loan.status, balance: Number(loan.balance) } : null,
    schedule: (schedule ?? []).map((r) => ({
      n: r.n,
      dueDate: r.due_date,
      amount: Number(r.amount),
      paidAmount: Number(r.paid_amount),
      status: r.status,
    })),
    documents,
  }
}

/** Whether the customer has made an auto-pay choice yet (set up, pending, or skipped). */
export async function autoPayDecided(applicationId: string): Promise<boolean> {
  const admin = createAdminClient()
  const { data: app } = await admin
    .from('applications')
    .select('consumer_id, credit_flags')
    .eq('id', applicationId)
    .single()
  if (!app) return false
  if ((app.credit_flags as { autoPaySkipped?: boolean } | null)?.autoPaySkipped) return true
  const { data } = await admin
    .from('mandates')
    .select('status')
    .eq('consumer_id', app.consumer_id)
    .in('status', ['active', 'pending'])
    .limit(1)
    .maybeSingle()
  return Boolean(data)
}
