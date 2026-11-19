'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'

import { Button } from '@/components/ui/button'
import { formatNaira } from '@/lib/money'
import { LENDING_TYPE_LABELS, type LendingType } from '@/lib/tradeLenda/figures'
import type { ProfileListRow } from '@/lib/tradeLenda/server'

import { sendToTradeLenda } from '@/app/admin/(shell)/waitlist/profiles/actions'

/** The profiles list; super admin ticks ready entries and sends them to Trade Lenda. */
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
  const [onlyReady, setOnlyReady] = useState(false)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)
  const [pending, start] = useTransition()
  const ready = (r: ProfileListRow) =>
    r.missing.length === 0 && r.verified && r.consent && r.agreedType === type
  const shown = useMemo(() => (onlyReady ? rows.filter(ready) : rows), [rows, onlyReady, type]) // eslint-disable-line react-hooks/exhaustive-deps

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
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={onlyReady}
            onChange={(e) => setOnlyReady(e.target.checked)}
          />
          Ready to send only
        </label>
        {canSend && lendingTypes.length > 0 && (
          <>
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
          </>
        )}
      </div>
      {canSend && (
        <p className="text-sm" data-testid="tl-balance">
          Trade Lenda available balance: <strong>{formatNaira(balanceAvailable)}</strong>
          {picked.size > 0 && (
            <>
              {' '}
              · selected to finance: <strong>{formatNaira(pickedFinanced)}</strong>
            </>
          )}
        </p>
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
        <table className="w-full min-w-[860px] text-sm" data-testid="profiles-table">
          <thead className="bg-brand-green text-left text-white">
            <tr>
              {canSend && <th className="px-2 py-2">Send</th>}
              <th className="px-2 py-2">Customer</th>
              <th className="px-2 py-2">Profile</th>
              <th className="px-2 py-2">Verified</th>
              <th className="px-2 py-2">Consent</th>
              <th className="px-2 py-2">Figures agreed</th>
              <th className="px-2 py-2">Batches</th>
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id} className="border-t align-top" data-testid={`profile-row-${r.id}`}>
                {canSend && (
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
                    {r.reference} · {r.phone} · {r.state ?? '—'}
                  </span>
                </td>
                <td
                  className="px-2 py-2"
                  title={r.missing.length ? `Missing: ${r.missing.join(', ')}` : 'Complete'}
                >
                  {r.done}/{r.total}
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
                  <Link
                    href={`/admin/waitlist/${r.id}/profile`}
                    className="text-brand-blue underline"
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
