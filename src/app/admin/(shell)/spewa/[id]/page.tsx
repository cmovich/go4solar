import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { ChequesForm } from '@/components/admin/spewa/ChequesForm'
import { DecisionBar } from '@/components/admin/spewa/DecisionBar'
import { applicationDetail } from '@/lib/approvals/admin'
import { maskId } from '@/lib/applications/rules'
import { quoteBreakdown } from '@/lib/build/breakdown'
import { requireFunderQueueViewer } from '@/lib/auth/roles'
import { applicantName } from '@/lib/funderQueue/names'
import { canDecideFunderQueue, canRecordCheques, repaymentSummary } from '@/lib/funderQueue/rules'
import { queueRowFor } from '@/lib/funderQueue/server'
import { formatNaira, formatPercent } from '@/lib/money'
import { lagosDate } from '@/lib/payments/lock'
import { createAdminClient } from '@/lib/supabase/admin'

export const metadata: Metadata = { title: 'SPEWA file' }
export const dynamic = 'force-dynamic'

const when = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleString('en-GB', {
        timeZone: 'Africa/Lagos',
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : '—'

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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-brand-dark text-lg font-bold">{title}</h2>
      {children}
    </section>
  )
}

const DECISION_LABEL = { pending: 'Waiting', approved: 'Approved', declined: 'Declined' } as const

/**
 * One file in the SPEWA queue: the applicant, the plan, KYC results, documents, the guarantor,
 * the decision and the repayments. No Go4Solar profit or internal audit trail here: the funder
 * approver sees this page and nothing else in admin.
 */
