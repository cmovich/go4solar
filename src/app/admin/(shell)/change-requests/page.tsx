import type { Metadata } from 'next'

import { ChangeRequestRow } from '@/components/admin/ChangeRequestRow'
import { CHANGE_FIELD_LABELS, type ChangeField } from '@/lib/account/account'
import { requireRole } from '@/lib/auth/roles'
import { createAdminClient } from '@/lib/supabase/admin'

export const metadata: Metadata = { title: 'Change requests' }
export const dynamic = 'force-dynamic'

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', {
    timeZone: 'Africa/Lagos',
    dateStyle: 'medium',
    timeStyle: 'short',
  })

/** Customers' requests to change verified details: approve (applied) or reject. */
export default async function ChangeRequestsPage() {
  await requireRole('super_admin', 'operations')
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('change_requests')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200)
  const rows = error ? [] : (data ?? [])
  const ids = [...new Set(rows.map((r) => r.consumer_id))]
  const { data: people } = ids.length
    ? await admin.from('profiles').select('id, full_name, email').in('id', ids)
    : { data: [] }
  const nameOf = new Map((people ?? []).map((p) => [p.id, p.full_name ?? p.email ?? p.id]))
  const pending = rows.filter((r) => r.status === 'pending')
  const decided = rows.filter((r) => r.status !== 'pending')

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <h1 className="text-brand-dark text-3xl font-bold">Change requests</h1>
      <p className="text-muted-foreground mt-1 text-sm">
        Customers cannot change verified details themselves. Check the new value (call the customer
        if unsure), then approve to apply it, or reject with a note. Every decision is audited and
        the customer is told.
      </p>
      {error && (
        <p className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Change requests appear here once migration 0025 is applied.
        </p>
      )}
      <h2 className="text-brand-dark mt-8 text-xl font-semibold">Waiting ({pending.length})</h2>
      {pending.length === 0 ? (
        <p className="text-muted-foreground mt-2 text-sm">Nothing waiting.</p>
      ) : (
        <ul className="mt-3 space-y-3" data-testid="pending-changes">
          {pending.map((r) => (
            <ChangeRequestRow
              key={r.id}
              id={r.id}
              customer={nameOf.get(r.consumer_id) ?? r.consumer_id}
              field={CHANGE_FIELD_LABELS[r.field as ChangeField]}
              currentValue={r.current_value}
              newValue={r.new_value}
              reason={r.reason}
              when={when(r.created_at)}
            />
          ))}
        </ul>
      )}
      <h2 className="text-brand-dark mt-8 text-xl font-semibold">Decided</h2>
      <ul className="mt-3 space-y-1 text-sm">
        {decided.map((r) => (
          <li key={r.id}>
            {when(r.decided_at ?? r.created_at)} · {nameOf.get(r.consumer_id) ?? r.consumer_id} ·{' '}
            {CHANGE_FIELD_LABELS[r.field as ChangeField]} → {r.new_value} ·{' '}
            <strong className={r.status === 'approved' ? 'text-brand-green' : 'text-red-700'}>
              {r.status}
            </strong>
            {r.decision_note ? ` (${r.decision_note})` : ''}
          </li>
        ))}
      </ul>
    </main>
  )
}
