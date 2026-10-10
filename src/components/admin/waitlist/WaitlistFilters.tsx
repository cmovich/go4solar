'use client'

import { useRouter } from 'next/navigation'

import { STATE_GROUPS, stateLabel } from '@/lib/nigeria/states'
import { PLANS, PLAN_LABELS } from '@/lib/quotes/buildEstimate'
import type { ConsumerFilters } from '@/lib/waitlist/admin'
import {
  APPLICANT_TYPES,
  APPLICANT_TYPE_LABELS,
  DEPOSIT_BANDS,
  READY_WHEN,
  READY_WHEN_LABELS,
} from '@/lib/waitlist/schema'

const select = 'border-input h-10 rounded-md border bg-white px-2 text-sm'

/** Filters live in the URL so a filtered view can be shared and the CSV matches it. */
export function WaitlistFilters({
  tab,
  filters,
}: {
  tab: 'complete' | 'incomplete'
  filters: ConsumerFilters
}) {
  const router = useRouter()

  function update(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const params = new URLSearchParams({ tab })
    for (const key of ['type', 'state', 'band', 'plan', 'ready', 'from', 'to']) {
      const v = String(f.get(key) ?? '')
      if (v) params.set(key, v)
    }
    router.push(`/admin/waitlist?${params.toString()}`)
  }

  return (
    <form
      onSubmit={update}
      onChange={(e) => e.currentTarget.requestSubmit()}
      className="mt-4 flex flex-wrap items-end gap-2"
      aria-label="Filters"
    >
      <label className="text-xs">
        Type
        <select name="type" defaultValue={filters.type ?? ''} className={`${select} mt-1 block`}>
          <option value="">All</option>
          {APPLICANT_TYPES.map((t) => (
            <option key={t} value={t}>
              {APPLICANT_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs">
        State
        <select name="state" defaultValue={filters.state ?? ''} className={`${select} mt-1 block`}>
          <option value="">All</option>
          {STATE_GROUPS.map((g) => (
            <optgroup key={g.label} label={g.label}>
              {g.ids.map((s) => (
                <option key={s} value={s}>
                  {stateLabel(s)}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      <label className="text-xs">
        Deposit band
        <select name="band" defaultValue={filters.band ?? ''} className={`${select} mt-1 block`}>
          <option value="">All</option>
          {DEPOSIT_BANDS.map((b) => (
            <option key={b.id} value={b.id}>
              {b.label}
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs">
        Plan
        <select name="plan" defaultValue={filters.plan ?? ''} className={`${select} mt-1 block`}>
          <option value="">All</option>
          {PLANS.map((p) => (
            <option key={p} value={p}>
              {PLAN_LABELS[p]}
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs">
        Readiness
        <select name="ready" defaultValue={filters.ready ?? ''} className={`${select} mt-1 block`}>
          <option value="">All</option>
          {READY_WHEN.map((r) => (
            <option key={r} value={r}>
              {READY_WHEN_LABELS[r]}
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs">
        From
        <input
          type="date"
          name="from"
          defaultValue={filters.from ?? ''}
          className={`${select} mt-1 block`}
        />
      </label>
      <label className="text-xs">
        To
        <input
          type="date"
          name="to"
          defaultValue={filters.to ?? ''}
          className={`${select} mt-1 block`}
        />
      </label>
      <a href={`/admin/waitlist?tab=${tab}`} className="text-brand-blue mb-2 text-sm underline">
        Reset
      </a>
    </form>
  )
}
