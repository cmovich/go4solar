import 'server-only'

import { lateFeeSettings } from '@/lib/agreements/server'
import type { QuoteResult } from '@/lib/pricing/types'
import { quoteReference } from '@/lib/quotes/quote'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Database } from '@/lib/supabase/database.types'
import { createClient } from '@/lib/supabase/server'

import {
  amountLeft,
  formatAddress,
  nextPayment,
  whatHappensNext,
  type Address,
} from '@/lib/account/account'
import type { SystemSize } from '@/lib/sizing/types'

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
  loan: {
    status: Database['public']['Enums']['loan_status']
    balance: number
    /** Last day of an approved extension (pauses the remote lock), or null. */
    extensionUntil: string | null
  } | null
  /** Late fee and remote-lock rule from settings, shown in the plan summary. */
  rules: { lateFeeDaily: number; lateFeeCap: number; lockAfterDays: number }
  /** What the credit officer asked the customer to fix (status more_info). */
  moreInfo: string | null
  job: {
    installer: string
    installerPhone: string
    date: string | null
    status: Database['public']['Enums']['job_status']
  } | null
  schedule: {
    n: number
    dueDate: string
    amount: number
    paidAmount: number
    status: 'due' | 'paid' | 'late'
  }[]
  documents: { label: string; url: string }[]
  // ---- "My account" (30 Oct) ----
  /** One plain sentence: what happens next. */
  whatNext: string
  nextPayment: { n: number; dueDate: string; amount: number; late: boolean } | null
  amountLeft: number
  /** The system in the quote snapshot, and when it was installed. */
  system: { inverterKva: number; batteryKwh: number; panelCount: number; panelWatts: number } | null
  installedAt: string | null
  details: {
    name: string | null
    phone: string | null
    email: string | null
    address: string | null
  }
  guarantor: { name: string; status: string } | null
  /** Successful payments (deposit and monthly) with a downloadable receipt. */
  receipts: { id: string; n: number | null; label: string; amount: number; paidAt: string | null }[]
  changeRequests: { field: string; newValue: string; status: string; createdAt: string }[]
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
    .select('id, tenure, result, system_size')
    .eq('id', app.quote_id)
    .single()
  if (!quote?.tenure) return null
  const q = quote.result as unknown as QuoteResult

  const [
    readiness,
    consumerAgreement,
    guarantee,
    deposit,
    mandate,
    loanRes,
    rules,
    profile,
    guarantorAgreement,
    paid,
    changes,
  ] = await Promise.all([
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
      .select('name, status')
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
      .select('id, status, balance, start_date, extension_until')
      .eq('application_id', app.id)
      .maybeSingle(),
    lateFeeSettings(),
    admin.from('profiles').select('full_name, phone_e164, email').eq('id', userId).maybeSingle(),
    admin
      .from('agreements')
      .select('pdf_path')
      .eq('application_id', app.id)
      .eq('type', 'guarantor')
      .order('signed_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from('payments')
      .select('id, kind, amount, paid_at, schedule_id')
      .eq('consumer_id', userId)
      .eq('application_id', app.id)
      .eq('status', 'success')
      .in('kind', ['deposit', 'instalment'])
      .order('paid_at', { ascending: true }),
    admin
      .from('change_requests')
      .select('field, new_value, status, created_at')
      .eq('consumer_id', userId)
      .order('created_at', { ascending: false })
      .limit(10),
  ])
  const loan = loanRes.data
  const { data: job } = loan
    ? await admin
        .from('jobs')
        .select('installer_name, installer_phone, scheduled_date, status, installed_at')
        .eq('loan_id', loan.id)
        .maybeSingle()
    : { data: null }
  const { data: schedule } = loan
    ? await admin
        .from('repayment_schedule')
        .select('id, n, due_date, amount, paid_amount, status')
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
  // The guarantee your guarantor signed for this plan (the file is in their folder, so the
  // server makes the 10-minute link after checking this is the customer's own application).
  if (guarantorAgreement.data?.pdf_path) {
    const { data } = await admin.storage
      .from('kyc')
      .createSignedUrl(guarantorAgreement.data.pdf_path, 600)
    if (data?.signedUrl) documents.push({ label: 'Signed guarantee (PDF)', url: data.signedUrl })
  }

  const steps = (app.steps ?? {}) as Record<string, boolean>
  const depositPaid = Boolean(deposit.data)
  const missing = !steps.review
    ? ['Finish your application']
    : [...readiness.missing, ...(readiness.ready && !depositPaid ? ['Pay your deposit'] : [])]

  const rows = (schedule ?? []).map((r) => ({
    id: r.id,
    n: r.n,
    dueDate: r.due_date,
    amount: Number(r.amount),
    paidAmount: Number(r.paid_amount),
    status: r.status,
  }))
  const monthOf = new Map(rows.map((r) => [r.id, r.n]))
  const size = (quote.system_size ?? null) as SystemSize | null
  const next = nextPayment(rows)
  const address = formatAddress(app.install_address as Partial<Address> | null)

  return {
    whatNext: whatHappensNext({
      status: app.status,
      reviewed: Boolean(steps.review),
      consumerSigned: Boolean(consumerAgreement.data),
      guarantorSigned: guarantee.data?.status === 'signed',
      guarantorName: guarantee.data?.name ?? null,
      depositPaid,
      loanStatus: loan?.status ?? null,
      job: job
        ? { installer: job.installer_name, date: job.scheduled_date, status: job.status }
        : null,
      nextDue: next ? { amount: next.amount, dueDate: next.dueDate } : null,
    }),
    nextPayment: next,
    amountLeft: amountLeft(rows, q.balance),
    system: size
      ? {
          inverterKva: size.inverterKva,
          batteryKwh: size.batteryKwh,
          panelCount: size.panelCount,
          panelWatts: size.panelWatts ?? Math.round((size.panelKw * 1000) / size.panelCount),
        }
      : null,
    installedAt: job?.installed_at ?? null,
    details: {
      name: profile.data?.full_name ?? null,
      phone: profile.data?.phone_e164 ?? null,
      email: profile.data?.email ?? null,
      address,
    },
    guarantor: guarantee.data ? { name: guarantee.data.name, status: guarantee.data.status } : null,
    receipts: (paid.data ?? []).map((p) => ({
      id: p.id,
      n: p.schedule_id ? (monthOf.get(p.schedule_id) ?? null) : null,
      label:
        p.kind === 'deposit'
          ? 'Deposit'
          : `Payment ${p.schedule_id ? (monthOf.get(p.schedule_id) ?? '') : ''}`.trim(),
      amount: Number(p.amount),
      paidAt: p.paid_at,
    })),
    // Before migration 0025 the table is missing: no requests.
    changeRequests: (changes.error ? [] : (changes.data ?? [])).map((c) => ({
      field: c.field,
      newValue: c.new_value,
      status: c.status,
      createdAt: c.created_at,
    })),
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
      installed: loan?.status === 'active' || loan?.status === 'completed',
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
    loan: loan
      ? {
          status: loan.status,
          balance: Number(loan.balance),
          extensionUntil: loan.extension_until,
        }
      : null,
    rules: {
      lateFeeDaily: rules.daily,
      lateFeeCap: rules.cap,
      lockAfterDays: rules.lockAfterDays,
    },
    moreInfo: app.status === 'more_info' ? app.more_info_request : null,
    job: job
      ? {
          installer: job.installer_name,
          installerPhone: job.installer_phone,
          date: job.scheduled_date,
          status: job.status,
        }
      : null,
    schedule: rows.map((r) => ({
      n: r.n,
      dueDate: r.dueDate,
      amount: r.amount,
      paidAmount: r.paidAmount,
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
