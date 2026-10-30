import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { ApplyWizard } from '@/components/apply/ApplyWizard'
import { ensureApplication, waitingQuote, wizardState } from '@/lib/applications/server'
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
  // Submitted (deposit paid) or decided: the dashboard shows where things stand.
  if (app.status !== 'draft') redirect('/app')
  const [state, waiting] = await Promise.all([wizardState(app), waitingQuote(user!.id)])
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
      {waiting && (
        <p
          className="rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-900"
          role="status"
          data-testid="waiting-quote"
        >
          Your new quote {waiting} is saved. This application is already signed or submitted, so it
          stays as it is; you can apply with the new quote once it is finished. Questions? Call us.
        </p>
      )}
      <ApplyWizard state={state} />
    </main>
  )
}
