import type { Metadata } from 'next'
import Link from 'next/link'

import { TestDataToggle } from '@/components/admin/TestDataToggle'
import { requireFunderViewer } from '@/lib/auth/roles'
import { batchLabel } from '@/lib/tradeLenda/batch'
import { exportFunders } from '@/lib/exports/queue'
import { funderBatchList } from '@/lib/tradeLenda/server'
import { includeTestData } from '@/lib/testmode/server'

export const metadata: Metadata = { title: 'Batches' }
export const dynamic = 'force-dynamic'

/** A funder's batches (its own login), or any funder's for a super admin ("View as [funder]"). */
export default async function FunderBatchesPage({
  searchParams,
}: {
  searchParams: Promise<{ test?: string; as?: string }>
}) {
  const s = await requireFunderViewer()
  const sp = await searchParams
  const includeTest = await includeTestData(sp.test)
  // Super admin: "View as [funder]" for every funder (Trade Lenda when none is chosen).
  const funders = s.role === 'super_admin' ? await exportFunders(includeTest) : []
  const viewAs =
    s.role === 'super_admin'
      ? (funders.find((f) => f.id === sp.as)?.id ??
        funders.find((f) => f.prefix === 'TL')?.id ??
        null)
      : null
  const viewing = funders.find((f) => f.id === viewAs)
  const rows = await funderBatchList({ id: s.user!.id, role: s.role }, includeTest, viewAs)
  const asQ = viewAs ? `?as=${viewAs}` : ''
  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      {s.role === 'super_admin' && (
        <div
          className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900"
          data-testid="view-as"
        >
          <p>
            Viewing as {viewing?.name ?? 'a funder'}: exactly what {viewing?.name ?? 'the funder'}{' '}
            sees.
          </p>
          <p className="mt-1 flex flex-wrap gap-3">
            View as:
            {funders.map((f) => (
              <Link
                key={f.id}
                href={`/admin/funder?as=${f.id}${includeTest ? '&test=1' : ''}`}
                className={
                  f.id === viewAs ? 'font-semibold underline' : 'text-brand-blue underline'
                }
                aria-current={f.id === viewAs ? 'page' : undefined}
              >
                {f.name}
              </Link>
            ))}
          </p>
        </div>
      )}
      <h1 className="text-brand-dark text-3xl font-bold">Batches</h1>
      <div className="mt-2">
        <TestDataToggle path="/admin/funder" params={sp} on={includeTest} />
      </div>
      {rows.length === 0 ? (
        <p className="text-muted-foreground mt-6 text-sm">No batches yet.</p>
      ) : (
        <table className="mt-6 w-full text-sm" data-testid="funder-batches">
          <thead className="bg-brand-green text-left text-white">
            <tr>
              <th className="px-3 py-2">Batch</th>
              <th className="px-3 py-2">Sent</th>
              <th className="px-3 py-2">Customers</th>
              <th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((b) => (
              <tr key={b.id} className="border-t">
                <td className="px-3 py-2">
                  <Link
                    href={`/admin/funder/${b.id}${asQ}`}
                    className="text-brand-blue font-semibold underline"
                  >
                    {batchLabel(b.number, b.version, b.lendingType)}
                  </Link>
                </td>
                <td className="px-3 py-2">{b.createdAt.slice(0, 10)}</td>
                <td className="px-3 py-2">{b.customers}</td>
                <td className="px-3 py-2">
                  {b.replaced ? 'Replaced by a newer version' : 'Current'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  )
}
