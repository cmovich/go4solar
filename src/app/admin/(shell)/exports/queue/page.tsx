import type { Metadata } from 'next'
import Link from 'next/link'

import { QueuePanel } from '@/components/admin/exports/QueuePanel'
import { requireExporter } from '@/lib/auth/roles'
import { queueView, type ExportMode } from '@/lib/exports/queue'
import { includeTestData } from '@/lib/testmode/server'
import type { LendingType } from '@/lib/tradeLenda/figures'

export const metadata: Metadata = { title: 'Export queue' }
export const dynamic = 'force-dynamic'

/** The open export queue (super admin, Operations). */
export default async function ExportQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ test?: string; funder?: string; type?: string; mode?: string }>
}) {
  await requireExporter()
  const sp = await searchParams
  const isTest = await includeTestData(sp.test)
  const mode: ExportMode = sp.mode === 'basic' ? 'basic' : 'full-where-possible'
  const first = await queueView({ isTest, funderId: null, lendingType: null, mode })
  const funder = first.funders.find((f) => f.id === sp.funder) ?? null
  const lendingType: LendingType | null = funder
    ? funder.lendingTypes.includes(sp.type as LendingType)
      ? (sp.type as LendingType)
      : funder.defaultLendingType
    : null
  const view = funder ? await queueView({ isTest, funderId: funder.id, lendingType, mode }) : first
  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <p className="text-sm">
        <Link
          href={`/admin/exports${isTest ? '?test=1' : ''}`}
          className="text-brand-blue underline"
        >
          ‹ Exports
        </Link>
      </p>
      <h1 className="text-brand-dark mt-2 text-2xl font-bold">
        Export queue {view.queue?.number ?? ''}
        {isTest ? ' (test data)' : ''}
      </h1>
      {view.queue ? (
        <QueuePanel
          queueId={view.queue.id}
          number={view.queue.number}
          isTest={isTest}
          funders={view.funders.map((f) => ({
            id: f.id,
            name: f.name,
            prefix: f.prefix,
            lendingTypes: f.lendingTypes,
          }))}
          funderId={funder?.id ?? null}
          lendingType={lendingType}
          mode={mode}
          rows={view.rows}
        />
      ) : (
        <p className="text-muted-foreground mt-4 text-sm">
          No open queue. Add people from Admin → Waiting list with “Add to export queue”.
        </p>
      )}
    </main>
  )
}
