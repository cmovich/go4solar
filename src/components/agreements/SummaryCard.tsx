import type { AgreementValues } from '@/lib/agreements/render'

/** Plain-language summary shown before the full agreement. Values come from the stored quote. */
export function SummaryCard({
  v,
  businessName,
}: {
  v: AgreementValues
  businessName?: string | null
}) {
  const rows: [string, string][] = [
    ['Total amount payable', v.totalPayable ?? ''],
    [`Deposit (${v.depositPct})`, v.deposit ?? ''],
    ['Monthly payment', `${v.monthly}${v.lastInstalmentNote ?? ''}`],
    ['Number of monthly payments', v.instalmentCount ?? ''],
  ]
  return (
    <section className="bg-brand-mist rounded-2xl p-5" data-testid="sign-summary">
      <h2 className="text-brand-dark text-lg font-bold">Your payment plan in plain words</h2>
      {businessName && (
        <p className="mt-1 text-sm">
          The customer is <strong>{businessName}</strong>. You sign as its director or authorised
          signatory.
        </p>
      )}
      <dl className="mt-3 divide-y rounded-xl bg-white">
        {rows.map(([k, val]) => (
          <div key={k} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
            <dt className="text-muted-foreground">{k}</dt>
            <dd
              className="text-brand-dark text-right font-bold"
              data-testid={`sum-${k.split(' ')[0]!.toLowerCase()}`}
            >
              {val}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-sm font-semibold">
        No interest. The total amount payable above is everything you pay for the system.
      </p>
      <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm">
        <li>
          <strong>Collateral:</strong> the system stays Go4Solar&apos;s security until your last
          payment.
        </li>
        <li>
          <strong>Remote lock:</strong> if a payment is {v.lockAfterDays} days overdue the system
          can be locked, and it is unlocked once you pay. An approved extension pauses the lock.
        </li>
        <li>
          <strong>Late fee:</strong> {v.lateFeeDaily} of the overdue amount per day, capped at{' '}
          {v.lateFeeCap} of that amount.
        </li>
        <li>
          <strong>Your data:</strong> we use your ID and face images to verify you, and we may
          report your payment record to credit bureaus.
        </li>
      </ul>
    </section>
  )
}
