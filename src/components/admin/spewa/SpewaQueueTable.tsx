'use client'

import Link from 'next/link'
import { useState } from 'react'

import { Checkbox } from '@/components/ui/checkbox'
import type { FunderQueueItem } from '@/lib/funderQueue/server'
import { formatNaira, formatPercent } from '@/lib/money'

import { DecisionBar } from './DecisionBar'

const DECISION_LABEL = { pending: 'Waiting', approved: 'Approved', declined: 'Declined' } as const

const when = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString('en-GB', {
        timeZone: 'Africa/Lagos',
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : '—'

function Repayment({ r }: { r: FunderQueueItem }) {
  if (!r.repayment) return <>{r.loanStatus ? r.loanStatus.replace('_', ' ') : '—'}</>
  const p = r.repayment
  return (
    <span className={p.overdue > 0 ? 'font-semibold text-red-700' : ''}>
      {p.paidMonths}/{p.months} months paid
      {p.overdue > 0
        ? ` · ${formatNaira(p.overdue)} overdue (${p.daysOverdue} days)`
        : ' · up to date'}
    </span>
  )
}

/** The SPEWA queue. Approvers tick files (waiting ones) to approve or decline in bulk. */
export function SpewaQueueTable({
  rows,
  canDecide,
}: {
  rows: FunderQueueItem[]
  canDecide: boolean
}) {
  const [picked, setPicked] = useState<string[]>([])
  const waiting = rows.filter((r) => r.decision === 'pending').map((r) => r.id)
  const all = waiting.length > 0 && waiting.every((id) => picked.includes(id))
  const names = Object.fromEntries(rows.map((r) => [r.id, r.name || 'Unnamed']))
  const toggle = (id: string, on: boolean) =>
    setPicked((p) => (on ? [...new Set([...p, id])] : p.filter((x) => x !== id)))

  return (
    <div className="space-y-3">
      {canDecide && waiting.length > 0 && (
        <DecisionBar ids={picked} names={names} onDone={() => setPicked([])} />
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[920px] text-sm" data-testid="spewa-queue">
          <thead>
            <tr className="bg-brand-green text-left text-white">
              {canDecide && (
                <th className="w-10 px-3 py-2">
                  <Checkbox
                    checked={all}
                    disabled={!waiting.length}
                    onCheckedChange={(v) => setPicked(v === true ? waiting : [])}
                    aria-label="Tick every waiting file"
                    className="border-white"
                  />
                </th>
              )}
              <th className="px-3 py-2">Business</th>
              <th className="px-3 py-2 text-right">Total payable</th>
              <th className="px-3 py-2 text-right">Amount financed</th>
              <th className="px-3 py-2 text-right">Deposit</th>
              <th className="px-3 py-2">Routed</th>
              <th className="px-3 py-2">Decision</th>
              <th className="px-3 py-2">Cheques</th>
              <th className="px-3 py-2">Repayments</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="even:bg-brand-mist" data-testid={`spewa-row-${r.id}`}>
                {canDecide && (
                  <td className="px-3 py-2">
                    {r.decision === 'pending' && (
                      <Checkbox
                        checked={picked.includes(r.id)}
                        onCheckedChange={(v) => toggle(r.id, v === true)}
                        aria-label={`Tick ${r.name || 'file'}`}
                      />
                    )}
                  </td>
                )}
                <td className="px-3 py-2">
                  <Link
                    href={`/admin/spewa/${r.id}`}
                    className="text-brand-blue font-semibold underline"
                  >
                    {r.name || 'Unnamed'}
                  </Link>
                  <span className="text-muted-foreground block text-xs">
                    {r.reference} · {r.state ?? '—'}
                    {r.isTest ? ' · test' : ''}
                  </span>
                </td>
                <td className="px-3 py-2 text-right">
                  {r.totalPayable ? formatNaira(r.totalPayable) : '—'}
                </td>
                <td className="px-3 py-2 text-right" data-testid="spewa-financed">
                  {r.financed ? formatNaira(r.financed) : '—'}
                </td>
                <td className="px-3 py-2 text-right">{formatPercent(r.depositShare)}</td>
                <td className="px-3 py-2">{when(r.routedAt)}</td>
                <td className="px-3 py-2" data-testid="spewa-decision-cell">
                  <span className="font-semibold">{DECISION_LABEL[r.decision]}</span>
                  {r.decidedAt && (
                    <span className="text-muted-foreground block text-xs">
                      {r.decidedBy} · {when(r.decidedAt)}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {r.cheques.received === null
                    ? '—'
                    : r.cheques.received
                      ? `Yes · ${r.cheques.count} · ${r.cheques.receivedOn}`
                      : 'No'}
                </td>
                <td className="px-3 py-2">
                  <Repayment r={r} />
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="text-muted-foreground px-3 py-6 text-center">
                  No files here.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
