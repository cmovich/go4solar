import { Check, Circle, X } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { RequestChange } from '@/components/account/RequestChange'
import { ActionButton } from '@/components/payments/ActionButton'
import { siteConfig } from '@/config/site'
import { CHANGE_FIELD_LABELS, type ChangeField } from '@/lib/account/account'
import { waitingQuote } from '@/lib/applications/server'
import { requireUser } from '@/lib/auth/roles'
import { formatNaira, formatPercent } from '@/lib/money'
import { loadDashboard } from '@/lib/payments/dashboard'
import { lagosDate } from '@/lib/payments/lock'
import { whatsappHref } from '@/lib/whatsapp'

import { confirmInstallation, sendBackForReview } from './actions'
import { payNextInstalment, setUpAutoPay } from './pay/actions'

export const metadata: Metadata = { title: 'My account' }

const MENU = [
  ['status', 'Status'],
  ['payments', 'Payments'],
  ['system', 'My system'],
  ['documents', 'Documents'],
  ['details', 'My details'],
  ['guarantor', 'Guarantor'],
  ['help', 'Help'],
] as const

const GUARANTOR_STATUS: Record<string, string> = {
  invited: 'invited: we sent them a link',
  in_progress: 'filling in their details',
  signed: 'signed',
  declined: 'declined: please choose someone else',
  expired: 'the link expired',
}
export const dynamic = 'force-dynamic'

const STATUS_LABEL: Record<string, string> = {
  draft: 'Application in progress',
  submitted: 'Under review',
  under_review: 'Under review',
  more_info: 'We need a little more information',
  approved: 'Approved',
  active: 'Your payment plan is active',
  declined: 'Not approved',
}

const fmtDate = (iso: string) =>
  new Date(`${iso}T12:00:00+01:00`).toLocaleDateString('en-GB', {
    timeZone: 'Africa/Lagos',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })

