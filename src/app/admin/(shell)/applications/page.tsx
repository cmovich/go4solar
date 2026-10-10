import type { Metadata } from 'next'

import { requireRole } from '@/lib/auth/roles'

export const metadata: Metadata = { title: 'Applications' }

/** Placeholder until Prompt 13 builds this module. */
export default async function ApplicationsPage() {
  await requireRole('super_admin', 'credit_officer')
  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <h1 className="text-brand-dark text-3xl font-bold">Applications</h1>
      <p className="text-muted-foreground mt-2 text-sm">
        This module arrives with Prompt 13. Nothing to do here yet.
      </p>
    </main>
  )
}
