import { isFunderLogin } from '@/lib/auth/staffRoles'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { z } from 'zod'

import { OnboardingLinkForm } from '@/components/admin/exports/OnboardingLinkForm'
import { DecisionControl } from '@/components/admin/tradeLenda/DecisionControl'
import { Downloads } from '@/components/admin/tradeLenda/Downloads'
import { requireFunderViewer } from '@/lib/auth/roles'
import { formatNaira } from '@/lib/money'
import { batchLabel } from '@/lib/tradeLenda/batch'
import { LENDING_TYPE_SHORT } from '@/lib/tradeLenda/figures'
import { funderBatch } from '@/lib/tradeLenda/server'

export const metadata: Metadata = { title: 'Batch' }
export const dynamic = 'force-dynamic'

/** One batch: the summary, each customer, the funder's decision and onboarding links. */
export default async function FunderBatchPage({
  params,
  searchParams,
}: {
  params: Promise<{ batchId: string }>
  searchParams: Promise<{ as?: string }>
}) {
  const s = await requireFunderViewer()
  const { batchId } = await params
  const sp = await searchParams
  if (!z.uuid().safeParse(batchId).success) notFound()
  // Super admin "View as [funder]" keeps the chosen funder in the address.
  const viewAs = s.role === 'super_admin' && z.uuid().safeParse(sp.as).success ? sp.as! : null
  const asQ = viewAs ? `?as=${viewAs}` : ''
  const b = await funderBatch({ id: s.user!.id, role: s.role }, batchId, { viewAs })
  if (!b) notFound()
  const t = b.totals
  const cards: [string, string][] = [
    ['Customers', String(t.customers)],
    ['Total cost to customers', formatNaira(t.totalCostToCustomers)],
    ['Total deposits', formatNaira(t.totalDeposits)],
    ['Total financed', formatNaira(t.totalFinanced)],
    ['Total repayments', formatNaira(t.totalRepayments)],
    ['Monthly repayments due', formatNaira(t.monthlyRepaymentsDue)],
    ...(t.financing
      ? ([
          ['Basic / Full', `${t.financing.basic} Basic · ${t.financing.full} Full`],
          ['Deposits paid', formatNaira(t.financing.depositsPaid)],
          ['Deposits to be paid', formatNaira(t.financing.depositsToPay)],
          ['You finance (total)', formatNaira(t.financing.financed)],
          ['Your earnings (total interest/charge)', formatNaira(t.financing.earnings)],
          ['Repayment to you (total)', formatNaira(t.financing.totalRepayment)],
        ] as [string, string][])
      : []),
  ]
  const canLink = (isFunderLogin(s.role) || s.role === 'super_admin') && !b.replaced
  const canDecide = isFunderLogin(s.role) && !b.replaced
  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <p className="text-sm">
        <Link href={`/admin/funder${asQ}`} className="text-brand-blue underline">
          ‹ Batches
        </Link>
      </p>
      <h1 className="text-brand-dark mt-2 text-2xl font-bold" data-testid="batch-title">
        {batchLabel(b.number, b.version, b.lendingType)}
      </h1>
      <p className="text-muted-foreground text-sm">
        {b.funderName} · {LENDING_TYPE_SHORT[b.lendingType]} · sent {b.createdAt.slice(0, 10)} ·
        version {b.version} of {b.versions}
        {b.replaced ? ' · replaced by a newer version' : ''}
      </p>
      <Downloads href={`/api/funder/batches/${b.id}`} label="Download batch" />
      <section className="mt-4 grid gap-3 sm:grid-cols-3" data-testid="batch-summary">
        {cards.map(([k, v]) => (
          <div key={k} className="bg-brand-mist rounded-xl p-3">
            <p className="text-muted-foreground text-xs">{k}</p>
            <p className="text-brand-dark text-lg font-bold tabular-nums">{v}</p>
          </div>
        ))}
      </section>
      <section className="mt-4 rounded-xl border p-3 text-sm" data-testid="batch-onboarding">
        <h2 className="text-brand-dark font-semibold">Onboarding link for the whole batch</h2>
        <p className="text-muted-foreground text-xs">
          Where these customers complete their details and verification with you (https on your own
          domain). A link added for one person below is used for that person instead.
        </p>
        {canLink ? (
          <OnboardingLinkForm
            batchId={b.id}
            itemId={null}
            url={b.onboardingUrl}
            viewAs={viewAs}
            label="Onboarding link for the whole batch"
          />
        ) : (
          <p className="mt-1 break-all">{b.onboardingUrl ?? '—'}</p>
        )}
      </section>
      <section className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
        <Split title="By plan" groups={t.byPlan} />
        <Split title="By months" groups={t.byMonths} suffix=" months" />
      </section>
      <table className="mt-6 w-full text-sm" data-testid="batch-customers">
        <thead className="bg-brand-green text-left text-white">
          <tr>
            <th className="px-2 py-2">Customer</th>
            <th className="px-2 py-2">Plan</th>
            <th className="px-2 py-2 text-right">Financed</th>
            <th className="px-2 py-2 text-right">Monthly</th>
            <th className="px-2 py-2 text-right">Total repayment</th>
            <th className="px-2 py-2 text-right">Your earnings</th>
            <th className="px-2 py-2">Onboarding link</th>
            <th className="px-2 py-2">Decision</th>
          </tr>
        </thead>
        <tbody>
          {b.items.map((i) => (
            <tr key={i.id} className="border-t align-top">
              <td className="px-2 py-2">
                <Link
                  href={`/admin/funder/${b.id}/${i.id}${asQ}`}
                  className="text-brand-blue underline"
                >
                  {i.customer.name}
                </Link>
                <span className="text-muted-foreground block text-xs">
                  {i.customer.reference} · {i.customer.level === 'basic' ? 'Basic' : 'Full'}
                </span>
                {i.consentWithdrawnAt && (
                  <span
                    className="mt-1 block rounded bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-900"
                    data-testid="consent-withdrawn-badge"
                  >
                    Consent withdrawn: stop using and delete these details
                  </span>
                )}
              </td>
              <td className="px-2 py-2">{i.customer.plan.label}</td>
              <td className="px-2 py-2 text-right tabular-nums">
                {formatNaira(i.customer.figures.financed)}
              </td>
              <td className="px-2 py-2 text-right tabular-nums">
                {formatNaira(i.customer.figures.monthly)} × {i.customer.figures.months}
              </td>
              <td className="px-2 py-2 text-right tabular-nums">
                {formatNaira(
                  i.customer.financing?.totalRepayment ?? i.customer.figures.totalRepayment,
                )}
              </td>
              <td className="px-2 py-2 text-right tabular-nums">
                {i.customer.financing ? formatNaira(i.customer.financing.earnings) : '—'}
              </td>
              <td className="px-2 py-2">
                {canLink ? (
                  <OnboardingLinkForm
                    batchId={b.id}
                    itemId={i.id}
                    url={i.onboardingUrl}
                    viewAs={viewAs}
                    label={`Onboarding link for ${i.customer.name}`}
                  />
                ) : (
                  <span className="break-all">{i.onboardingUrl ?? b.onboardingUrl ?? '—'}</span>
                )}
              </td>
              <td className="px-2 py-2">
                <DecisionControl
                  itemId={i.id}
                  batchId={b.id}
                  decision={i.decision}
                  note={i.note}
                  canDecide={canDecide}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  )
}

function Split({
  title,
  groups,
  suffix = '',
}: {
  title: string
  groups: Record<string, { customers: number; financed: number; totalRepayments: number }>
  suffix?: string
}) {
  return (
    <div className="rounded-xl border p-3">
      <h2 className="text-brand-dark font-semibold">{title}</h2>
      <ul className="mt-1 space-y-0.5 tabular-nums">
        {Object.entries(groups).map(([k, g]) => (
          <li key={k}>
            {k}
            {suffix}: {g.customers} · financed {formatNaira(g.financed)} · repayments{' '}
            {formatNaira(g.totalRepayments)}
          </li>
        ))}
      </ul>
    </div>
  )
}
