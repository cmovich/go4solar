import type { InstallerLead } from '@/lib/waitlist/admin'
import type { DuplicateMatch } from '@/lib/waitlist/duplicates'
import { INSTALLER_STATE_LABELS } from '@/lib/waitlist/schema'

import { DeleteEntryButton } from './DeleteEntryButton'
import { DuplicateBadge } from './DuplicateBadge'

const date = (iso: string) =>
  new Date(iso).toLocaleString('en-NG', {
    timeZone: 'Africa/Lagos',
    dateStyle: 'medium',
    timeStyle: 'short',
  })

export function InstallerTable({
  rows,
  duplicates,
  canDelete,
}: {
  rows: InstallerLead[]
  duplicates: Record<string, DuplicateMatch>
  canDelete: boolean
}) {
  if (rows.length === 0)
    return <p className="text-muted-foreground mt-6 text-sm">No installers yet.</p>
  return (
    <div className="mt-4 overflow-x-auto rounded-xl border">
      <table className="w-full text-sm" data-testid="installer-table">
        <thead className="bg-brand-green text-left text-white">
          <tr>
            {[
              'When',
              'Name',
              'Business',
              'Phone',
              'Email',
              'States',
              'LGAs',
              'Years',
              'Installs',
              'CAC',
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
            <tr key={r.id} className={i % 2 ? 'bg-brand-mist/60' : 'bg-white'}>
              <td className="px-3 py-2 whitespace-nowrap">{date(r.created_at)}</td>
              <td className="px-3 py-2 whitespace-nowrap">
                {r.name}
                <DuplicateBadge match={duplicates[r.id]} />
              </td>
              <td className="px-3 py-2 whitespace-nowrap">{r.business_name ?? '—'}</td>
              <td className="px-3 py-2 whitespace-nowrap tabular-nums">{r.phone_e164}</td>
              <td className="px-3 py-2 whitespace-nowrap">{r.email ?? '—'}</td>
              <td className="px-3 py-2 whitespace-nowrap">
                {r.states
                  .map((s) => (INSTALLER_STATE_LABELS as Record<string, string>)[s] ?? s)
                  .join(', ') || '—'}
              </td>
              <td className="max-w-56 truncate px-3 py-2">{r.lgas ?? '—'}</td>
              <td className="px-3 py-2 text-right tabular-nums">{r.years_in_business ?? '—'}</td>
              <td className="px-3 py-2 text-right tabular-nums">
                {r.installations_completed ?? '—'}
              </td>
              <td className="px-3 py-2">{r.cac_registered ? 'Yes' : 'No'}</td>
              <td className="px-3 py-2 whitespace-nowrap">
                {r.enteredByName ?? <span className="text-muted-foreground">Self</span>}
              </td>
              {canDelete && (
                <td className="px-1 py-0.5">
                  <DeleteEntryButton table="installers" id={r.id} label={r.name} />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
