import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import {
  DecisionPanel,
  ExtensionForm,
  KycReviewButtons,
  ResendLinkButton,
  type FunderChoice,
} from '@/components/admin/applications/DecisionPanel'
import { SizingPanel } from '@/components/admin/SizingPanel'
import { LockBadge } from '@/components/admin/LockBadge'
import { applicationDetail } from '@/lib/approvals/admin'
import { slaState } from '@/lib/approvals/rules'
import { INCOME_RANGES, maskId } from '@/lib/applications/rules'
import { requireRole } from '@/lib/auth/roles'
import { formatNaira, formatPercent } from '@/lib/money'
import { MAX_EXTENSION_DAYS, addDaysIso, lagosDate } from '@/lib/payments/lock'

export const metadata: Metadata = { title: 'Application' }
export const dynamic = 'force-dynamic'

const TABS = [
  ['summary', 'Summary'],
  ['kyc', 'KYC'],
  ['guarantor', 'Guarantor'],
  ['affordability', 'Affordability & energy'],
  ['documents', 'Documents'],
  ['quote', 'Quote'],
  ['payments', 'Payments'],
  ['audit', 'Audit trail'],
] as const
type Tab = (typeof TABS)[number][0]

const when = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleString('en-GB', {
        timeZone: 'Africa/Lagos',
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : '—'
const pct = (n: unknown) => (typeof n === 'number' ? formatPercent(n) : '—')

function Rows({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <dl className="divide-y rounded-xl border bg-white text-sm">
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-4 px-4 py-2">
          <dt className="text-muted-foreground">{k}</dt>
          <dd className="text-right font-semibold">{v}</dd>
        </div>
      ))}
    </dl>
  )
}

