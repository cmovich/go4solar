import type { Metadata } from 'next'

import { requireRole } from '@/lib/auth/roles'

export const metadata: Metadata = { title: 'Jobs' }

/** Placeholder until Prompt 13 builds this module. */
export default async function JobsPage() {
  await requireRole('super_admin', 'operations')
  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <h1 className="text-brand-dark text-3xl font-bold">Jobs</h1>
      <p className="text-muted-foreground mt-2 text-sm">
        This module arrives with Prompt 13. Nothing to do here yet.
      </p>
    </main>
  )
}
