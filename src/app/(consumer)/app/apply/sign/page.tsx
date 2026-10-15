import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { ConsumerSign } from '@/components/agreements/ConsumerSign'
import { GuarantorPanel } from '@/components/agreements/GuarantorPanel'
import { SummaryCard } from '@/components/agreements/SummaryCard'
import { VerifyEmailGate } from '@/components/agreements/VerifyEmailGate'
import { loadConsumerSignContext } from '@/lib/agreements/consumer'
import { requireUser } from '@/lib/auth/roles'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Sign your agreement' }
export const dynamic = 'force-dynamic'

const maskPhone = (p: string) =>
  p.length > 7 ? `${p.slice(0, 4)}•••••${p.slice(-4)}` : 'your phone'

/** Terms step: plain summary → full agreement (scroll to end) → ticks → signature → phone code. */
export default async function SignPage() {
  const session = await requireUser('/app/apply/sign')
  const ctx = await loadConsumerSignContext(session.user!.id)
  if (!ctx) redirect('/app/apply')

  let pdfUrl: string | null = null
  if (ctx.signed) {
    // The signer's own folder in the private bucket: a short-lived link (10 minutes).
    const supabase = await createClient()
    const { data: row } = await supabase
      .from('agreements')
      .select('pdf_path')
      .eq('id', ctx.signed.id)
      .maybeSingle()
    if (row?.pdf_path) {
      const { data } = await supabase.storage.from('kyc').createSignedUrl(row.pdf_path, 600)
      pdfUrl = data?.signedUrl ?? null
    }
  }

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-6">
      <div>
        <p className="text-brand-green text-sm font-semibold">Reference {ctx.reference}</p>
        <h1 className="text-brand-dark text-2xl font-bold">Sign your payment plan agreement</h1>
      </div>

      {ctx.signed ? (
        <section className="border-brand-green rounded-2xl border-2 p-5" data-testid="signed-done">
          <h2 className="text-brand-dark text-lg font-bold">You have signed. Thank you.</h2>
          <p className="mt-1 text-sm">
            We emailed you a copy. Signed on{' '}
            {new Date(ctx.signed.signed_at).toLocaleString('en-GB', {
              timeZone: 'Africa/Lagos',
              dateStyle: 'long',
              timeStyle: 'short',
            })}
            .
          </p>
          {pdfUrl && (
            <a
              href={pdfUrl}
              className="text-brand-blue mt-2 inline-block text-sm font-semibold underline"
            >
              Download your signed agreement (PDF)
            </a>
          )}
          <p className="text-muted-foreground mt-3 text-xs break-all">
            Document fingerprint: {ctx.signed.content_sha256}
          </p>
          <Link
            href="/app/apply/pay"
            data-testid="next-deposit"
            className="bg-brand-green hover:bg-brand-dark mt-4 flex h-12 items-center justify-center rounded-md font-semibold text-white"
          >
            Next: pay your deposit
          </Link>
        </section>
      ) : (
        <>
          <SummaryCard v={ctx.values} businessName={ctx.isBusiness ? ctx.customerName : null} />
          {session.emailVerified ? (
            <ConsumerSign
              text={ctx.text}
              defaultName={ctx.signerName}
              defaultTitle={ctx.defaultTitle}
              isBusiness={ctx.isBusiness}
              phoneHint={maskPhone(ctx.phone)}
              lockAfterDays={ctx.lateFee.lockAfterDays}
            />
          ) : (
            <VerifyEmailGate email={session.user?.email ?? null} />
          )}
        </>
      )}

      <GuarantorPanel guarantee={ctx.guarantee} />
    </main>
  )
}
