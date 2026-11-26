import type { Metadata } from 'next'
import Link from 'next/link'

import { TestDataToggle } from '@/components/admin/TestDataToggle'
import { UpdateVersionButton } from '@/components/admin/exports/UpdateVersionButton'
import { VoidBatchButton } from '@/components/admin/exports/VoidBatchButton'
import { Downloads } from '@/components/admin/tradeLenda/Downloads'
import { requireExporter } from '@/lib/auth/roles'
import { exportsList } from '@/lib/exports/list'
import { openQueue } from '@/lib/exports/queue'
import { includeTestData } from '@/lib/testmode/server'

export const metadata: Metadata = { title: 'Exports' }
export const dynamic = 'force-dynamic'

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-NG', {
    timeZone: 'Africa/Lagos',
    dateStyle: 'medium',
    timeStyle: 'short',
  })

/** Admin → Exports (super admin, Operations): every batch sent to any funder, and the open queue. */
export default async function ExportsPage({
  searchParams,
}: {
  searchParams: Promise<{ test?: string }>
}) {
  const session = await requireExporter()
  const sp = await searchParams
  const includeTest = await includeTestData(sp.test)
  const [rows, queue] = await Promise.all([exportsList(includeTest), openQueue(includeTest)])
  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <h1 className="text-brand-dark text-3xl font-bold">Exports</h1>
      <p className="text-muted-foreground mt-1 text-sm">
        People sent to funders from the waiting list. Add people from Admin → Waiting list (Complete
        or Incomplete) with “Add to export queue”.
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-4">
        <TestDataToggle path="/admin/exports" params={sp} on={includeTest} />
      </div>
      <section className="bg-brand-mist mt-4 rounded-xl p-4 text-sm" data-testid="open-queue">
        {queue ? (
          <p>
            Open export queue <strong>{queue.number}</strong>, started {when(queue.created_at)}.{' '}
            <Link
              href={`/admin/exports/queue${includeTest ? '?test=1' : ''}`}
              className="text-brand-blue font-semibold underline"
            >
              Open the queue
            </Link>
          </p>
        ) : (
          <p>No open export queue.</p>
        )}
      </section>
      {rows.length === 0 ? (
        <p className="text-muted-foreground mt-6 text-sm">No exports yet.</p>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-xl border">
          <table className="w-full text-sm" data-testid="exports-table">
            <thead className="bg-brand-green text-left text-white">
              <tr>
                {[
                  'Batch',
                  'Funder',
                  'Sent',
                  'By',
                  'People',
                  'Basic / Full',
                  'Status',
                  'Funder decisions',
                  '',
                ].map((h, k) => (
                  <th key={k} className="px-3 py-2 font-semibold whitespace-nowrap">
                    {h || <span className="sr-only">Actions</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((b, i) => (
                <tr
                  key={b.id}
                  className={`align-top ${i % 2 ? 'bg-brand-mist/60' : 'bg-white'}`}
                  data-testid="export-row"
                >
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className="font-semibold">
                      {b.number}
                      {b.version > 1 ? ` v${b.version}` : ''}
                    </span>
                    {b.queue && (
                      <span className="text-muted-foreground block text-xs">{b.queue}</span>
                    )}
                    {b.isTest && <span className="text-muted-foreground block text-xs">test</span>}
                  </td>
                  <td className="px-3 py-2">{b.funderName}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{when(b.createdAt)}</td>
                  <td className="px-3 py-2">{b.createdBy}</td>
                  <td className="px-3 py-2 tabular-nums">{b.people}</td>
                  <td className="px-3 py-2 tabular-nums">
                    {b.basic} / {b.full}
                  </td>
                  <td className="px-3 py-2">
                    {b.voided ? (
                      <span className="text-destructive font-semibold" data-testid="voided">
                        Voided
                        <span className="text-muted-foreground block text-xs font-normal">
                          was {b.voided.was} · {b.voided.by}, {when(b.voided.at)} · “
                          {b.voided.reason}”
                        </span>
                      </span>
                    ) : b.replaced ? (
                      'Replaced'
                    ) : (
                      'Current'
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {b.decisions.approved} approved · {b.decisions.declined} declined ·{' '}
                    {b.decisions.needs_info} needs info · {b.decisions.pending} waiting
                  </td>
                  <td className="px-3 py-2">
                    <Downloads href={`/api/funder/batches/${b.id}`} label="Download" />
                    {!b.replaced && !b.voided && <UpdateVersionButton batchId={b.id} />}
                    {!b.voided && session.role === 'super_admin' && (
                      <VoidBatchButton batchId={b.id} number={b.number} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}
