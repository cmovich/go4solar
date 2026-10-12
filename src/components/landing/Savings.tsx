import { formatNaira } from '@/lib/money'

import { Container, SectionHeading } from './Band'

// Illustrative figures only (PRD pricing illustration: 20% deposit, 12 months), compared over 2 years.
const compareMonths = 24
const generatorMonthly = 180000
const planMonthly = 165017
const planMonths = 12
const planDeposit = 495050
const planTotalInstalments = 1980198

const generatorTotal = generatorMonthly * compareMonths
const planTotalPayable = planDeposit + planTotalInstalments
const saving = generatorTotal - planTotalPayable

export function Savings() {
  return (
    <section className="bg-brand-mist py-20 sm:py-24">
      <Container>
        <SectionHeading
          eyebrow="Savings comparison"
          title="A generator costs you every month, forever"
          lead="A Go4Solar payment plan has an end date. After the last payment the system is yours and the monthly cost drops to zero."
        />

        <div className="mt-12 grid gap-6 lg:grid-cols-2">
          <article className="rounded-2xl border border-black/5 bg-white p-6 sm:p-8">
            <p className="text-muted-foreground text-sm font-semibold tracking-wide uppercase">
              Generator
            </p>
            <p className="text-brand-dark mt-3 text-4xl font-bold tracking-tight">
              {formatNaira(generatorMonthly)}
              <span className="text-muted-foreground text-lg font-medium"> every month</span>
            </p>
            <p className="text-muted-foreground mt-3 text-base">
              Fuel and servicing, month after month — and it never stops.
            </p>
            <p className="mt-6 text-sm font-semibold text-red-700">
              Over 2 years: {formatNaira(generatorTotal)} — and it keeps going.
            </p>
          </article>

          <article className="border-brand-green relative rounded-2xl border-2 bg-white p-6 sm:p-8">
            <span className="bg-brand-orange text-brand-dark absolute -top-3 left-6 rounded-full px-3 py-1 text-xs font-bold tracking-wide uppercase">
              Example
            </span>
            <p className="text-brand-green text-sm font-semibold tracking-wide uppercase">
              Go4Solar payment plan
            </p>
            <p className="text-brand-dark mt-3 text-4xl font-bold tracking-tight">
              {formatNaira(planMonthly)}
              <span className="text-muted-foreground text-lg font-medium">
                {' '}
                a month for {planMonths} months
              </span>
            </p>
            <p className="text-muted-foreground mt-3 text-base">
              after a {formatNaira(planDeposit)} deposit, then {formatNaira(0)}
            </p>
            <dl className="mt-6 grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-muted-foreground">Deposit</dt>
                <dd className="text-brand-dark font-semibold">{formatNaira(planDeposit)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Total amount payable</dt>
                <dd className="text-brand-dark font-semibold">{formatNaira(planTotalPayable)}</dd>
              </div>
            </dl>
            <p className="bg-brand-green/10 text-brand-dark mt-6 rounded-lg px-4 py-3 text-base font-semibold">
              Over 2 years you save {formatNaira(saving)} — and you own the system.
            </p>
            <p className="text-brand-green mt-4 text-sm font-semibold">
              0% interest · one fixed price, no hidden charges
            </p>
          </article>
        </div>

        <p className="text-muted-foreground mt-6 text-xs">
          Example only. Your price depends on your appliances, deposit and tenure. Every quote shows
          the total amount payable before you sign. Late payments attract a fee of 0.75% of the
          overdue amount per day.
        </p>
      </Container>
    </section>
  )
}
