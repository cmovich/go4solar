import type { Metadata } from 'next'
import Link from 'next/link'

import { TestDataToggle } from '@/components/admin/TestDataToggle'
import { Downloads } from '@/components/admin/tradeLenda/Downloads'
import { UpdateBatchButton } from '@/components/admin/tradeLenda/UpdateBatchButton'
import { requireRole } from '@/lib/auth/roles'
import { batchLabel } from '@/lib/tradeLenda/batch'
import { adminBatchList } from '@/lib/tradeLenda/server'
import { includeTestData } from '@/lib/testmode/server'

export const metadata: Metadata = { title: 'Trade Lenda batches' }
export const dynamic = 'force-dynamic'

/** Super admin: every batch sent to Trade Lenda (all versions), downloads and updated versions. */
export default async function BatchesPage({
  searchParams,
}: {
  searchParams: Promise<{ test?: string }>
}) {
  await requireRole('super_admin')
  const sp = await searchParams
  const includeTest = await includeTestData(sp.test)
  const rows = await adminBatchList(includeTest)
  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <p className="text-sm">
        <Link href="/admin/waitlist/profiles" className="text-brand-blue underline">
          ‹ Trade Lenda profiles
        </Link>
      </p>
      <h1 className="text-brand-dark mt-2 text-3xl font-bold">Batches sent to Trade Lenda</h1>
      <div className="mt-2 flex flex-wrap gap-4">
        <TestDataToggle path="/admin/waitlist/batches" params={sp} on={includeTest} />
        <Link href="/admin/funder" className="text-brand-blue text-sm underline">
          View as Trade Lenda
        </Link>
      </div>
      {rows.length === 0 ? (
        <p className="text-muted-foreground mt-6 text-sm">No batches yet.</p>
      ) : (
        <ul className="mt-6 space-y-3" data-testid="admin-batches">
          {rows.map((b) => (
            <li key={b.id} className="rounded-xl border p-3 text-sm">
              <Link
                href={`/admin/funder/${b.id}`}
                className="text-brand-blue font-semibold underline"
              >
                {batchLabel(b.number, b.version, b.lendingType)}
              </Link>{' '}
              · {b.customers} customers · sent {b.createdAt.slice(0, 10)}
              {b.replaced ? ' · replaced' : ''}
              <Downloads href={`/api/funder/batches/${b.id}`} label="Download" />
              {!b.replaced && <UpdateBatchButton batchId={b.id} />}
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
