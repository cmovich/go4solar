import type { Metadata } from 'next'
import Link from 'next/link'

import { TestDataToggle } from '@/components/admin/TestDataToggle'
import { ProfilesTable } from '@/components/admin/tradeLenda/ProfilesTable'
import { requireLeadProfileEditor } from '@/lib/auth/roles'
import { profileList, tradeLendaFunder } from '@/lib/tradeLenda/server'
import { includeTestData } from '@/lib/testmode/server'

export const metadata: Metadata = { title: 'Trade Lenda profiles' }
export const dynamic = 'force-dynamic'

/**
 * Admin → Waiting list → Trade Lenda profiles: each entry's profile status (super admin,
 * Operations, Sales). Super admin also selects ready entries and sends them as a batch.
 */
export default async function ProfilesPage({
  searchParams,
}: {
  searchParams: Promise<{ test?: string }>
}) {
  const session = await requireLeadProfileEditor()
  const sp = await searchParams
  const includeTest = await includeTestData(sp.test)
  const [rows, funder] = await Promise.all([profileList(includeTest), tradeLendaFunder()])
  const isSuperAdmin = session.role === 'super_admin'
  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-brand-dark text-3xl font-bold">Trade Lenda profiles</h1>
          <p className="text-muted-foreground mt-1 max-w-3xl text-sm">
            Complete each entry on the phone. An entry can be sent when its profile is complete, it
            is verified by phone, the customer agreed to share their details with Trade Lenda, and
            they agreed to the figures for the batch&rsquo;s lending type.
          </p>
          <div className="mt-2">
            <TestDataToggle path="/admin/waitlist/profiles" params={sp} on={includeTest} />
          </div>
        </div>
        {isSuperAdmin && (
          <div className="flex gap-2">
            <Link href="/admin/waitlist/batches" className="text-brand-blue text-sm underline">
              Batches sent
            </Link>
            <Link href="/admin/funder" className="text-brand-blue text-sm underline">
              View as Trade Lenda
            </Link>
          </div>
        )}
      </div>
      <ProfilesTable
        rows={rows}
        canSend={isSuperAdmin}
        lendingTypes={funder?.lendingTypes ?? []}
        defaultLendingType={funder?.defaultLendingType ?? 'customer'}
      />
    </main>
  )
}
