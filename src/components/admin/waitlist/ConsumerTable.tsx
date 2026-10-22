'use client'

import { useState } from 'react'

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { GENERATOR_LABELS } from '@/lib/energy/currentSpend'
import { CATEGORY_LABELS } from '@/lib/load/categories'
import { formatNaira, formatPercent } from '@/lib/money'
import { PLAN_LABELS } from '@/lib/quotes/buildEstimate'
import type { ConsumerLead } from '@/lib/waitlist/admin'
import type { DuplicateMatch } from '@/lib/waitlist/duplicates'
import {
  APPLICANT_TYPE_LABELS,
  BUSINESS_TYPE_LABELS,
  ENTRY_CHANNEL_LABELS,
  READY_WHEN_LABELS,
  STATE_LABELS,
} from '@/lib/waitlist/schema'

import { DeleteEntryButton } from './DeleteEntryButton'
import { DuplicateBadge } from './DuplicateBadge'

const date = (iso: string) =>
  new Date(iso).toLocaleString('en-NG', {
    timeZone: 'Africa/Lagos',
    dateStyle: 'medium',
    timeStyle: 'short',
  })

function stateLabelOf(s: string | null) {
  return s ? (STATE_LABELS[s] ?? s) : '—'
}

export function ConsumerTable({
  rows,
  duplicates,
  canDelete,
}: {
  rows: ConsumerLead[]
  duplicates: Record<string, DuplicateMatch>
  canDelete: boolean
}) {
  const [open, setOpen] = useState<ConsumerLead | null>(null)

  if (rows.length === 0) {
    return <p className="text-muted-foreground mt-6 text-sm">No sign-ups match these filters.</p>
  }

  return (
    <>
      <div className="mt-4 overflow-x-auto rounded-xl border">
        <table className="w-full text-sm" data-testid="consumer-table">
          <thead className="bg-brand-green text-left text-white">
            <tr>
              {[
                'When',
                'Name',
                'Type',
                'Phone',
                'State',
                'Plan',
                'Power today',
                'Deposit',
                'Monthly',
                'Total',
                'Ready',
                'Entered by',
                ...(canDelete ? [''] : []),
              ].map((h, k) => (
                <th key={k} className="px-3 py-2 font-semibold whitespace-nowrap">
                  {h || <span className="sr-only">Delete</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr
                key={r.id}
                onClick={() => setOpen(r)}
                className={`cursor-pointer hover:bg-amber-50 ${i % 2 ? 'bg-brand-mist/60' : 'bg-white'}`}
                data-testid="consumer-row"
              >
                <td className="px-3 py-2 whitespace-nowrap">{date(r.createdAt)}</td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {r.firstName ? (
                    `${r.firstName} ${r.surname ?? ''}`
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                  <DuplicateBadge match={duplicates[r.id]} />
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {r.applicantType ? (
                    <>
                      {APPLICANT_TYPE_LABELS[r.applicantType]}
                      {r.business && (
                        <span className="text-muted-foreground block text-xs">
                          {r.business.businessName}
                        </span>
                      )}
                    </>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="px-3 py-2 whitespace-nowrap tabular-nums">{r.phone}</td>
                <td className="px-3 py-2 whitespace-nowrap">{stateLabelOf(r.state)}</td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {r.plan ? PLAN_LABELS[r.plan] : '—'}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {r.generator ? GENERATOR_LABELS[r.generator] : '—'}
                  {r.monthlySpend !== null && (
                    <span className="text-muted-foreground block text-xs tabular-nums">
                      {formatNaira(r.monthlySpend)} / month
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 whitespace-nowrap tabular-nums">
                  {r.depositShare !== null
                    ? `${formatPercent(r.depositShare)} · ${formatNaira(r.deposit ?? 0)}`
                    : '—'}
                </td>
                <td className="px-3 py-2 whitespace-nowrap tabular-nums">
                  {r.monthly !== null ? formatNaira(r.monthly) : '—'}
                </td>
                <td className="px-3 py-2 whitespace-nowrap tabular-nums">
                  {r.systemPrice !== null ? formatNaira(r.systemPrice) : '—'}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {r.readyWhen ? READY_WHEN_LABELS[r.readyWhen] : '—'}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {r.enteredByName ?? <span className="text-muted-foreground">Self</span>}
                </td>
                {canDelete && (
                  <td className="px-1 py-0.5">
                    <DeleteEntryButton
                      table="consumers"
                      id={r.id}
                      label={r.firstName ? `${r.firstName} ${r.surname ?? ''}`.trim() : r.phone}
                    />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Sheet open={open !== null} onOpenChange={(o) => !o && setOpen(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          {open && (
            <>
              <SheetHeader>
                <SheetTitle className="text-brand-dark">
                  {open.firstName ? `${open.firstName} ${open.surname ?? ''}` : open.phone}
                </SheetTitle>
                <SheetDescription>
                  {open.status === 'complete' ? 'Complete sign-up' : 'Incomplete lead'} ·{' '}
                  {date(open.createdAt)}
                </SheetDescription>
              </SheetHeader>

              <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 px-4 text-sm">
                <Row k="Phone" v={open.phone} />
                <Row k="WhatsApp" v={open.whatsapp ?? '—'} />
                <Row k="Email" v={open.email ?? '—'} />
                <Row
                  k="State / LGA"
                  v={`${stateLabelOf(open.state)}${open.lga ? ` · ${open.lga}` : ''}`}
                />
                <Row k="Consent" v={open.consentAt ? date(open.consentAt) : 'Not given'} />
                <Row
                  k="Solar for"
                  v={open.applicantType ? APPLICANT_TYPE_LABELS[open.applicantType] : '—'}
                />
                <Row k="Plan" v={open.plan ? PLAN_LABELS[open.plan] : '—'} />
                <Row
                  k="Deposit"
                  v={
                    open.depositShare !== null
                      ? `${formatPercent(open.depositShare)} · ${formatNaira(open.deposit ?? 0)}`
                      : '—'
                  }
                />
                <Row k="Monthly" v={open.monthly !== null ? formatNaira(open.monthly) : '—'} />
                <Row
                  k="Total"
                  v={open.systemPrice !== null ? formatNaira(open.systemPrice) : '—'}
                />
                <Row k="Ready" v={open.readyWhen ? READY_WHEN_LABELS[open.readyWhen] : '—'} />
                <Row
                  k="Entered by"
                  v={
                    open.enteredByName
                      ? `${open.enteredByName}${
                          open.entryChannel
                            ? ` · ${(ENTRY_CHANNEL_LABELS as Record<string, string>)[open.entryChannel] ?? open.entryChannel}`
                            : ''
                        }`
                      : 'Customer (self)'
                  }
                />
                <Row k="Generator" v={open.generator ? GENERATOR_LABELS[open.generator] : '—'} />
                <Row
                  k="Energy spend today"
                  v={
                    open.monthlySpend !== null
                      ? `${formatNaira(open.monthlySpend)} / month`
                      : 'Not known'
                  }
                />
                <Row
                  k="CO₂ avoided"
                  v={
                    open.co2AvoidedKg !== null
                      ? `${(open.co2AvoidedKg / 1000).toLocaleString('en-US', { maximumFractionDigits: 1 })} t / year`
                      : '—'
                  }
                />
                {open.duplicateOf && <Row k="Duplicate of" v={open.duplicateOf} />}
                {open.sample && <Row k="Prices" v="SAMPLE" />}
              </dl>

              {open.business && (
                <div className="mt-6 px-4">
                  <p className="text-brand-dark text-sm font-semibold">Business</p>
                  <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    <Row k="Name" v={open.business.businessName} />
                    <Row k="Type" v={BUSINESS_TYPE_LABELS[open.business.businessType]} />
                    <Row k="CAC number" v={open.business.cacNumber || '—'} />
                    <Row k="Contact role" v={open.business.contactRole} />
                    <Row k="Staff" v={String(open.business.staffCount)} />
                    <Row
                      k="Hours"
                      v={`${open.business.hoursPerDay} h/day · ${open.business.daysPerWeek} days/week`}
                    />
                  </dl>
                </div>
              )}

              <div className="mt-6 px-4">
                <p className="text-brand-dark text-sm font-semibold">
                  Load list · {open.loadTotals.runningW ?? 0} W running ·{' '}
                  {open.loadTotals.surgeW ?? 0} W surge · {open.loadTotals.dailyKwh ?? 0} kWh/day
                </p>
                <table className="mt-2 w-full text-sm">
                  <thead className="text-muted-foreground text-left text-xs">
                    <tr>
                      <th className="py-1">Appliance</th>
                      <th className="py-1 text-right">W</th>
                      <th className="py-1 text-right">Qty</th>
                      <th className="py-1 text-right">h/day</th>
                    </tr>
                  </thead>
                  <tbody>
                    {open.loadItems.map((i) => (
                      <tr key={i.id} className="border-t">
                        <td className="py-1">
                          {i.name}
                          <span className="text-muted-foreground block text-xs">
                            {CATEGORY_LABELS[i.category]}
                          </span>
                        </td>
                        <td className="py-1 text-right tabular-nums">{i.watts}</td>
                        <td className="py-1 text-right tabular-nums">{i.qty}</td>
                        <td className="py-1 text-right tabular-nums">{i.hoursPerDay}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <>
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="text-brand-dark font-medium break-words">{v}</dd>
    </>
  )
}
