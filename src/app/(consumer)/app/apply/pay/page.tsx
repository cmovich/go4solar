import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { ActionButton } from '@/components/payments/ActionButton'
import { requireUser } from '@/lib/auth/roles'
import { formatNaira } from '@/lib/money'
import { autoPayDecided, loadDashboard } from '@/lib/payments/dashboard'

import { chooseManualPayments, payDeposit, setUpAutoPay } from '../../pay/actions'

export const metadata: Metadata = { title: 'Pay your deposit' }
export const dynamic = 'force-dynamic'

const primary = 'bg-brand-green hover:bg-brand-dark h-14 w-full text-lg font-semibold'

/** Final step: the deposit (from the stored quote), then auto-pay for the monthly payments. */
export default async function PayDepositPage({
  searchParams,
}: {
  searchParams: Promise<{ payment?: string }>
}) {
  const { user } = await requireUser('/app/apply/pay')
  const d = await loadDashboard(user!.id)
  if (!d) redirect('/app/apply')
  const sp = await searchParams
  if (d.depositPaid && (await autoPayDecided(d.applicationId))) redirect('/app')

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-6">
      <div>
        <p className="text-brand-green text-sm font-semibold">Reference {d.reference}</p>
        <h1 className="text-brand-dark text-2xl font-bold">
          {d.depositPaid ? 'Set up auto-pay' : 'Pay your deposit'}
        </h1>
      </div>

      {sp.payment === 'pending' && (
        <p className="rounded-md bg-amber-50 px-4 py-2 text-sm text-amber-900" role="status">
          We are still confirming your payment with the bank. This page will update when it is done;
          you can refresh in a minute.
        </p>
      )}
      {sp.payment === 'failed' && (
        <p className="rounded-md bg-red-50 px-4 py-2 text-sm text-red-800" role="alert">
          That payment did not go through. No money was taken. Please try again.
        </p>
      )}

      <section className="bg-brand-mist rounded-2xl p-5" data-testid="deposit-summary">
        <dl className="divide-y rounded-xl bg-white">
          {(
            [
              ['Deposit today', formatNaira(d.plan.deposit)],
              ['Then', `${d.plan.months} monthly payments of ${formatNaira(d.plan.monthly)}`],
              ['Total amount payable', formatNaira(d.plan.systemPrice)],
            ] as const
          ).map(([k, v]) => (
            <div key={k} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="text-brand-dark text-right font-bold">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-2 text-sm">
          0% interest: the total amount payable above is everything you pay. A late fee applies only
          if a monthly payment is late, as set out in your agreement.
        </p>
      </section>

      {!d.depositPaid && !d.depositReady && (
        <section
          className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-5"
          data-testid="deposit-locked"
        >
          <h2 className="font-bold text-amber-900">Before you can pay the deposit</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-900">
            {d.missing.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
          <Link
            href="/app/apply/sign"
            className="text-brand-blue mt-3 inline-block text-sm font-semibold underline"
          >
            Go to your agreement and guarantor
          </Link>
        </section>
      )}

      {!d.depositPaid && d.depositReady && (
        <section className="space-y-2">
          <p className="text-sm">
            Pay by card, bank transfer or USSD. You will come straight back here.
          </p>
          <ActionButton action={payDeposit} className={primary} testId="pay-deposit">
            Pay {formatNaira(d.plan.deposit)} deposit
          </ActionButton>
        </section>
      )}

      {d.depositPaid && (
        <section className="space-y-3 rounded-2xl border-2 p-5" data-testid="autopay-step">
          <p className="text-brand-green font-semibold">Deposit received. Thank you!</p>
          <h2 className="text-brand-dark text-lg font-bold">Pay each month automatically</h2>
          <p className="text-sm">
            Link your bank account once and your monthly payment of {formatNaira(d.plan.monthly)} is
            taken on its due date. Nothing is taken until your system is installed and your plan
            starts.
          </p>
          <ActionButton action={setUpAutoPay} className={primary} testId="setup-autopay">
            Set up auto-pay
          </ActionButton>
          <ActionButton
            action={chooseManualPayments}
            variant="link"
            className="w-full"
            testId="skip-autopay"
          >
            My bank is not listed: I will pay each month from my dashboard
          </ActionButton>
        </section>
      )}
    </main>
  )
}
