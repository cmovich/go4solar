import type { Metadata } from 'next'
import Link from 'next/link'

import { SpewaQueueTable } from '@/components/admin/spewa/SpewaQueueTable'
import { TestDataToggle } from '@/components/admin/TestDataToggle'
import { requireFunderQueueViewer } from '@/lib/auth/roles'
import { canDecideFunderQueue, type QueueDecision } from '@/lib/funderQueue/rules'
import { funderQueueList } from '@/lib/funderQueue/server'
import { includeTestData } from '@/lib/testmode/server'

export const metadata: Metadata = { title: 'SPEWA approvals' }
export const dynamic = 'force-dynamic'

const TABS: [QueueDecision | 'all', string][] = [
  ['pending', 'Waiting'],
  ['approved', 'Approved'],
  ['declined', 'Declined'],
  ['all', 'All'],
]

/**
 * SPEWA's approval queue: businesses with a deposit of 30% or more, routed here once every
 * onboarding step is done. The funder approver (and super admins) approve or decline, one by one
 * or in bulk; credit officers see the files and record the cheques.
 */
export default async function SpewaPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string; test?: string }>
}) {
  const session = await requireFunderQueueViewer()
  const sp = await searchParams
  const includeTest = await includeTestData(sp.test)
  const show = TABS.some(([k]) => k === sp.show) ? (sp.show as QueueDecision | 'all') : 'pending'
  const rows = await funderQueueList({
    decision: show === 'all' ? undefined : show,
    includeTest,
  })
  const qs = (k: string) => {
    const p = new URLSearchParams({ show: k })
    if (includeTest) p.set('test', '1')
    return `?${p.toString()}`
  }

  return (
    <main className="mx-auto max-w-7xl space-y-4 px-4 py-8 sm:px-6">
      <div>
        <h1 className="text-brand-dark text-3xl font-bold">SPEWA approvals</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Businesses with a deposit of 30% or more. Approve = final approval with SPEWA as the
          funder. Decline = back to Go4Solar&rsquo;s general queue.
        </p>
        <div className="mt-2">
          <TestDataToggle path="/admin/spewa" params={sp} on={includeTest} />
        </div>
      </div>
      <nav className="flex flex-wrap gap-1 border-b" aria-label="Show">
        {TABS.map(([k, label]) => (
          <Link
            key={k}
            href={qs(k)}
            aria-current={show === k ? 'page' : undefined}
            className={`rounded-t-md px-3 py-2 text-sm font-semibold ${show === k ? 'bg-brand-green text-white' : 'text-brand-dark hover:bg-brand-mist'}`}
          >
            {label}
          </Link>
        ))}
      </nav>
      <SpewaQueueTable rows={rows} canDecide={canDecideFunderQueue(session.role)} />
    </main>
  )
}