/**
 * "My account": the signed-in customer's home. Status, next payment, payments and receipts, the
 * system, documents, details (changes via a request), guarantor and help, on one page.
 */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ payment?: string; autopay?: string; installed?: string }>
}) {
  const { user } = await requireUser('/app')
  const d = await loadDashboard(user!.id)
  if (!d) redirect('/app/apply')
  const waiting = await waitingQuote(user!.id)
  const sp = await searchParams
  const nextDue = d.schedule.find((r) => r.status !== 'paid')
  const paidTotal = d.schedule.reduce((s, r) => s + r.paidAmount, 0)

  const first = d.details.name?.split(' ')[0] ?? null
  const receiptFor = new Map(d.receipts.filter((r) => r.n !== null).map((r) => [r.n!, r.id]))
  const depositReceipt = d.receipts.find((r) => r.label === 'Deposit')
  const card = 'scroll-mt-16 rounded-2xl border p-5'

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-6">
      {waiting && (
        <p
          className="rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-900"
          role="status"
          data-testid="waiting-quote"
        >
          Your new quote {waiting} is saved. This application is already signed or submitted, so it
          stays as it is; you can apply with the new quote once it is finished. Questions? Call us.
        </p>
      )}
      <div>
        <p className="text-brand-green text-sm font-semibold">Reference {d.reference}</p>
        <h1 className="text-brand-dark text-2xl font-bold">
          {first ? `Hello ${first}` : 'My account'}
        </h1>
        <p className="mt-1 text-lg font-semibold" data-testid="application-status">
          {d.loan?.status === 'active' ? STATUS_LABEL.active : (STATUS_LABEL[d.status] ?? d.status)}
        </p>
      </div>

      {/* Small top menu: jumps to each section (scrolls sideways on phones). */}
      <nav
        aria-label="My account"
        className="bg-background/95 sticky top-0 z-10 -mx-4 overflow-x-auto border-b px-4 py-2 backdrop-blur sm:mx-0 sm:rounded-lg sm:border"
      >
        <ul className="flex gap-1 text-sm font-semibold whitespace-nowrap">
          {MENU.map(([id, label]) => (
            <li key={id}>
              <a
                href={`#${id}`}
                className="text-brand-dark hover:bg-brand-mist inline-flex min-h-10 items-center rounded-md px-3"
              >
                {label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      {sp.payment === 'received' && (
        <p
          className="bg-brand-mist text-brand-green rounded-md px-4 py-2 text-sm font-semibold"
          role="status"
        >
          Payment received. Thank you!
        </p>
      )}

      {sp.installed === '1' && (
        <p
          className="bg-brand-mist text-brand-green rounded-md px-4 py-2 text-sm font-semibold"
          role="status"
        >
          Thank you for confirming. Your payment plan has started.
        </p>
      )}

      {/* 1. Status */}
      <section id="status" className="scroll-mt-16 space-y-4" aria-labelledby="status-h">
        <h2 id="status-h" className="sr-only">
          Status
        </h2>
        {/* Timeline */}
        <ol
          className="grid grid-cols-2 gap-2 sm:grid-cols-6"
          aria-label="Progress"
          data-testid="timeline"
        >
          {d.timeline.map((s) => (
            <li
              key={s.label}
              aria-current={s.state === 'current' ? 'step' : undefined}
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold sm:flex-col sm:text-center ${
                s.state === 'done'
                  ? 'bg-brand-mist text-brand-green'
                  : s.state === 'current'
                    ? 'bg-brand-green text-white'
                    : s.state === 'failed'
                      ? 'bg-red-50 text-red-700'
                      : 'bg-slate-50 text-slate-500'
              }`}
            >
              {s.state === 'done' ? (
                <Check className="size-4 shrink-0" aria-hidden />
              ) : s.state === 'failed' ? (
                <X className="size-4 shrink-0" aria-hidden />
              ) : (
                <Circle className="size-4 shrink-0" aria-hidden />
              )}
              {s.label}
            </li>
          ))}
        </ol>

        <p className="bg-brand-mist rounded-xl px-4 py-3" data-testid="what-next">
          <strong className="text-brand-dark">What happens next: </strong>
          {d.whatNext}
        </p>
      </section>
      {d.moreInfo && (
        <section
          className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-5"
          data-testid="more-info"
        >
          <h2 className="font-bold text-amber-900">We need a little more information</h2>
          <p className="mt-1 text-sm text-amber-900">{d.moreInfo}</p>
          <p className="mt-1 text-sm text-amber-900">
            Send it to us on WhatsApp or update your application, then tell us it is done.
          </p>
          <div className="mt-3">
            <ActionButton action={sendBackForReview} variant="outline" testId="send-back">
              I have done this: please review again
            </ActionButton>
          </div>
        </section>
      )}

      {d.job && (
        <section className="border-brand-green rounded-2xl border-2 p-5" data-testid="installation">
          <h2 className="text-brand-dark text-lg font-bold">Installation</h2>
          <p className="mt-1 text-sm">
            {d.job.installer} ({d.job.installerPhone})
            {d.job.date
              ? ` will install your system on ${fmtDate(d.job.date)}.`
              : ' will call you to agree a date.'}
          </p>
          {d.job.status === 'installed' && (
            <div className="mt-3 space-y-2">
              <p className="text-sm font-semibold">
                Your system has been installed. Please check that it is working, then confirm. Your
                monthly payments start one month after you confirm.
              </p>
              <ActionButton
                action={confirmInstallation}
                className="bg-brand-green hover:bg-brand-dark h-12 w-full font-semibold"
                testId="confirm-installation"
              >
                My system is installed and working
              </ActionButton>
            </div>
          )}
          {d.job.status === 'commissioned' && (
            <p className="text-brand-green mt-1 text-sm font-semibold">
              Installed and confirmed. Thank you!
            </p>
          )}
        </section>
      )}

      {/* Still missing */}
      {d.missing.length > 0 && (
        <section
          className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-5"
          data-testid="still-missing"
        >
          <h2 className="font-bold text-amber-900">Still to do</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-900">
            {d.missing.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
          <Link
            href={
              !d.reviewed ? '/app/apply' : d.depositReady ? '/app/apply/pay' : '/app/apply/sign'
            }
            className="text-brand-blue mt-3 inline-block text-sm font-semibold underline"
          >
            Continue
          </Link>
        </section>
      )}

      {/* 2. Next payment */}
      <section id="payments" className={card} data-testid="next-payment">
        <h2 className="text-brand-dark text-lg font-bold">Next payment</h2>
        {d.loan?.status === 'active' && d.nextPayment ? (
          <>
            <p className="mt-1 text-2xl font-bold tabular-nums">
              {formatNaira(d.nextPayment.amount)}
            </p>
            <p className={`text-sm ${d.nextPayment.late ? 'font-semibold text-red-700' : ''}`}>
              {d.nextPayment.late ? 'Overdue since' : 'Due'} {fmtDate(d.nextPayment.dueDate)}{' '}
              (payment {d.nextPayment.n})
            </p>
            <div className="mt-3">
              <ActionButton
                action={payNextInstalment}
                className="bg-brand-green hover:bg-brand-dark h-12 w-full font-semibold"
                testId="pay-now"
              >
                Pay now: {formatNaira(d.nextPayment.amount)}
              </ActionButton>
            </div>
          </>
        ) : (
          <p className="mt-1 text-sm">
            {d.loan?.status === 'completed'
              ? 'Nothing more to pay. Thank you!'
              : 'Monthly payments start one month after installation. Nothing is due before then.'}
          </p>
        )}
        <p className="mt-3 text-sm" data-testid="amount-left">
          Amount left to pay: <strong>{formatNaira(d.amountLeft)}</strong>
        </p>
      </section>

      {/* 3. Payments */}
      {/* Plan summary */}
      <section className="rounded-2xl border p-5" data-testid="plan-summary">
        <h2 className="text-brand-dark text-lg font-bold">Your payment plan</h2>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          {(
            [
              ['Monthly payment', formatNaira(d.plan.monthly)],
              ['Months', String(d.plan.months)],
              ['Deposit', formatNaira(d.plan.deposit)],
              ['Total amount payable', formatNaira(d.plan.systemPrice)],
            ] as const
          ).map(([k, v]) => (
            <div key={k} className="bg-brand-mist rounded-lg p-3">
              <dt className="text-muted-foreground text-xs">{k}</dt>
              <dd className="text-brand-dark font-bold">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-2 text-sm">
          0% interest. The total amount payable above is everything you pay for the system.
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm" data-testid="plan-rules">
          <li>
            <strong>Late fee:</strong> {formatPercent(d.rules.lateFeeDaily, 2)} of the overdue
            amount per day, capped at {formatPercent(d.rules.lateFeeCap)} of that amount.
          </li>
          <li>
            <strong>Remote lock:</strong> if a payment is {d.rules.lockAfterDays} days overdue the
            system can be locked; it is unlocked once you pay. An approved extension pauses the
            lock.
          </li>
          {d.loan?.extensionUntil && d.loan.extensionUntil >= lagosDate() && (
            <li data-testid="extension-note">
              <strong>Extension approved</strong> until {fmtDate(d.loan.extensionUntil)}: your
              system will not be locked before then.
            </li>
          )}
        </ul>
      </section>

      {/* Schedule */}
      {d.schedule.length > 0 && (
        <section className="rounded-2xl border p-5" data-testid="schedule">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-brand-dark text-lg font-bold">Monthly payments</h2>
            <p className="text-sm">
              Paid {formatNaira(paidTotal)} of {formatNaira(d.plan.balance)}
            </p>
          </div>
          {d.loan && d.loan.status !== 'active' && d.loan.status !== 'completed' ? (
            <p className="mt-1 text-sm font-semibold" data-testid="payments-start">
              Payments start one month after installation. Nothing is due before then.
            </p>
          ) : (
            nextDue && (
              <p className="mt-1 text-sm font-semibold" data-testid="payments-start">
                Next payment due {fmtDate(nextDue.dueDate)}.
              </p>
            )
          )}
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="bg-brand-green text-left text-white">
                <th className="px-3 py-2 font-semibold">#</th>
                <th className="px-3 py-2 font-semibold">Due</th>
                <th className="px-3 py-2 text-right font-semibold">Amount</th>
                <th className="px-3 py-2 text-right font-semibold">Status</th>
                <th className="px-3 py-2 text-right font-semibold">
                  <span className="sr-only">Receipt</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {d.schedule.map((r) => (
                <tr key={r.n} className="even:bg-brand-mist">
                  <td className="px-3 py-2">{r.n}</td>
                  <td className="px-3 py-2">{fmtDate(r.dueDate)}</td>
                  <td className="px-3 py-2 text-right">{formatNaira(r.amount)}</td>
                  <td
                    className={`px-3 py-2 text-right font-semibold ${
                      r.status === 'paid'
                        ? 'text-brand-green'
                        : r.status === 'late'
                          ? 'text-red-700'
                          : ''
                    }`}
                  >
                    {r.status === 'paid' ? 'Paid' : r.status === 'late' ? 'Late' : 'Due'}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {receiptFor.get(r.n) && (
                      <a
                        href={`/api/app/receipts/${receiptFor.get(r.n)}`}
                        className="text-brand-blue text-xs font-semibold underline"
                      >
                        Receipt
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {depositReceipt && (
        <p className="text-sm" data-testid="deposit-receipt">
          Deposit of {formatNaira(depositReceipt.amount)} paid.{' '}
          <a
            href={`/api/app/receipts/${depositReceipt.id}`}
            className="text-brand-blue font-semibold underline"
          >
            Download receipt
          </a>
        </p>
      )}
      {/* Auto-pay */}
      {d.depositPaid && (
        <section className="rounded-2xl border p-5" data-testid="autopay-status">
          <h2 className="text-brand-dark text-lg font-bold">Auto-pay</h2>
          {d.autoPay.state === 'on' ? (
            <p className="text-brand-green mt-1 font-semibold">
              Auto-pay is on
              {d.autoPay.bank
                ? ` (${d.autoPay.bank}${d.autoPay.last4 ? ` ••••${d.autoPay.last4}` : ''})`
                : ''}
              .
            </p>
          ) : d.autoPay.state === 'pending' && sp.autopay === 'pending' ? (
            <p className="mt-1 text-sm">
              Your bank is still confirming auto-pay. This can take a few minutes.
            </p>
          ) : (
            <div className="mt-1 space-y-2">
              <p className="text-sm">
                Auto-pay is off. Pay each month from your dashboard, or link your bank account.
              </p>
              <ActionButton action={setUpAutoPay} variant="outline" testId="setup-autopay">
                Set up auto-pay
              </ActionButton>
            </div>
          )}
        </section>
      )}

      {/* 4. My system */}
      <section id="system" className={card} data-testid="my-system">
        <h2 className="text-brand-dark text-lg font-bold">My system</h2>
        {d.system ? (
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            {(
              [
                ['Inverter', `${d.system.inverterKva} kVA`],
                ['Battery', `${d.system.batteryKwh} kWh`],
                ['Solar panels', `${d.system.panelCount} × ${d.system.panelWatts} W`],
                ['Installed', d.installedAt ? fmtDate(d.installedAt.slice(0, 10)) : 'Not yet'],
              ] as const
            ).map(([k, v]) => (
              <div key={k} className="bg-brand-mist rounded-lg p-3">
                <dt className="text-muted-foreground text-xs">{k}</dt>
                <dd className="text-brand-dark font-bold">{v}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-muted-foreground mt-1 text-sm">Your system details appear here.</p>
        )}
      </section>

      {/* 5. Documents */}
      <section id="documents" className={card} data-testid="documents">
        <h2 className="text-brand-dark text-lg font-bold">Documents</h2>
        <ul className="mt-2 space-y-2 text-sm">
          {d.documents.map((doc) => (
            <li key={doc.url}>
              <a href={doc.url} className="text-brand-blue font-semibold underline">
                {doc.label}
              </a>
            </li>
          ))}
          {d.documents.length === 0 && (
            <li className="text-muted-foreground">
              Your signed agreement appears here once you sign.
            </li>
          )}
          <li className="text-muted-foreground" data-testid="invoice-placeholder">
            Invoice (PDF): coming soon.
          </li>
        </ul>
      </section>

      {/* 6. My details */}
      <section id="details" className={card} data-testid="my-details">
        <h2 className="text-brand-dark text-lg font-bold">My details</h2>
        <dl className="mt-3 grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[10rem_1fr]">
          {(
            [
              ['Name', d.details.name],
              ['Phone', d.details.phone],
              ['Email', d.details.email],
              ['Installation address', d.details.address],
            ] as const
          ).map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="font-semibold break-words">{v ?? '—'}</dd>
            </div>
          ))}
        </dl>
        {d.changeRequests.length > 0 && (
          <ul className="mt-3 space-y-1 text-sm" data-testid="change-requests">
            {d.changeRequests.map((c) => (
              <li key={c.createdAt + c.field}>
                {CHANGE_FIELD_LABELS[c.field as ChangeField] ?? c.field} → {c.newValue}:{' '}
                <strong>
                  {c.status === 'pending'
                    ? 'waiting for our check'
                    : c.status === 'approved'
                      ? 'done'
                      : 'not changed'}
                </strong>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4">
          <RequestChange />
        </div>
      </section>

      {/* 7. My guarantor */}
      <section id="guarantor" className={card} data-testid="my-guarantor">
        <h2 className="text-brand-dark text-lg font-bold">My guarantor</h2>
        {d.guarantor ? (
          <p className="mt-1 text-sm">
            <strong>{d.guarantor.name}</strong> ·{' '}
            {GUARANTOR_STATUS[d.guarantor.status] ?? d.guarantor.status}
          </p>
        ) : (
          <p className="text-muted-foreground mt-1 text-sm">No guarantor yet.</p>
        )}
      </section>

      {/* 8. Help */}
      <section id="help" className={card} data-testid="help">
        <h2 className="text-brand-dark text-lg font-bold">Help</h2>
        <p className="mt-1 text-sm">
          Questions about your plan or your system? Talk to an advisor (quote reference{' '}
          {d.reference}).
        </p>
        <a
          href={whatsappHref(
            process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? '',
            `Hello Go4Solar, I need help with my plan ${d.reference}.`,
            siteConfig.phones[0],
          )}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex h-12 items-center rounded-lg bg-[#25D366] px-5 font-semibold text-white hover:bg-[#1ebe5b]"
        >
          Chat with an advisor on WhatsApp
        </a>
      </section>
    </main>
  )
}
