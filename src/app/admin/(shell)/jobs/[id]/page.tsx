import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { JobControls } from '@/components/admin/jobs/JobControls'
import { canConfirmPayout } from '@/lib/approvals/rules'
import { requireRole } from '@/lib/auth/roles'
import { jobDetail } from '@/lib/jobs/admin'

export const metadata: Metadata = { title: 'Job' }
export const dynamic = 'force-dynamic'

const when = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString('en-GB', {
        timeZone: 'Africa/Lagos',
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : '—'

export default async function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole('super_admin', 'operations', 'finance')
  const job = await jobDetail((await params).id)
  if (!job) notFound()
  const serials = (job.serials ?? {}) as {
    panels?: string[]
    batteries?: string[]
    inverters?: string[]
  }
  const payoutRule = canConfirmPayout({
    actorId: session.user!.id,
    approvedBy: job.approvedBy,
    jobStatus: job.status,
  })
  const canPayout =
    (session.role === 'finance' || session.role === 'super_admin') && payoutRule.allowed

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6">
      <div>
        <Link href="/admin/jobs" className="text-brand-blue text-sm underline">
          ← Jobs
        </Link>
        <h1 className="text-brand-dark mt-2 text-2xl font-bold">
          Installation for {job.customer.name}
        </h1>
        <p className="text-sm">
          <Link
            href={`/admin/applications/${job.applicationId}`}
            className="text-brand-blue underline"
          >
            Application
          </Link>{' '}
          · status <strong data-testid="job-status">{job.status.replace('_', ' ')}</strong>
        </p>
      </div>
      <dl className="grid gap-2 rounded-xl border bg-white p-4 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">Installer</dt>
          <dd className="font-semibold">
            {job.installer_name} · {job.installer_phone}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Equipment from</dt>
          <dd className="font-semibold">
            {job.equipment_source === 'vendor'
              ? `Vendor: ${job.vendor_name}`
              : 'Go4Solar store (OEM stock)'}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Pickup code (give to the installer)</dt>
          <dd className="font-mono text-lg font-bold" data-testid="pickup-code">
            {job.pickup_code}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Installation date</dt>
          <dd className="font-semibold">{job.scheduled_date ?? 'Not set'}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Installed / customer confirmed</dt>
          <dd className="font-semibold">
            {when(job.installed_at)} / {when(job.customer_signoff_at)}
          </dd>
        </div>
      </dl>
      {job.photoUrls.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {job.photoUrls.map((p) =>
            p.url ? (
              <li key={p.path}>
                <a
                  href={p.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-brand-blue text-sm underline"
                >
                  Photo {job.photoUrls.indexOf(p) + 1}
                </a>
              </li>
            ) : null,
          )}
        </ul>
      )}
      <JobControls
        jobId={job.id}
        status={job.status}
        scheduledDate={job.scheduled_date}
        serials={{
          panels: serials.panels ?? [],
          batteries: serials.batteries ?? [],
          inverters: serials.inverters ?? [],
        }}
        canPayout={canPayout}
        payoutConfirmed={Boolean(job.payout_confirmed_by)}
      />
    </main>
  )
}
