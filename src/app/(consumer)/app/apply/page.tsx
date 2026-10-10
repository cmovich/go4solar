import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { ApplyWizard } from '@/components/apply/ApplyWizard'
import { ensureApplication, wizardState } from '@/lib/applications/server'
import { requireUser } from '@/lib/auth/roles'

export const metadata: Metadata = { title: 'Your application' }
export const dynamic = 'force-dynamic'

/** The application wizard (resumes at the first unfinished step). */
export default async function ApplyPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; verify?: string }>
}) {
  const { user } = await requireUser('/app/apply')
  const app = await ensureApplication(user!.id)
  if (!app) redirect('/get-started')
  const state = await wizardState(app)
  const sp = await searchParams
  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      {sp.email === 'verified' && (
        <p
          className="bg-brand-mist text-brand-green mb-4 rounded-md px-4 py-2 text-sm font-semibold"
          role="status"
        >
          Thank you — your email is confirmed.
        </p>
      )}
      {sp.verify === 'email' && (
        <p className="mb-4 rounded-md bg-amber-50 px-4 py-2 text-sm text-amber-900" role="status">
          Please confirm your email (use the link we sent) before signing your agreement.
        </p>
      )}
      <ApplyWizard state={state} />
    </main>
  )
}
