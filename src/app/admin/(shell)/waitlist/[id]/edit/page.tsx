import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { z } from 'zod'

import { ProfileEditor } from '@/components/admin/tradeLenda/ProfileEditor'
import { ConsentBlock } from '@/components/admin/waitlist/ConsentBlock'
import { OnboardingLinks } from '@/components/admin/waitlist/OnboardingLinks'
import { onboardingWhatsappHref } from '@/lib/exports/onboarding'
import { onboardingLinksFor } from '@/lib/exports/onboardingServer'
import { canTickConsent } from '@/lib/auth/staffRoles'
import { consentPanel } from '@/lib/exports/consents'
import { requireLeadProfileEditor } from '@/lib/auth/roles'
import { NG_STATE_IDS } from '@/lib/nigeria/states'
import { quoteReference } from '@/lib/quotes/quote'
import { loadProfileView } from '@/lib/tradeLenda/server'

export const metadata: Metadata = { title: 'Edit profile' }
export const dynamic = 'force-dynamic'

/** Admin → Waiting list → Edit (super admin, Operations, Sales; both Complete and Incomplete). */
/** What the waiting list already has: the plan or system the person chose ("" when none). */
function ownPlan(lead: { builder: unknown; chosen_plan: string | null }): string {
  const b = lead.builder as { kind?: string; plan?: { slug?: string } } | null
  if (b?.kind === 'ready' && b.plan?.slug) return `ready:${b.plan.slug}`
  if (b && (b.kind === 'builder' || !b.kind)) return 'builder:builder'
  return lead.chosen_plan ? `estimate:${lead.chosen_plan}` : ''
}

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
        <Link
          href={`/admin/waitlist?tab=${lead.status === 'complete' ? 'complete' : 'incomplete'}`}
          className="text-brand-blue underline"
        >
          ‹ Waiting list
        </Link>
      </p>
      <h1 className="text-brand-dark mt-2 text-2xl font-bold">
        {[lead.first_name, lead.surname].filter(Boolean).join(' ') || 'Waiting-list entry'}
      </h1>
      <p className="text-muted-foreground text-sm">
        {quoteReference(lead.id)} · {lead.phone_e164}
        {lead.is_test ? ' · test data' : ''}
        {' · '}Edit profile
      </p>
      <ProfileEditor
        waitlistId={id}
        role={session.role ?? ''}
        states={[...NG_STATE_IDS]}
        initial={{
          customerType: values.customerType ?? '',
          businessName: values.businessName ?? '',
          contactRole: values.contactRole ?? '',
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
          guarantorName: profile?.guarantor_name ?? '',
          guarantorPhone: profile?.guarantor_phone_e164 ?? '',
          guarantorRelationship: profile?.guarantor_relationship ?? '',
          guarantorAddress: profile?.guarantor_address ?? '',
          plan:
            values.planKind && values.planRef
              ? `${values.planKind}:${values.planRef}`
              : ownPlan(lead),
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
      <OnboardingLinks
        waitlistId={id}
        links={(await onboardingLinksFor(id)).map((l) => ({
          ...l,
          whatsappHref: onboardingWhatsappHref({
            phone: lead.whatsapp_e164 ?? lead.phone_e164,
            firstName: lead.first_name,
            funderName: l.funderName,
            url: l.url,
          }),
          hasEmail: Boolean(lead.email),
        }))}
      />
      <ConsentBlock
        waitlistId={id}
        canTick={canTickConsent(session.role)}
        funders={await consentPanel({
          waitlistId: id,
          isTest: lead.is_test,
          values,
          ticks: {
            phoneVerifiedAt: view.ticks.phoneVerifiedAt,
            figuresAgreedAt: view.ticks.figuresAgreedAt,
          },
        })}
      />
    </main>
  )
}
