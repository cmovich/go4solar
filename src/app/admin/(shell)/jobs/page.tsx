import type { Metadata } from 'next'
import Link from 'next/link'

import { AssignJobForm } from '@/components/admin/jobs/JobControls'
import { requireRole } from '@/lib/auth/roles'
import { jobsOverview } from '@/lib/jobs/admin'

export const metadata: Metadata = { title: 'Jobs' }
export const dynamic = 'force-dynamic'

const STATUS: Record<string, string> = {
  assigned: 'Assigned',
  picked_up: 'Equipment picked up',
  installed: 'Installed (waiting for the customer)',
  commissioned: 'Commissioned',
}

/** Installations from assignment to commissioning (Phase 1: assigned by hand). */
export default async function JobsPage() {
  await requireRole('super_admin', 'operations', 'finance')
  const { waiting, jobs } = await jobsOverview()
  return (
    <main className="mx-auto max-w-6xl space-y-8 px-4 py-8 sm:px-6">
      <h1 className="text-brand-dark text-3xl font-bold">Jobs</h1>

      <section>
        <h2 className="text-brand-dark text-lg font-bold">
          Approved, waiting for an installer ({waiting.length})
        </h2>
        <ul className="mt-3 space-y-3">
          {waiting.map((w) => (
            <li
              key={w.loanId}
              className="rounded-xl border bg-white p-4"
              data-testid="awaiting-job"
            >
              <p className="mb-2 text-sm font-semibold">
                {w.name} · {w.state ?? '—'} · {w.phone ?? ''}
              </p>
              <AssignJobForm loanId={w.loanId} />
            </li>
          ))}
          {waiting.length === 0 && (
            <li className="text-muted-foreground text-sm">Nothing waiting.</li>
          )}
        </ul>
      </section>

      <section>
        <h2 className="text-brand-dark text-lg font-bold">All jobs</h2>
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="bg-brand-green text-left text-white">
              <th className="px-3 py-2">Customer</th>
              <th className="px-3 py-2">Installer</th>
              <th className="px-3 py-2">Equipment from</th>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((j) => (
              <tr key={j.id} className="even:bg-brand-mist">
                <td className="px-3 py-2">
                  <Link
                    href={`/admin/jobs/${j.id}`}
                    className="text-brand-blue font-semibold underline"
                  >
                    {j.customer?.name ?? 'Customer'}
                  </Link>
                </td>
                <td className="px-3 py-2">{j.installer_name}</td>
                <td className="px-3 py-2">
                  {j.equipment_source === 'vendor' ? j.vendor_name : 'Go4Solar store'}
                </td>
                <td className="px-3 py-2">{j.scheduled_date ?? '—'}</td>
                <td className="px-3 py-2">{STATUS[j.status]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  )
}
