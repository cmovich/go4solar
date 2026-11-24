import { isFunderLogin } from '@/lib/auth/staffRoles'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { z } from 'zod'

import { DecisionControl } from '@/components/admin/tradeLenda/DecisionControl'
import { Downloads } from '@/components/admin/tradeLenda/Downloads'
import { requireFunderViewer } from '@/lib/auth/roles'
import { batchLabel } from '@/lib/tradeLenda/batch'
import { customerRows } from '@/lib/tradeLenda/exports'
import { funderBatch } from '@/lib/tradeLenda/server'

export const metadata: Metadata = { title: 'Customer' }
export const dynamic = 'force-dynamic'

/** One customer in a batch, exactly as stored for the funder. */
export default async function FunderCustomerPage({
  params,
}: {
  params: Promise<{ batchId: string; itemId: string }>
}) {
  const s = await requireFunderViewer()
  const { batchId, itemId } = await params
  if (!z.uuid().safeParse(batchId).success || !z.uuid().safeParse(itemId).success) notFound()
  const b = await funderBatch({ id: s.user!.id, role: s.role }, batchId)
  const item = b?.items.find((i) => i.id === itemId)
  if (!b || !item) notFound()
  const c = item.customer
  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <p className="text-sm">
        <Link href={`/admin/funder/${b.id}`} className="text-brand-blue underline">
          ‹ {batchLabel(b.number, b.version, b.lendingType)}
        </Link>
      </p>
      <h1 className="text-brand-dark mt-2 text-2xl font-bold">{c.name}</h1>
      <p className="text-muted-foreground text-sm">{c.reference}</p>
      <Downloads
        href={`/api/funder/batches/${b.id}`}
        refId={c.reference}
        label="Download customer"
      />
      <dl
        className="mt-4 grid grid-cols-[1fr_2fr] gap-x-4 gap-y-1 text-sm"
        data-testid="funder-customer"
      >
        {customerRows(c).map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted-foreground border-b py-1">{k}</dt>
            <dd className="border-b py-1 font-medium">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-4">
        <DecisionControl
          itemId={item.id}
          batchId={b.id}
          decision={item.decision}
          note={item.note}
          canDecide={isFunderLogin(s.role) && !b.replaced}
        />
      </div>
    </main>
  )
}