/** One application, for staff. */
export default async function ApplicationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tab?: string }>
}) {
  const session = await requireRole('super_admin', 'credit_officer')
  const { id } = await params
  const tab = ((await searchParams).tab ?? 'summary') as Tab
  const d = await applicationDetail(id)
  if (!d) notFound()
  const { ctx } = d
  const app = ctx.app
  const personal = (app.personal ?? {}) as Record<string, string | undefined>
  const flags = (app.credit_flags ?? {}) as Record<string, unknown>
  const aff = (app.affordability ?? null) as Record<string, number | null> | null
  const sla =
    app.status === 'submitted' || app.status === 'under_review' ? slaState(app.submitted_at) : null
  const options: FunderChoice[] = ctx.options.map((o) => ({
    id: o.funder.id,
    name: o.funder.name,
    annualRate: o.funder.annualRate,
    balanceAvailable: o.funder.balanceAvailable,
    drawn: o.profit.drawn,
    funderInterest: o.profit.funderInterest,
    grossProfit: o.profit.grossProfit,
    netProfit: o.profit.netProfit,
    netPerMonth: o.profit.netPerMonth,
    annualReturn: o.profit.annualReturnOnDrawn,
    netShare: o.netShare,
    loss: o.loss,
    belowMinimum: o.belowMinimum,
  }))
  const open = ['submitted', 'under_review'].includes(app.status)

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
      <div>
        <Link href="/admin/applications" className="text-brand-blue text-sm underline">
          ← Applications
        </Link>
        <h1 className="text-brand-dark mt-2 text-2xl font-bold">
          {[personal.firstName, personal.surname].filter(Boolean).join(' ') || 'Application'}
        </h1>
        <p className="text-muted-foreground text-sm">
          {d.reference} · {app.applicant_type === 'business' ? 'Business' : 'Home'} · status{' '}
          <strong data-testid="admin-status">{app.status.replace('_', ' ')}</strong>
          {d.lock && <LockBadge lock={d.lock} />}
          {sla && (
            <span className={`ml-2 font-semibold ${sla.overdue ? 'text-red-700' : ''}`}>
              {sla.overdue ? `Overdue by ${-sla.hoursLeft} h` : `${sla.hoursLeft} h left to decide`}
            </span>
          )}
        </p>
        {d.enteredBy && (
          <div className="mt-2 flex flex-wrap items-center gap-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <span>
              Entered by {d.enteredBy} ({app.entry_channel?.replace('_', ' ') ?? 'staff'}) on{' '}
              {when(app.created_at)}
              {app.status === 'draft' && ' · Awaiting customer'}
            </span>
            {app.status === 'draft' && <ResendLinkButton applicationId={app.id} />}
          </div>
        )}
      </div>

      <nav className="flex flex-wrap gap-1 border-b" aria-label="Sections">
        {TABS.map(([key, label]) => (
          <Link
            key={key}
            href={`?tab=${key}`}
            aria-current={tab === key ? 'page' : undefined}
            className={`rounded-t-md px-3 py-2 text-sm font-semibold ${tab === key ? 'bg-brand-green text-white' : 'text-brand-dark hover:bg-brand-mist'}`}
          >
            {label}
          </Link>
        ))}
      </nav>

      {tab === 'summary' && (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <Rows
              rows={[
                ['Phone', personal.phone ?? '—'],
                ['Email', personal.email ?? '—'],
                ['State', personal.state ?? '—'],
                ['Submitted', when(app.submitted_at)],
                [
                  'Guarantor',
                  d.guarantee ? `${d.guarantee.name}: ${d.guarantee.status}` : 'Not invited',
                ],
                ['Auto-pay', flags.noAutoPay ? 'No auto-pay (pays from dashboard)' : 'Set up'],
              ]}
            />
            <Rows
              rows={[
                ['System price', d.quote ? formatNaira(d.quote.systemPrice) : '—'],
                ['Deposit', d.quote ? formatNaira(d.quote.deposit) : '—'],
                [
                  'Monthly × months',
                  d.quote ? `${formatNaira(d.quote.monthly)} × ${d.quote.instalments.length}` : '—',
                ],
                ['Payment ÷ income', pct(aff?.incomeRatio)],
                ['Payment ÷ energy spend today', pct(aff?.energyRatio)],
                [
                  'KYC',
                  d.checks.map((c) => `${c.kind} ${c.status.replace('_', ' ')}`).join(' · ') || '—',
                ],
              ]}
            />
          </div>
          {Boolean(flags.noAutoPay) && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">
              No auto-pay: the customer will pay each month from the dashboard.
            </p>
          )}
          {app.status === 'more_info' && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm">
              Asked the customer: {app.more_info_request}
            </p>
          )}
          {app.decision_reason && <p className="text-sm">Decision reason: {app.decision_reason}</p>}
          {ctx.loan?.profit_snapshot && (
            <p className="text-sm">
              Approved with {(ctx.loan.profit_snapshot as { funderName?: string }).funderName} ·
              drawn {formatNaira(Number(ctx.loan.drawn ?? 0))} · net profit{' '}
              {formatNaira(
                (ctx.loan.profit_snapshot as { profit: { netProfit: number } }).profit.netProfit,
              )}
              {d.job ? (
                <>
                  {' '}
                  ·{' '}
                  <Link href={`/admin/jobs/${d.job.id}`} className="text-brand-blue underline">
                    job {d.job.status}
                  </Link>
                </>
              ) : (
                ' · no installation job yet'
              )}
            </p>
          )}
          <DecisionPanel
            applicationId={app.id}
            open={open}
            blockers={ctx.blockers}
            options={options}
            role={session.role}
            amount={ctx.figures?.balance ?? 0}
            limit={ctx.limit}
            minNetMarginShare={ctx.minNetMarginShare}
          />
        </div>
      )}

      {tab === 'kyc' && (
        <div className="space-y-3">
          {d.checks.length === 0 && <p className="text-sm">No checks yet.</p>}
          {d.checks.map((c) => (
            <div key={c.id} className="rounded-xl border bg-white p-4 text-sm">
              <p className="font-semibold">
                {c.kind.toUpperCase()} · attempt {c.attempt} ·{' '}
                <span
                  className={
                    c.status === 'passed'
                      ? 'text-brand-green'
                      : c.status === 'failed'
                        ? 'text-red-700'
                        : 'text-amber-700'
                  }
                >
                  {c.status.replace('_', ' ')}
                </span>{' '}
                · {c.provider} · {when(c.createdAt)}
              </p>
              <p className="text-muted-foreground mt-1">
                {typeof c.summary.last4 === 'string' && `Number ${maskId(c.summary.last4)} · `}
                {'nameMatch' in c.summary && `name match ${String(c.summary.nameMatch)} · `}
                {'dobMatch' in c.summary && `date of birth match ${String(c.summary.dobMatch)}`}
                {'livenessPassed' in c.summary && `liveness ${String(c.summary.livenessPassed)}`}
                {c.summary.review ? ` · reviewed: ${JSON.stringify(c.summary.review)}` : ''}
              </p>
              {c.status === 'manual_review' && (
                <KycReviewButtons applicationId={app.id} checkId={c.id} />
              )}
            </div>
          ))}
          <h2 className="text-brand-dark pt-2 font-bold">ID images (links expire in 10 minutes)</h2>
          <ul className="list-disc pl-5 text-sm">
            {d.documents
              .filter((doc) => doc.kind.startsWith('nin') || doc.kind.startsWith('cac'))
              .map((doc) => (
                <li key={`${doc.kind}-${doc.createdAt}`}>
                  {doc.url ? (
                    <a
                      href={doc.url}
                      className="text-brand-blue underline"
                      target="_blank"
                      rel="noreferrer"
                    >
                      {doc.kind.replace('_', ' ')}
                    </a>
                  ) : (
                    doc.kind
                  )}
                </li>
              ))}
          </ul>
        </div>
      )}

      {tab === 'guarantor' &&
        (d.guarantee ? (
          <Rows
            rows={[
              ['Name', d.guarantee.name],
              ['Phone', d.guarantee.phone],
              ['Relationship', d.guarantee.relationship ?? '—'],
              ['Status', d.guarantee.status],
              ['NIN', d.guarantee.nin_last4 ? maskId(d.guarantee.nin_last4) : '—'],
              ['Checks', d.guarantorChecks.map((c) => `${c.kind} ${c.status}`).join(' · ') || '—'],
              [
                'Income range',
                INCOME_RANGES.find(
                  (r) => r.id === (d.guarantee!.details as { incomeRange?: string }).incomeRange,
                )?.label ?? '—',
              ],
              ['Declined because', d.guarantee.decline_reason ?? '—'],
              ['Link expires', when(d.guarantee.expires_at)],
            ]}
          />
        ) : (
          <p className="text-sm">No guarantor invited yet.</p>
        ))}

      {tab === 'affordability' && (
        <Rows
          rows={[
            ['Monthly payment', aff?.monthlyPayment ? formatNaira(aff.monthlyPayment) : '—'],
            [
              'Income range (midpoint)',
              aff?.incomeMidpoint ? formatNaira(aff.incomeMidpoint) : '—',
            ],
            [
              'Payment ÷ income',
              `${pct(aff?.incomeRatio)}${flags.incomeRatioAbove35 ? ' (above 35%)' : ''}`,
            ],
            [
              'Energy spend today (per month)',
              d.energy.monthlySpend ? formatNaira(d.energy.monthlySpend) : '—',
            ],
            ['Payment ÷ energy spend', pct(aff?.energyRatio)],
            ['Generator', d.energy.generator ?? '—'],
            [
              'CO₂ avoided',
              d.energy.co2KgPerYear
                ? `${(d.energy.co2KgPerYear / 1000).toFixed(1)} tonnes a year`
                : '—',
            ],
          ]}
        />
      )}

      {tab === 'documents' && (
        <div className="space-y-4 text-sm">
          <ul className="list-disc pl-5">
            {d.documents.map((doc) => (
              <li key={`${doc.kind}-${doc.createdAt}`}>
                {doc.url ? (
                  <a
                    href={doc.url}
                    className="text-brand-blue underline"
                    target="_blank"
                    rel="noreferrer"
                  >
                    {doc.kind.replace(/_/g, ' ')}
                  </a>
                ) : (
                  doc.kind
                )}{' '}
                · {when(doc.createdAt)}
              </li>
            ))}
          </ul>
          <h2 className="text-brand-dark font-bold">Signed agreements</h2>
          <ul className="list-disc pl-5">
            {d.agreements.map((a) => (
              <li key={`${a.type}-${a.signedAt}`}>
                {a.url ? (
                  <a
                    href={a.url}
                    className="text-brand-blue underline"
                    target="_blank"
                    rel="noreferrer"
                  >
                    {a.type} agreement
                  </a>
                ) : (
                  `${a.type} agreement`
                )}{' '}
                · {a.signer} · {when(a.signedAt)} · PDF SHA-256{' '}
                <code className="text-xs">{a.pdfSha256?.slice(0, 16)}…</code>
              </li>
            ))}
          </ul>
        </div>
      )}

      {tab === 'quote' && d.quote && (
        <div className="space-y-3 text-sm">
          {d.ownSystem && (
            <p className="text-brand-dark font-semibold" data-testid="own-system">
              Their own system (built in the system builder)
            </p>
          )}
          {d.size && d.plan && <SizingPanel size={d.size} plan={d.plan} />}
          <table className="w-full">
            <thead>
              <tr className="bg-brand-green text-left text-white">
                <th className="px-2 py-2">Item</th>
                <th className="px-2 py-2 text-right">Qty</th>
                <th className="px-2 py-2 text-right">Unit cost</th>
                <th className="px-2 py-2 text-right">Line price</th>
              </tr>
            </thead>
            <tbody>
              {d.quote.lines.map((l) => (
                <tr key={l.sku} className="even:bg-brand-mist">
                  <td className="px-2 py-2">{l.name}</td>
                  <td className="px-2 py-2 text-right">{l.qty}</td>
                  <td className="px-2 py-2 text-right">{formatNaira(l.unitCost)}</td>
                  <td className="px-2 py-2 text-right">{formatNaira(l.lineTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Rows
            rows={[
              ['Installation (no markup)', formatNaira(d.quote.installCost)],
              ['Cost price', formatNaira(d.quote.costPrice)],
              ['Markup on equipment', formatPercent(d.quote.markupShare, 1)],
              ['System price', formatNaira(d.quote.systemPrice)],
              [
                'Deposit',
                `${formatNaira(d.quote.deposit)} (${formatPercent(d.quote.snapshot.depositShare)})`,
              ],
              ['Balance', formatNaira(d.quote.balance)],
              ['Tenure', `${d.quote.instalments.length} months`],
            ]}
          />
        </div>
      )}

      {tab === 'payments' && d.lock && ctx.loan && (
        <section className="rounded-xl border bg-white p-4 text-sm" data-testid="lock-panel">
          <h2 className="text-brand-dark font-semibold">Remote lock</h2>
          <p className="mt-1">
            Rule: lock when a payment is {d.lock.lockAfterDays} days overdue.{' '}
            {d.lock.daysOverdue > 0
              ? `Oldest unpaid payment: ${d.lock.daysOverdue} days overdue.`
              : 'No payment is overdue.'}
            {d.lock.lockDate && ` Lock due from ${d.lock.lockDate}.`}
            <LockBadge lock={d.lock} />
          </p>
          <p className="text-muted-foreground mt-1 text-xs">
            Phase 1 shows the rule only; the remote lock itself arrives in Phase 2.
          </p>
          {d.lock.extensionUntil ? (
            <p className="mt-2">
              Extension approved until <strong>{d.lock.extensionUntil}</strong> (one per plan).
            </p>
          ) : ctx.loan.status === 'active' ? (
            <ExtensionForm
              applicationId={app.id}
              loanId={ctx.loan.id}
              minDate={addDaysIso(lagosDate(), 1)}
              maxDate={addDaysIso(lagosDate(), MAX_EXTENSION_DAYS)}
            />
          ) : null}
        </section>
      )}

      {tab === 'payments' && (
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-brand-green text-left text-white">
              <th className="px-2 py-2">When</th>
              <th className="px-2 py-2">Kind</th>
              <th className="px-2 py-2">Reference</th>
              <th className="px-2 py-2 text-right">Amount</th>
              <th className="px-2 py-2 text-right">Fee</th>
              <th className="px-2 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {d.payments.map((p) => (
              <tr key={p.id} className="even:bg-brand-mist">
                <td className="px-2 py-2">{when(p.paid_at ?? p.created_at)}</td>
                <td className="px-2 py-2">{p.kind}</td>
                <td className="px-2 py-2 font-mono text-xs">{p.reference}</td>
                <td className="px-2 py-2 text-right">{formatNaira(Number(p.amount))}</td>
                <td className="px-2 py-2 text-right">{formatNaira(Number(p.fee))}</td>
                <td className="px-2 py-2">{p.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {tab === 'audit' && (
        <ul className="divide-y rounded-xl border bg-white text-sm">
          {d.audit.map((a, i) => (
            <li key={i} className="px-4 py-2">
              <span className="font-semibold">{a.action}</span> · {a.actor} · {when(a.at)}
              {a.detail && (
                <span className="text-muted-foreground block text-xs break-all">{a.detail}</span>
              )}
            </li>
          ))}
          {d.audit.length === 0 && <li className="px-4 py-2">No staff actions yet.</li>}
        </ul>
      )}
    </main>
  )
}
