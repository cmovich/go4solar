import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { z } from 'zod'

import { ProfileEditor } from '@/components/admin/tradeLenda/ProfileEditor'
import { requireLeadProfileEditor } from '@/lib/auth/roles'
import { NG_STATE_IDS } from '@/lib/nigeria/states'
import { quoteReference } from '@/lib/quotes/quote'
import { loadProfileView } from '@/lib/tradeLenda/server'

export const metadata: Metadata = { title: 'Complete profile' }
export const dynamic = 'force-dynamic'

/** Admin → Waiting list → Edit / Complete profile (super admin, Operations, Sales). */
export default async function LeadProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireLeadProfileEditor()
  const { id } = await params
  if (!z.uuid().safeParse(id).success) notFound()
  const view = await loadProfileView(id)
  if (!view) notFound()
  const { lead, profile, values } = view
  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <p className="text-sm">
        <Link href="/admin/waitlist/profiles" className="text-brand-blue underline">
          ‹ Trade Lenda profiles
        </Link>
      </p>
      <h1 className="text-brand-dark mt-2 text-2xl font-bold">
        {[lead.first_name, lead.surname].filter(Boolean).join(' ') || 'Waiting-list entry'}
      </h1>
      <p className="text-muted-foreground text-sm">
        {quoteReference(lead.id)} · {lead.phone_e164}
        {lead.is_test ? ' · test data' : ''}
      </p>
      <ProfileEditor
        waitlistId={id}
        role={session.role ?? ''}
        states={[...NG_STATE_IDS]}
        initial={{
          firstName: lead.first_name ?? '',
          surname: lead.surname ?? '',
          otherNames: profile?.other_names ?? '',
          dateOfBirth: profile?.date_of_birth ?? '',
          email: lead.email ?? '',
          whatsapp: lead.whatsapp_e164 ?? '',
          state: lead.state ?? '',
          lga: lead.lga ?? '',
          street: profile?.street ?? '',
          landmark: profile?.landmark ?? '',
          employmentType: profile?.employment_type ?? '',
          employer: profile?.employer ?? '',
          jobTitle: profile?.job_title ?? '',
          incomeRange: profile?.income_range ?? '',
          ninLast4: profile?.nin_last4 ?? null,
          bvnLast4: profile?.bvn_last4 ?? null,
          guarantorName: profile?.guarantor_name ?? '',
          guarantorPhone: profile?.guarantor_phone_e164 ?? '',
          guarantorRelationship: profile?.guarantor_relationship ?? '',
          guarantorAddress: profile?.guarantor_address ?? '',
          plan: values.planKind && values.planRef ? `${values.planKind}:${values.planRef}` : '',
          depositPct: values.depositShare === null ? 20 : Math.round(values.depositShare * 100),
          months: values.months ?? 12,
        }}
        choices={view.choices}
        completeness={view.completeness}
        figures={view.figures}
        lendingTypes={view.funder?.lendingTypes ?? []}
        defaultLendingType={view.funder?.defaultLendingType ?? 'customer'}
        ticks={view.ticks}
        batches={view.batches}
      />
    </main>
  )
}
