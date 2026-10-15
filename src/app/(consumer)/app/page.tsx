import { Check, Circle, X } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { ActionButton } from '@/components/payments/ActionButton'
import { requireUser } from '@/lib/auth/roles'
import { formatNaira, formatPercent } from '@/lib/money'
import { loadDashboard } from '@/lib/payments/dashboard'
import { lagosDate } from '@/lib/payments/lock'

import { confirmInstallation, sendBackForReview } from './actions'
import { payNextInstalment, setUpAutoPay } from './pay/actions'

export const metadata: Metadata = { title: 'Your solar plan' }
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

/** Customer dashboard: where things stand, the plan, the schedule, auto-pay and documents. */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ payment?: string; autopay?: string; installed?: string }>
}) {
  const { user } = await requireUser('/app')
  const d = await loadDashboard(user!.id)
  if (!d) redirect('/app/apply')
  const sp = await searchParams
  const nextDue = d.schedule.find((r) => r.status !== 'paid')
  const paidTotal = d.schedule.reduce((s, r) => s + r.paidAmount, 0)

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-6">
      <div>
        <p className="text-brand-green text-sm font-semibold">Reference {d.reference}</p>
        <h1 className="text-brand-dark text-2xl font-bold">Your solar plan</h1>
        <p className="mt-1 text-lg font-semibold" data-testid="application-status">
          {d.loan?.status === 'active' ? STATUS_LABEL.active : (STATUS_LABEL[d.status] ?? d.status)}
        </p>
        {(d.status === 'submitted' || d.status === 'under_review') && (
          <p className="text-muted-foreground text-sm">We will reply within 48 hours.</p>
        )}
      </div>

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
                </tr>
              ))}
            </tbody>
          </table>
          {d.loan?.status === 'active' && nextDue && (
            <div className="mt-4">
              <ActionButton
                action={payNextInstalment}
                className="bg-brand-green hover:bg-brand-dark h-12 w-full font-semibold"
                testId="pay-now"
              >
                Pay now: {formatNaira(nextDue.amount - nextDue.paidAmount)} (payment {nextDue.n})
              </ActionButton>
            </div>
          )}
        </section>
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

      {/* Documents */}
      {d.documents.length > 0 && (
        <section className="rounded-2xl border p-5" data-testid="documents">
          <h2 className="text-brand-dark text-lg font-bold">Documents</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {d.documents.map((doc) => (
              <li key={doc.url}>
                <a href={doc.url} className="text-brand-blue font-semibold underline">
                  {doc.label}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  )
}
