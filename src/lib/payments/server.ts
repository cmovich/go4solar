import 'server-only'

import { randomBytes } from 'node:crypto'

import type { CheckSummary } from '@/lib/applications/rules'
import { formatNaira } from '@/lib/money'
import type { QuoteResult } from '@/lib/pricing/types'
import { getMessagingProvider } from '@/lib/providers/messaging'
import { getPaymentsProvider } from '@/lib/providers/payments'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Database, Json } from '@/lib/supabase/database.types'

import type { PaymentEvent } from './events'
import { fromKobo, toKobo } from './kobo'
import { depositReadiness } from './readiness'
import { buildSchedule } from './schedule'

type Application = Database['public']['Tables']['applications']['Row']
type Payment = Database['public']['Tables']['payments']['Row']

export type EventOutcome = 'applied' | 'duplicate' | 'unknown' | 'rejected' | 'ignored'

const newReference = (prefix: 'DEP' | 'INS' | 'MDT' | 'RFD') =>
  `G4S-${prefix}-${randomBytes(6).toString('hex').toUpperCase()}`

// ------------------------------------------------------------ loading
/** The signed-in customer's newest application. */
async function latestApplication(userId: string): Promise<Application | null> {
  const { data } = await createAdminClient()
    .from('applications')
    .select('*')
    .eq('consumer_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data
}

async function storedQuote(app: Application) {
  if (!app.quote_id) return null
  const { data } = await createAdminClient()
    .from('quotes')
    .select('id, tenure, result')
    .eq('id', app.quote_id)
    .maybeSingle()
  if (!data?.tenure) return null
  return { id: data.id, tenure: data.tenure, result: data.result as unknown as QuoteResult }
}

/** Signatures + KYC → can the deposit be paid yet, and what is still missing. */
export async function readinessFor(app: Application) {
  const admin = createAdminClient()
  const [signed, guarantee, checks] = await Promise.all([
    admin
      .from('agreements')
      .select('id')
      .eq('application_id', app.id)
      .eq('type', 'consumer')
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
      .from('kyc_checks')
      .select('kind, status, attempt')
      .eq('subject_id', app.id)
      .order('created_at'),
  ])
  const flags = (app.credit_flags ?? {}) as { livenessDeferred?: boolean }
  return depositReadiness({
    applicantType: app.applicant_type === 'business' ? 'business' : 'individual',
    consumerSigned: Boolean(signed.data),
    guarantorSigned: guarantee.data?.status === 'signed',
    checks: (checks.data ?? []) as CheckSummary[],
    livenessDeferred: Boolean(flags.livenessDeferred),
  })
}

function contactOf(app: Application) {
  const p = (app.personal ?? {}) as { email?: string; phone?: string; firstName?: string }
  return { email: p.email ?? null, phone: p.phone ?? null, firstName: p.firstName ?? '' }
}

async function setCreditFlag(app: Application, flags: Record<string, unknown>) {
  await createAdminClient()
    .from('applications')
    .update({ credit_flags: { ...((app.credit_flags ?? {}) as object), ...flags } as Json })
    .eq('id', app.id)
}

// ------------------------------------------------------------ deposit
export type StartResult =
  { ok: true; url: string } | { ok: false; error: string; missing?: string[] }

/** Create the deposit payment (amount from the stored quote) and get the checkout link. */
export async function startDeposit(userId: string, origin: string): Promise<StartResult> {
  const app = await latestApplication(userId)
  if (!app) return { ok: false, error: 'No application found.' }
  if (app.status !== 'draft') return { ok: false, error: 'Your deposit has already been paid.' }
  const ready = await readinessFor(app)
  if (!ready.ready)
    return { ok: false, error: 'Not ready for the deposit yet.', missing: ready.missing }
  const quote = await storedQuote(app)
  if (!quote) return { ok: false, error: 'Your plan could not be found.' }
  const { email } = contactOf(app)
  if (!email) return { ok: false, error: 'Add your email address first.' }

  const admin = createAdminClient()
  const provider = await getPaymentsProvider()
  const reference = newReference('DEP')
  const { error } = await admin.from('payments').insert({
    provider: provider.name,
    reference,
    kind: 'deposit',
    consumer_id: userId,
    application_id: app.id,
    amount: quote.result.deposit,
    status: 'pending',
  })
  if (error) return { ok: false, error: 'Could not start the payment. Please try again.' }
  const { authorizationUrl } = await provider.initDeposit({
    email,
    amount: quote.result.deposit,
    reference,
    callbackUrl: `${origin}/app/apply/pay/return`,
    metadata: { kind: 'deposit', application_id: app.id },
  })
  return { ok: true, url: authorizationUrl }
}

/**
 * After the customer comes back from checkout: ask the provider (never trust the redirect) and
 * apply the result through the same idempotent path as the webhook.
 */
export async function confirmCheckout(
  reference: string,
): Promise<EventOutcome | 'pending' | 'failed'> {
  const provider = await getPaymentsProvider()
  const v = await provider.verify(reference)
  if (v.status === 'pending') return 'pending'
  if (v.status === 'failed') {
    await processPaymentEvent({
      type: 'charge.failed',
      eventId: `charge.failed:${v.providerId ?? reference}`,
      reference,
    })
    return 'failed'
  }
  return processPaymentEvent({
    type: 'charge.success',
    eventId: `charge.success:${v.providerId ?? reference}`,
    reference,
    amountKobo: toKobo(v.amount),
    feesKobo: toKobo(v.fee),
    paidAt: v.paidAt,
    channel: v.channel,
  })
}

// ------------------------------------------------------------ events (webhook + verify)
/** Apply one provider event. Safe to call any number of times: only the first has an effect. */
export async function processPaymentEvent(ev: PaymentEvent): Promise<EventOutcome> {
  switch (ev.type) {
    case 'charge.success':
      return chargeSucceeded(ev)
    case 'charge.failed': {
      const { data } = await createAdminClient()
        .from('payments')
        .update({ status: 'failed' })
        .eq('reference', ev.reference)
        .eq('status', 'pending')
        .select('id')
      return data?.length ? 'applied' : 'duplicate'
    }
    case 'mandate.active':
    case 'mandate.failed':
      return mandateChanged(ev)
    case 'refund.processed':
    case 'refund.failed':
      return refundChanged(ev)
    default:
      return 'ignored'
  }
}

async function chargeSucceeded(
  ev: Extract<PaymentEvent, { type: 'charge.success' }>,
): Promise<EventOutcome> {
  const admin = createAdminClient()
  const { data: row } = await admin
    .from('payments')
    .select('*')
    .eq('reference', ev.reference)
    .maybeSingle()
  if (!row) return 'unknown'
  if (row.status === 'success') return 'duplicate'
  if (toKobo(Number(row.amount)) !== ev.amountKobo) {
    await admin
      .from('payments')
      .update({
        status: 'failed',
        raw: { rejected: 'amount_mismatch', event: ev } as unknown as Json,
      })
      .eq('id', row.id)
      .eq('status', 'pending')
    return 'rejected'
  }
  // Conditional update: two deliveries racing each other cannot both win.
  const { data: won, error } = await admin
    .from('payments')
    .update({
      status: 'success',
      provider_event_id: ev.eventId,
      fee: fromKobo(ev.feesKobo),
      paid_at: ev.paidAt ?? new Date().toISOString(),
      channel: ev.channel,
      raw: ev as unknown as Json,
    })
    .eq('id', row.id)
    .neq('status', 'success')
    .select('id')
  if (error && error.code !== '23505') throw new Error(error.message)
  if (error || !won?.length) return 'duplicate'

  if (row.kind === 'deposit') await submitAfterDeposit(row)
  if (row.kind === 'instalment') await applyInstalment(row)
  return 'applied'
}

/** Deposit paid: application submitted, loan pending approval, schedule from the quote. */
async function submitAfterDeposit(payment: Payment) {
  const admin = createAdminClient()
  const { data: app } = await admin
    .from('applications')
    .select('*')
    .eq('id', payment.application_id!)
    .single()
  if (!app) throw new Error('deposit for a missing application')
  const quote = await storedQuote(app)
  if (!quote) throw new Error('deposit for an application without a quote')
  const { data: mandate } = await admin
    .from('mandates')
    .select('id')
    .eq('consumer_id', app.consumer_id)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle()

  // The unique application_id makes this safe to repeat.
  await admin.from('loans').upsert(
    {
      application_id: app.id,
      consumer_id: app.consumer_id,
      quote_id: quote.id,
      system_price: quote.result.systemPrice,
      cost_price: quote.result.costPrice,
      deposit: quote.result.deposit,
      balance: quote.result.balance,
      tenure: quote.tenure,
      status: 'pending_approval',
      auto_pay: Boolean(mandate),
    },
    { onConflict: 'application_id', ignoreDuplicates: true },
  )
  const { data: loan } = await admin
    .from('loans')
    .select('id')
    .eq('application_id', app.id)
    .single()
  if (!loan) throw new Error('loan not created')
  // Provisional dates (one month apart from today); they are re-set when the system is installed.
  await admin.from('repayment_schedule').upsert(
    buildSchedule(quote.result.instalments, new Date()).map((r) => ({
      loan_id: loan.id,
      n: r.n,
      due_date: r.dueDate,
      amount: r.amount,
    })),
    { onConflict: 'loan_id,n', ignoreDuplicates: true },
  )
  await admin.from('payments').update({ loan_id: loan.id }).eq('id', payment.id)
  await admin
    .from('applications')
    .update({
      status: 'submitted',
      submitted_at: new Date().toISOString(),
      credit_flags: { ...((app.credit_flags ?? {}) as object), noAutoPay: !mandate } as Json,
    })
    .eq('id', app.id)
    .eq('status', 'draft')

  const { email, phone, firstName } = contactOf(app)
  const text =
    `Hi ${firstName}, we have received your deposit of ${formatNaira(Number(payment.amount))}. ` +
    'Your application is now under review; we will reply within 48 hours.'
  const messaging = await getMessagingProvider()
  await Promise.allSettled([
    phone &&
      messaging.send({
        channel: 'sms',
        to: phone,
        template: 'deposit_received',
        payload: { text },
      }),
    email &&
      messaging.send({
        channel: 'email',
        to: email,
        template: 'deposit_received',
        payload: { subject: 'Deposit received: your application is under review', text },
      }),
  ])
}

/** A monthly payment made by hand or by direct debit. */
async function applyInstalment(payment: Payment) {
  const admin = createAdminClient()
  if (!payment.schedule_id || !payment.loan_id) return
  const { data: row } = await admin
    .from('repayment_schedule')
    .select('*')
    .eq('id', payment.schedule_id)
    .single()
  if (!row) return
  const paid = Number(row.paid_amount) + Number(payment.amount)
  await admin
    .from('repayment_schedule')
    .update({
      paid_amount: paid,
      status: paid >= Number(row.amount) ? 'paid' : row.status,
      paid_at: paid >= Number(row.amount) ? new Date().toISOString() : null,
    })
    .eq('id', row.id)
  const { data: loan } = await admin
    .from('loans')
    .select('balance')
    .eq('id', payment.loan_id)
    .single()
  if (loan) {
    const balance = Math.max(0, Number(loan.balance) - Number(payment.amount))
    await admin
      .from('loans')
      .update({ balance, ...(balance === 0 ? { status: 'completed' as const } : {}) })
      .eq('id', payment.loan_id)
  }
}

async function mandateChanged(
  ev: Extract<PaymentEvent, { type: 'mandate.active' | 'mandate.failed' }>,
): Promise<EventOutcome> {
  const admin = createAdminClient()
  if (!ev.reference) return 'unknown'
  const { data: m } = await admin
    .from('mandates')
    .select('*')
    .eq('init_reference', ev.reference)
    .maybeSingle()
  if (!m) return 'unknown'
  const next = ev.type === 'mandate.active' ? 'active' : 'failed'
  if (m.status === next) return 'duplicate'
  await admin
    .from('mandates')
    .update(
      ev.type === 'mandate.active'
        ? {
            status: 'active',
            provider_ref: ev.authorizationCode,
            bank_name: ev.bankName,
            account_last4: ev.last4,
          }
        : { status: 'failed', failure_reason: ev.reason },
    )
    .eq('id', m.id)
  if (m.application_id) {
    const { data: app } = await admin
      .from('applications')
      .select('*')
      .eq('id', m.application_id)
      .single()
    if (app) await setCreditFlag(app, { noAutoPay: next !== 'active' })
    await admin
      .from('loans')
      .update({ auto_pay: next === 'active' })
      .eq('application_id', m.application_id)
  }
  return 'applied'
}

async function refundChanged(
  ev: Extract<PaymentEvent, { type: 'refund.processed' | 'refund.failed' }>,
): Promise<EventOutcome> {
  const admin = createAdminClient()
  const { data: original } = await admin
    .from('payments')
    .select('id')
    .eq('reference', ev.transactionReference)
    .maybeSingle()
  if (!original) return 'unknown'
  const { data } = await admin
    .from('payments')
    .update({ status: ev.type === 'refund.processed' ? 'success' : 'failed' })
    .eq('refund_of', original.id)
    .eq('status', 'pending')
    .select('id')
  return data?.length ? 'applied' : 'duplicate'
}

// ------------------------------------------------------------ auto-pay
export async function startMandate(userId: string, origin: string): Promise<StartResult> {
  const app = await latestApplication(userId)
  if (!app) return { ok: false, error: 'No application found.' }
  const { email } = contactOf(app)
  if (!email) return { ok: false, error: 'Add your email address first.' }
  const provider = await getPaymentsProvider()
  const reference = newReference('MDT')
  const { error } = await createAdminClient().from('mandates').insert({
    consumer_id: userId,
    application_id: app.id,
    provider: provider.name,
    init_reference: reference,
    status: 'pending',
  })
  if (error) return { ok: false, error: 'Could not start auto-pay. Please try again.' }
  const r = await provider.createMandate({
    email,
    reference,
    callbackUrl: `${origin}/app/apply/pay/mandate-return?ref=${reference}`,
  })
  if (r.status === 'failed' || !r.authorizationUrl) {
    await processPaymentEvent({
      type: 'mandate.failed',
      eventId: `mandate.failed:${reference}`,
      reference,
      email,
      reason: r.reason ?? null,
    })
    return {
      ok: false,
      error:
        'Auto-pay could not be set up with your bank. You can pay each month from your dashboard.',
    }
  }
  return { ok: true, url: r.authorizationUrl }
}

/** Back from the bank: ask the provider, then apply through the event path. */
export async function confirmMandate(reference: string): Promise<EventOutcome | 'pending'> {
  const provider = await getPaymentsProvider()
  const v = await provider.verifyMandate(reference)
  if (v.status === 'pending') return 'pending'
  if (v.status === 'active' && v.authorizationCode) {
    return processPaymentEvent({
      type: 'mandate.active',
      eventId: `mandate.active:${v.authorizationCode}`,
      reference,
      email: null,
      authorizationCode: v.authorizationCode,
      bankName: v.bankName,
      last4: v.last4,
    })
  }
  return processPaymentEvent({
    type: 'mandate.failed',
    eventId: `mandate.failed:${reference}`,
    reference,
    email: null,
    reason: 'not approved',
  })
}

/** "I'll pay each month from my dashboard": flag it for the credit officer. */
export async function skipAutoPay(userId: string) {
  const app = await latestApplication(userId)
  if (app) await setCreditFlag(app, { noAutoPay: true, autoPaySkipped: true })
}

// ------------------------------------------------------------ pay now
/** Checkout for the next unpaid instalment (only once the plan is active). */
export async function startInstalmentPayment(userId: string, origin: string): Promise<StartResult> {
  const admin = createAdminClient()
  const app = await latestApplication(userId)
  if (!app) return { ok: false, error: 'No application found.' }
  const { data: loan } = await admin
    .from('loans')
    .select('id, status')
    .eq('application_id', app.id)
    .maybeSingle()
  if (!loan || loan.status !== 'active')
    return { ok: false, error: 'Payments start once your system is installed.' }
  const { data: next } = await admin
    .from('repayment_schedule')
    .select('id, n, amount, paid_amount')
    .eq('loan_id', loan.id)
    .neq('status', 'paid')
    .order('n')
    .limit(1)
    .maybeSingle()
  if (!next) return { ok: false, error: 'Everything is paid. Thank you!' }
  const { email } = contactOf(app)
  if (!email) return { ok: false, error: 'Add your email address first.' }
  const amount = Number(next.amount) - Number(next.paid_amount)
  const provider = await getPaymentsProvider()
  const reference = newReference('INS')
  await admin.from('payments').insert({
    provider: provider.name,
    reference,
    kind: 'instalment',
    consumer_id: userId,
    application_id: app.id,
    loan_id: loan.id,
    schedule_id: next.id,
    amount,
    status: 'pending',
  })
  const { authorizationUrl } = await provider.initDeposit({
    email,
    amount,
    reference,
    callbackUrl: `${origin}/app/pay/return`,
    metadata: { kind: 'instalment', n: next.n },
  })
  return { ok: true, url: authorizationUrl }
}

// ------------------------------------------------------------ refund on decline
export type RefundResult =
  | { ok: true; status: 'processed' | 'pending' | 'already_refunded' | 'nothing_to_refund' }
  | { ok: false; error: string }

/**
 * Declined application: refund the whole deposit through the provider, cancel the loan and tell
 * the customer by SMS, WhatsApp and email. Safe to repeat (one refund per deposit).
 */
export async function refundDeposit(applicationId: string): Promise<RefundResult> {
  const admin = createAdminClient()
  const { data: deposit } = await admin
    .from('payments')
    .select('*')
    .eq('application_id', applicationId)
    .eq('kind', 'deposit')
    .eq('status', 'success')
    .limit(1)
    .maybeSingle()
  if (!deposit) return { ok: true, status: 'nothing_to_refund' }
  const { data: existing } = await admin
    .from('payments')
    .select('id')
    .eq('refund_of', deposit.id)
    .neq('status', 'failed')
    .limit(1)
    .maybeSingle()
  if (existing) return { ok: true, status: 'already_refunded' }

  const provider = await getPaymentsProvider()
  const amount = Number(deposit.amount)
  const { data: refundRow, error } = await admin
    .from('payments')
    .insert({
      provider: provider.name,
      reference: newReference('RFD'),
      kind: 'refund',
      consumer_id: deposit.consumer_id,
      application_id: applicationId,
      loan_id: deposit.loan_id,
      refund_of: deposit.id,
      amount,
      status: 'pending',
    })
    .select('id')
    .single()
  if (error || !refundRow) return { ok: false, error: 'Could not record the refund.' }

  let status: 'pending' | 'processed' | 'failed'
  try {
    status = (await provider.refund({ reference: deposit.reference, amount })).status
  } catch (e) {
    status = 'failed'
    await admin
      .from('payments')
      .update({
        status: 'failed',
        raw: { error: e instanceof Error ? e.message : 'refund failed' } as Json,
      })
      .eq('id', refundRow.id)
    return {
      ok: false,
      error: 'The payment provider did not accept the refund. Try again or refund by hand.',
    }
  }
  if (status === 'processed')
    await admin.from('payments').update({ status: 'success' }).eq('id', refundRow.id)
  if (status === 'failed') {
    await admin.from('payments').update({ status: 'failed' }).eq('id', refundRow.id)
    return { ok: false, error: 'The payment provider refused the refund.' }
  }
  await admin.from('loans').update({ status: 'cancelled' }).eq('application_id', applicationId)

  const { data: app } = await admin
    .from('applications')
    .select('*')
    .eq('id', applicationId)
    .single()
  if (app) {
    const { email, phone, firstName } = contactOf(app)
    const text =
      `Hi ${firstName}, we are sorry we could not approve your Go4Solar payment plan this time. ` +
      `Your deposit of ${formatNaira(amount)} is being refunded in full to the account you paid from.`
    const messaging = await getMessagingProvider()
    await Promise.allSettled([
      phone &&
        messaging.send({
          channel: 'sms',
          to: phone,
          template: 'deposit_refunded',
          payload: { text },
        }),
      phone &&
        messaging.send({
          channel: 'whatsapp',
          to: phone,
          template: 'deposit_refunded',
          payload: { text },
        }),
      email &&
        messaging.send({
          channel: 'email',
          to: email,
          template: 'deposit_refunded',
          payload: { subject: 'Your Go4Solar deposit is being refunded', text },
        }),
    ])
  }
  return { ok: true, status: status === 'processed' ? 'processed' : 'pending' }
}
