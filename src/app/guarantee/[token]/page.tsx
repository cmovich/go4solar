import type { Metadata } from 'next'
import Image from 'next/image'

import { GuarantorFlow } from '@/components/agreements/GuarantorFlow'
import { siteConfig } from '@/config/site'
import {
  guaranteeContext,
  nextGuarantorStep,
  openGuarantee,
  type GuarantorStepId,
} from '@/lib/agreements/guarantor'
import { latestStatus } from '@/lib/applications/rules'
import { checkSummaries } from '@/lib/applications/server'

export const metadata: Metadata = {
  title: 'Guarantor request',
  robots: { index: false, follow: false },
}
export const dynamic = 'force-dynamic'

const PROBLEMS: Record<string, { title: string; body: string }> = {
  not_found: {
    title: 'This link is not valid',
    body: 'Please ask the customer to send you a new link.',
  },
  expired: {
    title: 'This link has expired',
    body: 'Links work for 72 hours. Please ask the customer to send you a new one.',
  },
  signed: {
    title: 'You have already signed',
    body: 'Thank you. We emailed you a copy of the signed guarantee.',
  },
  declined: { title: 'You declined this request', body: 'We have let the customer know.' },
}

const maskPhone = (p: string) =>
  p.length > 7 ? `${p.slice(0, 4)}•••••${p.slice(-4)}` : 'your phone'

/** Guarantor flow from the secure link (no account): who/what first, then ID, face check, about you, sign. */
export default async function GuaranteePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const g = await openGuarantee(token)
  const ctx = g.check === 'ok' && g.row ? await guaranteeContext(g.row) : null

  return (
    <>
      <header className="bg-brand-dark">
        <div className="mx-auto max-w-3xl px-4 py-3 sm:px-6">
          <span className="inline-flex rounded-md bg-white px-3 py-1.5">
            <Image
              src="/brand/go4solar-logo.png"
              alt={siteConfig.name}
              width={150}
              height={48}
              priority
              className="h-9 w-auto"
            />
          </span>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        {!ctx || !g.row ? (
          <section className="rounded-2xl border p-6 text-center" data-testid="guarantee-problem">
            <h1 className="text-brand-dark text-xl font-bold">
              {(PROBLEMS[g.check] ?? PROBLEMS.not_found!).title}
            </h1>
            <p className="text-muted-foreground mt-2">
              {(PROBLEMS[g.check] ?? PROBLEMS.not_found!).body}
            </p>
          </section>
        ) : (
          <GuarantorFlow
            token={token}
            current={nextGuarantorStep(
              (g.row.steps ?? {}) as Partial<Record<GuarantorStepId, boolean>>,
            )}
            invitedName={g.row.name}
            applicantName={ctx.applicantName}
            plan={{
              totalPayable: ctx.values.totalPayable ?? '',
              deposit: ctx.values.deposit ?? '',
              monthly: ctx.values.monthly ?? '',
              tenure: ctx.tenure,
            }}
            faceStatus={latestStatus(await checkSummaries(g.row.id), 'liveness')}
            text={ctx.text}
            phoneHint={maskPhone(g.row.phone)}
          />
        )}
      </main>
    </>
  )
}
