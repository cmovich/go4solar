'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { Button } from '@/components/ui/button'
import type { QueueRow } from '@/lib/exports/queue'
import { LENDING_TYPE_SHORT, type LendingType } from '@/lib/tradeLenda/figures'

import {
  discardExportQueue,
  exportTheQueue,
  removeFromExportQueue,
} from '@/app/admin/(shell)/exports/actions'

type Funder = { id: string; name: string; prefix: string | null; lendingTypes: LendingType[] }

/**
 * The open export queue: choose the funder (+ lending type when it offers both) and the level,
 * see what each person can go as, remove people, then Export (a frozen, numbered batch).
 */
export function QueuePanel(props: {
  queueId: string
  number: string
  isTest: boolean
  funders: Funder[]
  funderId: string | null
  lendingType: LendingType | null
  mode: 'basic' | 'full-where-possible'
  rows: QueueRow[]
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const funder = props.funders.find((f) => f.id === props.funderId) ?? null
  const go = (patch: Record<string, string>) => {
    const p = new URLSearchParams({
      ...(props.isTest ? { test: '1' } : {}),
      ...(props.funderId ? { funder: props.funderId } : {}),
      ...(props.lendingType ? { type: props.lendingType } : {}),
      mode: props.mode,
      ...patch,
    })
    router.push(`/admin/exports/queue?${p}`)
  }
  const blocked = props.rows.filter((r) => !r.level || r.inBatch)
  const ready = funder && props.lendingType && props.rows.length > 0 && blocked.length === 0

  return (
    <div className="mt-4 space-y-4">
      <div className="flex flex-wrap items-end gap-4 rounded-xl border p-4 text-sm">
        <label className="flex flex-col gap-1">
          <span className="font-medium">Funder</span>
          <select
            className="h-11 rounded-md border bg-white px-2"
            value={props.funderId ?? ''}
            onChange={(e) => {
              const f = props.funders.find((x) => x.id === e.target.value)
              go({ funder: e.target.value, type: f?.lendingTypes[0] ?? '' })
            }}
            aria-label="Funder"
          >
            <option value="">Choose…</option>
            {props.funders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
                {f.prefix ? ` (${f.prefix})` : ' (no batch prefix)'}
              </option>
            ))}
          </select>
        </label>
        {funder && funder.lendingTypes.length > 1 && (
          <label className="flex flex-col gap-1">
            <span className="font-medium">Lending type</span>
            <select
              className="h-11 rounded-md border bg-white px-2"
              value={props.lendingType ?? ''}
              onChange={(e) => go({ type: e.target.value })}
              aria-label="Lending type"
            >
              {funder.lendingTypes.map((t) => (
                <option key={t} value={t}>
                  {LENDING_TYPE_SHORT[t]}
                </option>
              ))}
            </select>
          </label>
        )}
        <fieldset className="flex flex-col gap-1">
          <legend className="font-medium">Level</legend>
          <div className="flex gap-4">
            {(
              [
                ['full-where-possible', 'Full where possible'],
                ['basic', 'Basic for all'],
              ] as const
            ).map(([v, label]) => (
              <label key={v} className="flex min-h-11 items-center gap-2">
                <input
                  type="radio"
                  name="mode"
                  checked={props.mode === v}
                  onChange={() => go({ mode: v })}
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-sm" data-testid="queue-table">
          <thead className="bg-brand-green text-left text-white">
            <tr>
              {['Person', 'Phone', 'Goes as', ''].map((h, k) => (
                <th key={k} className="px-3 py-2 font-semibold">
                  {h || <span className="sr-only">Remove</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {props.rows.map((r) => (
              <tr
                key={r.waitlistId}
                className="border-t align-top"
                data-testid="queue-row"
                data-id={r.waitlistId}
              >
                <td className="px-3 py-2">
                  {r.name}
                  <span className="text-muted-foreground block text-xs">{r.reference}</span>
                </td>
                <td className="px-3 py-2 tabular-nums">{r.phone}</td>
                <td className="px-3 py-2" data-testid="queue-level">
                  {!funder ? (
                    <span className="text-muted-foreground">Choose a funder</span>
                  ) : r.inBatch ? (
                    <span className="text-amber-900">
                      In {r.inBatch}: remove here and use “Send updated version” in Exports
                    </span>
                  ) : r.level ? (
                    <span className="text-brand-green font-semibold">
                      {r.level === 'full' ? 'Full' : 'Basic'}
                    </span>
                  ) : (
                    <span className="text-destructive">Blocked. {r.problems.join(' ')}</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() =>
                      start(async () => {
                        const res = await removeFromExportQueue({
                          queueId: props.queueId,
                          waitlistId: r.waitlistId,
                        })
                        if (!res.ok) setMsg({ ok: false, text: res.error })
                        router.refresh()
                      })
                    }
                  >
                    Remove
                  </Button>
                </td>
              </tr>
            ))}
            {props.rows.length === 0 && (
              <tr>
                <td colSpan={4} className="text-muted-foreground px-3 py-6 text-center">
                  The queue is empty. Add people from Admin → Waiting list.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          disabled={pending || !ready}
          data-testid="export-queue"
          onClick={() =>
            start(async () => {
              setMsg(null)
              const res = await exportTheQueue({
                isTest: props.isTest,
                funderId: props.funderId,
                lendingType: props.lendingType,
                mode: props.mode,
              })
              if (!res.ok) setMsg({ ok: false, text: res.error })
              else {
                setMsg({ ok: true, text: `Exported as ${res.number}.` })
                router.push(`/admin/exports${props.isTest ? '?test=1' : ''}`)
              }
            })
          }
        >
          {pending
            ? 'Exporting…'
            : `Export ${props.rows.length} to ${funder?.name ?? 'the funder'}`}
        </Button>
        {confirmDiscard ? (
          <span
            className="flex flex-wrap items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900"
            role="alert"
          >
            Discard {props.number}? Nothing is exported and no batch number is used.
            <Button
              type="button"
              size="sm"
              variant="destructive"
              disabled={pending}
              data-testid="confirm-discard"
              onClick={() =>
                start(async () => {
                  const res = await discardExportQueue({ queueId: props.queueId })
                  if (!res.ok) setMsg({ ok: false, text: res.error })
                  else router.push(`/admin/exports${props.isTest ? '?test=1' : ''}`)
                })
              }
            >
              Discard queue
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setConfirmDiscard(false)}
            >
              Keep it
            </Button>
          </span>
        ) : (
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => setConfirmDiscard(true)}
            data-testid="discard-queue"
          >
            Discard queue
          </Button>
        )}
        {funder && blocked.length > 0 && (
          <span className="text-sm text-amber-900">
            Remove or complete the blocked people first.
          </span>
        )}
      </div>
      {msg && (
        <p
          className={msg.ok ? 'text-brand-green text-sm' : 'text-destructive text-sm'}
          role="status"
          data-testid="queue-message"
        >
          {msg.text}
        </p>
      )}
    </div>
  )
}
