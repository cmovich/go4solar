import { canEditLeadProfile, canExport } from '@/lib/auth/staffRoles'
import { readinessByLead } from '@/lib/exports/consents'
import { exportsByLead } from '@/lib/exports/list'
import { openQueue } from '@/lib/exports/queue'
import type { Metadata } from 'next'
import Link from 'next/link'

import { ClearWaitlistButton } from '@/components/admin/waitlist/ClearWaitlistButton'
import { ConsumerTable } from '@/components/admin/waitlist/ConsumerTable'
import { DeleteTestEntriesButton } from '@/components/admin/waitlist/DeleteTestEntriesButton'
import { HeadlineCards } from '@/components/admin/waitlist/HeadlineCards'
import { InstallerTable } from '@/components/admin/waitlist/InstallerTable'
import { WaitlistFilters } from '@/components/admin/waitlist/WaitlistFilters'
import { TestDataToggle } from '@/components/admin/TestDataToggle'
import { includeTestData } from '@/lib/testmode/server'
import { Button } from '@/components/ui/button'
import { requireWaitlistViewer } from '@/lib/auth/roles'
import { createClient } from '@/lib/supabase/server'
import {
  countTestEntries,
  duplicateMap,
  headline,
  listConsumers,
  listInstallers,
  type ConsumerFilters,
} from '@/lib/waitlist/admin'
import { canDeleteWaitlist } from '@/lib/waitlist/duplicates'

import { exportIsRecent } from './actions'

export const metadata: Metadata = { title: 'Waiting list' }
export const dynamic = 'force-dynamic'

type Search = Record<string, string | string[] | undefined>
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined

export default async function WaitlistAdminPage({
  searchParams,
}: {
  searchParams: Promise<Search>
}) {
  const session = await requireWaitlistViewer()
  // Sales: read only (Complete and Incomplete, Edit and ticks); no installers, exports or deletes.
  const sales = session.role === 'sales'
  const sp = await searchParams
  const asked = (one(sp.tab) ?? 'complete') as 'complete' | 'incomplete' | 'installers'
  const tab = sales && asked === 'installers' ? 'complete' : asked
  const filters: ConsumerFilters = {
    tab: tab === 'installers' ? 'complete' : tab,
    state: one(sp.state),
    band: one(sp.band),
    plan: one(sp.plan),
    ready: one(sp.ready),
    type: one(sp.type),
    gen: one(sp.gen),
    from: one(sp.from),
    to: one(sp.to),
    includeTest: await includeTestData(sp.test),
  }

  const supabase = await createClient()
  const [
    stats,
    rows,
    installers,
    recentExport,
    { data: canAssist },
    { data: deletePermission },
    duplicates,
    testCount,
  ] = await Promise.all([
    headline(filters.includeTest),
    tab === 'installers' ? Promise.resolve([]) : listConsumers(filters),
    tab === 'installers' ? listInstallers(filters.includeTest) : Promise.resolve([]),
    sales ? Promise.resolve(false) : exportIsRecent(),
    supabase.rpc('has_permission', { target: 'assisted_entry' }),
    supabase.rpc('has_permission', { target: 'waitlist_delete' }),
    duplicateMap(
      tab === 'installers' ? 'waitlist_installers' : 'waitlist_consumers',
      filters.includeTest,
    ),
    countTestEntries(),
  ])
  const isSuperAdmin = session.role === 'super_admin'
  const canDelete = !sales && canDeleteWaitlist(session.role, Boolean(deletePermission))
  const dupes = Object.fromEntries(duplicates)

  const tabs = [
    { id: 'complete', label: `Complete (${stats.complete})` },
    { id: 'incomplete', label: `Incomplete leads (${stats.incomplete})` },
    ...(sales ? [] : [{ id: 'installers', label: `Installers (${stats.installers})` }]),
  ] as const

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-brand-dark text-3xl font-bold">Waiting list</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Prelaunch sign-ups. Signed in as {session.user?.email} ({session.role}).
          </p>
          <div className="mt-2">
            <TestDataToggle path="/admin/waitlist" params={sp} on={Boolean(filters.includeTest)} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {!sales && (
            <Button asChild variant="outline">
              <a
                href={`/api/admin/waitlist/report.pdf${filters.includeTest ? '?test=1' : ''}`}
                download
              >
                Download PDF
              </a>
            </Button>
          )}
          {!sales && (
            <Button asChild variant="outline">
              <a
                href={`/api/admin/waitlist/export.csv${filters.includeTest ? '?test=1' : ''}`}
                download
              >
                Download CSV
              </a>
            </Button>
          )}
          {!sales && (canAssist || isSuperAdmin) && (
            <Button asChild>
              <Link href="/admin/waitlist/new">Add on behalf of customer</Link>
            </Button>
          )}
          {canDelete && <DeleteTestEntriesButton count={testCount} />}
          {isSuperAdmin && (
            <ClearWaitlistButton
              exportRecent={recentExport}
              total={stats.total + stats.installers}
            />
          )}
        </div>
      </div>

      {stats.sample && (
        <p className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Estimates use SAMPLE prices. Load the real price list before launch.
        </p>
      )}

      <HeadlineCards stats={stats} />

      <nav className="mt-8 flex gap-1 border-b" aria-label="Tabs">
        {tabs.map((t) => (
          <Link
            key={t.id}
            href={`/admin/waitlist?tab=${t.id}`}
            aria-current={tab === t.id ? 'page' : undefined}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-semibold ${
              tab === t.id
                ? 'border-brand-green text-brand-dark'
                : 'text-muted-foreground hover:text-brand-dark border-transparent'
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === 'installers' ? (
        <InstallerTable rows={installers} duplicates={dupes} canDelete={canDelete} />
      ) : (
        <>
          <WaitlistFilters tab={tab} filters={filters} />
          <ConsumerTable
            rows={rows}
            duplicates={dupes}
            canDelete={canDelete}
            canEdit={canEditLeadProfile(session.role)}
            readiness={await readinessByLead(rows.map((r) => r.id))}
            canQueue={canExport(session.role)}
            openQueue={
              canExport(session.role)
                ? ((await openQueue(Boolean(filters.includeTest)))?.number ?? null)
                : null
            }
            exported={await exportsByLead(rows.map((r) => r.id))}
            isTest={Boolean(filters.includeTest)}
          />
        </>
      )}
    </main>
  )
}
