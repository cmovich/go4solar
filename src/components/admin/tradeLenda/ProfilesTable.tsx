'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatNaira } from '@/lib/money'
import { LENDING_TYPE_LABELS, type LendingType } from '@/lib/tradeLenda/figures'
import {
  FILTER_LABELS,
  LIST_FILTERS,
  STATUS_LABELS,
  filterCounts,
  listRows,
  type ListFilter,
  type ListSort,
} from '@/lib/tradeLenda/list'
import type { ProfileListRow } from '@/lib/tradeLenda/server'

import { sendToTradeLenda } from '@/app/admin/(shell)/waitlist/profiles/actions'

const DECISIONS: Record<string, string> = {
  approved: 'Approved',
  declined: 'Declined',
  needs_info: 'Needs info',
}

/**
 * Every waiting-list person, complete or not: filters (with counts), search and sort. Super admin
 * ticks "Ready to send" entries and sends them to Trade Lenda.
 */
export function ProfilesTable({
  rows,
  canSend,
  lendingTypes,
  defaultLendingType,
  balanceAvailable,
}: {
  rows: ProfileListRow[]
  canSend: boolean
  lendingTypes: LendingType[]
  defaultLendingType: LendingType
  /** Trade Lenda's available balance (Admin → Funders). */
  balanceAvailable: number
}) {
  const router = useRouter()
  const [type, setType] = useState<LendingType>(defaultLendingType)
  const [filter, setFilter] = useState<ListFilter>('all')
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<ListSort>('newest')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)
  const [pending, start] = useTransition()
  const counts = useMemo(() => filterCounts(rows), [rows])
  const shown = useMemo(() => listRows(rows, { filter, q, sort }), [rows, filter, q, sort])
  // Can go in a batch (unchanged rule): complete, the three ticks, figures agreed for this type.
  const ready = (r: ProfileListRow) =>
    r.missing.length === 0 && r.verified && r.consent && r.agreedType === type
  const pickedFinanced = rows
    .filter((r) => picked.has(r.id))
    .reduce((t, r) => t + (r.agreedFinanced ?? 0), 0)
  const overBalance = pickedFinanced > balanceAvailable

  function send() {
    start(async () => {
      setNotice(null)
      const r = await sendToTradeLenda({ ids: [...picked], lendingType: type })
      if (r.ok) {
        setNotice({ ok: true, text: `Sent as ${r.number} (${LENDING_TYPE_LABELS[type]}).` })
        setPicked(new Set())
        router.refresh()
      } else setNotice({ ok: false, text: r.error })
    })
  }

  return (
    <div className="mt-6 space-y-3">
      <div
        className="flex flex-wrap gap-2"
        role="group"
        aria-label="Show"
        data-testid="list-filters"
      >
        {LIST_FILTERS.map((f) => (
          <Button
            key={f}
            type="button"
            size="sm"
            variant={filter === f ? 'default' : 'outline'}
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
            data-testid={`filter-${f}`}
          >
            {FILTER_LABELS[f]} ({counts[f]})
          </Button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, phone or email"
          aria-label="Search name, phone or email"
          className="h-10 w-72 bg-white"
        />
        <label className="flex items-center gap-2">
          Sort
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as ListSort)}
            className="border-input h-10 rounded-md border bg-white px-2"
            aria-label="Sort"
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="complete">Most complete first</option>
          </select>
        </label>
      </div>

      {canSend && lendingTypes.length > 0 && (
        <div className="bg-brand-mist flex flex-wrap items-center gap-3 rounded-xl p-3 text-sm">
          <label className="flex items-center gap-2">
            Trade Lenda lends to:
            <select
              value={type}
              onChange={(e) => {
                setType(e.target.value as LendingType)
                setPicked(new Set())
              }}
              className="border-input h-9 rounded-md border bg-white px-2"
              aria-label="Trade Lenda lends to"
            >
              {lendingTypes.map((t) => (
                <option key={t} value={t}>
                  {t === 'customer' ? 'the customers' : 'Go4Solar'}
                </option>
              ))}
            </select>
          </label>
          <Button
            type="button"
            size="sm"
            disabled={pending || picked.size === 0}
            onClick={send}
            data-testid="send-to-tl"
          >
            {pending ? 'Sending…' : `Send to Trade Lenda (${picked.size})`}
          </Button>
          <span data-testid="tl-balance">
            Trade Lenda available balance: <strong>{formatNaira(balanceAvailable)}</strong>
            {picked.size > 0 && (
              <>
                {' '}
                · selected to finance: <strong>{formatNaira(pickedFinanced)}</strong>
              </>
            )}
          </span>
        </div>
      )}
      {canSend && overBalance && (
        <p
          className="rounded-md bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900"
          role="alert"
          data-testid="tl-balance-warning"
        >
          This batch ({formatNaira(pickedFinanced)}) is more than Trade Lenda&rsquo;s available
          balance ({formatNaira(balanceAvailable)}). Check with Trade Lenda or send fewer customers.
        </p>
      )}
      {notice && (
        <p
          role={notice.ok ? 'status' : 'alert'}
          className={`text-sm ${notice.ok ? 'text-brand-green' : 'text-destructive'}`}
          data-testid="send-notice"
        >
          {notice.text}
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[980px] text-sm" data-testid="profiles-table">
          <thead className="bg-brand-green text-left text-white">
            <tr>
              {canSend && <th className="px-2 py-2">Send</th>}
              <th className="px-2 py-2">Name</th>
              <th className="px-2 py-2">Phone</th>
              <th className="px-2 py-2">State</th>
              <th className="px-2 py-2">Plan / quote</th>
              <th className="px-2 py-2">Profile</th>
              <th className="px-2 py-2">Details confirmed</th>
              <th className="px-2 py-2">Consent</th>
              <th className="px-2 py-2">Figures agreed</th>
              <th className="px-2 py-2">Batch</th>
              <th className="px-2 py-2">Trade Lenda</th>
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && (
              <tr>
                <td colSpan={12} className="text-muted-foreground px-2 py-4">
                  Nobody matches.
                </td>
              </tr>
            )}
            {shown.map((r) => (
              <tr key={r.id} className="border-t align-top" data-testid={`profile-row-${r.id}`}>
                {canSend && r.batches.length > 0 && (
                  <td className="px-2 py-2 text-xs" data-testid={`sent-in-${r.id}`}>
                    Sent in {r.batches.join(', ')}
                  </td>
                )}
                {canSend && r.batches.length === 0 && (
                  <td className="px-2 py-2">
                    <input
                      type="checkbox"
                      aria-label={`Send ${r.name}`}
                      disabled={!ready(r)}
                      checked={picked.has(r.id)}
                      onChange={(e) => {
                        const next = new Set(picked)
                        if (e.target.checked) next.add(r.id)
                        else next.delete(r.id)
                        setPicked(next)
                      }}
                    />
                  </td>
                )}
                <td className="px-2 py-2">
                  <span className="font-medium">{r.name}</span>
                  {r.isTest && <span className="text-muted-foreground"> (test)</span>}
                  <span className="text-muted-foreground block text-xs">
                    {r.reference}
                    {r.signUpComplete ? '' : ' · stopped part-way through sign-up'}
                  </span>
                </td>
                <td className="px-2 py-2 whitespace-nowrap">
                  <a href={`tel:${r.phone}`} className="text-brand-blue underline">
                    {r.phone}
                  </a>
                </td>
                <td className="px-2 py-2">{r.state ?? '—'}</td>
                <td className="px-2 py-2">{r.plan ?? '—'}</td>
                <td
                  className="px-2 py-2 whitespace-nowrap"
                  title={r.missing.length ? `Missing: ${r.missing.join(', ')}` : 'Complete'}
                  data-testid={`profile-status-${r.id}`}
                >
                  {STATUS_LABELS[r.status]} · {r.done} of {r.total}
                </td>
                <td className="px-2 py-2">{r.verified ? '✓' : '—'}</td>
                <td className="px-2 py-2">{r.consent ? '✓' : '—'}</td>
                <td className="px-2 py-2">
                  {r.agreedType
                    ? r.agreedType === 'customer'
                      ? 'Lends to customers'
                      : 'Lends to Go4Solar'
                    : '—'}
                </td>
                <td className="px-2 py-2 text-xs">{r.batches.join(', ') || '—'}</td>
                <td className="px-2 py-2">
                  {r.decision ? (DECISIONS[r.decision] ?? r.decision) : '—'}
                </td>
                <td className="px-2 py-2">
                  <Link
                    href={`/admin/waitlist/${r.id}/edit`}
                    className="text-brand-blue whitespace-nowrap underline"
                  >
                    Edit / Complete profile
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