export default async function SpewaFilePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireFunderQueueViewer()
  const { id } = await params
  const row = await queueRowFor(id)
  if (!row) notFound()
  const d = await applicationDetail(id)
  if (!d) notFound()
  const b = d.quote ? quoteBreakdown(d.quote) : null
  const app = d.ctx.app
  const personal = (app.personal ?? {}) as Record<string, string | undefined>
  const business = (app.business ?? {}) as Record<string, unknown>
  const loan = d.ctx.loan
  const { data: schedule } = loan
    ? await createAdminClient()
        .from('repayment_schedule')
        .select('n, due_date, amount, paid_amount')
        .eq('loan_id', loan.id)
        .order('n')
    : { data: [] }
  const repaying = loan && (loan.status === 'active' || loan.status === 'completed')
  const summary = repaying
    ? repaymentSummary(
        (schedule ?? []).map((s) => ({
          dueDate: s.due_date,
          amount: Number(s.amount),
          paidAmount: Number(s.paid_amount),
        })),
        lagosDate(),
      )
    : null
  const decider = row.decided_by
    ? (
        await createAdminClient()
          .from('profiles')
          .select('full_name, email')
          .eq('id', row.decided_by)
          .maybeSingle()
      ).data
    : null
  const decision = row.decision as keyof typeof DECISION_LABEL
  const name = applicantName(app) || 'Unnamed'

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6">
      <div>
        <Link href="/admin/spewa" className="text-brand-blue text-sm underline">
          ← SPEWA approvals
        </Link>
        <h1 className="text-brand-dark mt-2 text-2xl font-bold">{name}</h1>
        <p className="text-muted-foreground text-sm">
          {d.reference} · routed {when(row.routed_at)} · deposit{' '}
          {formatPercent(Number(row.deposit_share))} · decision{' '}
          <strong data-testid="spewa-file-decision">{DECISION_LABEL[decision]}</strong>
          {row.is_test ? ' · test' : ''}
        </p>
      </div>

      {decision === 'pending' ? (
        canDecideFunderQueue(session.role) ? (
          d.ctx.blockers.length ? (
            <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <p className="font-semibold">Not ready to approve yet:</p>
              <ul className="list-disc pl-5">
                {d.ctx.blockers.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
              <div className="mt-2">
                <DecisionBar ids={[id]} names={{ [id]: name }} />
              </div>
            </div>
          ) : (
            <DecisionBar ids={[id]} names={{ [id]: name }} />
          )
        ) : (
          <p className="bg-brand-mist rounded-lg px-3 py-2 text-sm">
            Waiting for SPEWA&rsquo;s decision.
          </p>
        )
      ) : (
        <Rows
          rows={[
            ['Decision', DECISION_LABEL[decision]],
            ['By', decider?.full_name ?? decider?.email ?? '—'],
            ['When', when(row.decided_at)],
            ...(row.decision_reason
              ? ([['Reason', row.decision_reason]] as [string, string][])
              : []),
          ]}
        />
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Section title="Applicant">
          <Rows
            rows={[
              ['Business', String(business.registeredName ?? business.businessName ?? '—')],
              ['RC number', String(business.rcNumber ?? '—')],
              ['Signs as', [personal.firstName, personal.surname].filter(Boolean).join(' ') || '—'],
              ['Phone', personal.phone ?? '—'],
              ['Email', personal.email ?? '—'],
              ['State', personal.state ?? '—'],
            ]}
          />
        </Section>
        <Section title="Plan">
          <Rows
            rows={[
              ['Total amount payable', d.quote ? formatNaira(d.quote.systemPrice) : '—'],
              ['Deposit (paid)', d.quote ? formatNaira(d.quote.deposit) : '—'],
              ['Amount financed', b ? formatNaira(b.financed) : '—'],
              ...(b && b.charge > 0
                ? ([['Payment plan charge', formatNaira(b.charge)]] as [string, string][])
                : []),
              ['Balance to repay monthly', b ? formatNaira(b.balance) : '—'],
              [
                'Monthly × months',
                d.quote ? `${formatNaira(d.quote.monthly)} × ${d.quote.instalments.length}` : '—',
              ],
              ['Plan status', loan ? loan.status.replace('_', ' ') : '—'],
            ]}
          />
        </Section>
      </div>

      <Section title="KYC results">
        <ul className="divide-y rounded-xl border bg-white text-sm" data-testid="spewa-kyc">
          {d.checks.length === 0 && <li className="px-4 py-2">No checks.</li>}
          {d.checks.map((c) => (
            <li key={c.id} className="px-4 py-2">
              <strong>{c.kind.toUpperCase()}</strong> · attempt {c.attempt} ·{' '}
              <span
                className={
                  c.status === 'passed'
                    ? 'text-brand-green font-semibold'
                    : c.status === 'failed'
                      ? 'font-semibold text-red-700'
                      : 'font-semibold text-amber-700'
                }
              >
                {c.status.replace('_', ' ')}
              </span>{' '}
              · {when(c.createdAt)}
              {typeof c.summary.last4 === 'string' && ` · number ${maskId(c.summary.last4)}`}
              {'nameMatch' in c.summary && ` · name match ${String(c.summary.nameMatch)}`}
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Documents (links expire in 10 minutes)">
        <ul className="list-disc pl-5 text-sm" data-testid="spewa-documents">
          {d.documents.length === 0 && <li>No documents.</li>}
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
                doc.kind.replace(/_/g, ' ')
              )}{' '}
              · {when(doc.createdAt)}
            </li>
          ))}
          {d.agreements.map((a) => (
            <li key={`${a.type}-${a.signedAt}`}>
              {a.url ? (
                <a
                  href={a.url}
                  className="text-brand-blue underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  Signed {a.type} agreement
                </a>
              ) : (
                `Signed ${a.type} agreement`
              )}{' '}
              · {a.signer} · {when(a.signedAt)}
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Guarantor">
        {d.guarantee ? (
          <Rows
            rows={[
              ['Name', d.guarantee.name],
              ['Relationship', d.guarantee.relationship ?? '—'],
              ['Status', d.guarantee.status],
              ['NIN', d.guarantee.nin_last4 ? maskId(d.guarantee.nin_last4) : '—'],
              ['Checks', d.guarantorChecks.map((c) => `${c.kind} ${c.status}`).join(' · ') || '—'],
            ]}
          />
        ) : (
          <p className="text-sm">No guarantor.</p>
        )}
      </Section>

      <Section title="Post-dated cheques">
        {canRecordCheques(session.role) ? (
          <ChequesForm
            applicationId={id}
            initial={{
              received: row.cheques_received,
              count: row.cheques_count,
              receivedOn: row.cheques_received_on,
            }}
          />
        ) : (
          <p className="text-sm" data-testid="cheques-view">
            {row.cheques_received === null
              ? 'Not recorded yet.'
              : row.cheques_received
                ? `Received: yes · ${row.cheques_count} cheques · on ${row.cheques_received_on}`
                : 'Received: no'}
          </p>
        )}
      </Section>

      <Section title="Repayments">
        {summary ? (
          <div className="space-y-2" data-testid="spewa-repayments">
            <Rows
              rows={[
                ['Months paid', `${summary.paidMonths} of ${summary.months}`],
                ['Paid', formatNaira(summary.paid)],
                ['Still to pay', formatNaira(summary.outstanding)],
                [
                  'Overdue',
                  summary.overdue > 0
                    ? `${formatNaira(summary.overdue)} (${summary.daysOverdue} days)`
                    : 'Nothing overdue',
                ],
              ]}
            />
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-brand-green text-left text-white">
                  <th className="px-2 py-2">Month</th>
                  <th className="px-2 py-2">Due</th>
                  <th className="px-2 py-2 text-right">Amount</th>
                  <th className="px-2 py-2 text-right">Paid</th>
                </tr>
              </thead>
              <tbody>
                {(schedule ?? []).map((s) => (
                  <tr key={s.n} className="even:bg-brand-mist">
                    <td className="px-2 py-2">{s.n}</td>
                    <td className="px-2 py-2">{s.due_date}</td>
                    <td className="px-2 py-2 text-right">{formatNaira(Number(s.amount))}</td>
                    <td className="px-2 py-2 text-right">{formatNaira(Number(s.paid_amount))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm">
            Repayments start one month after installation
            {loan ? ` (plan ${loan.status.replace('_', ' ')})` : ''}.
          </p>
        )}
      </Section>
    </main>
  )
}
