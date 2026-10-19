import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import {
  TestimonialsAdmin,
  type TestimonialRow,
} from '@/components/admin/content/TestimonialsAdmin'
import { requireStaffWithMfa } from '@/lib/auth/roles'
import { siteMediaUrl } from '@/lib/content/server'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Testimonials' }
export const dynamic = 'force-dynamic'

/** Super admin and content staff: the home-page testimonial carousel. */
export default async function TestimonialsPage() {
  const session = await requireStaffWithMfa()
  if (session.role !== 'super_admin' && session.role !== 'content') redirect('/admin')
  const { data, error } = await (
    await createClient()
  )
    .from('testimonials')
    .select('*')
    .order('sort_order')
  const rows: TestimonialRow[] = (data ?? []).map((t) => ({
    id: t.id,
    clientName: t.client_name,
    clientCity: t.client_city,
    clientQuote: t.client_quote,
    systemSize: t.system_size,
    installerName: t.installer_name,
    installerPhoto: t.installer_photo,
    jobPhoto: t.job_photo,
    installerPhotoUrl: siteMediaUrl(t.installer_photo),
    jobPhotoUrl: siteMediaUrl(t.job_photo),
    consentClient: t.consent_client,
    consentInstaller: t.consent_installer,
    published: t.published,
    isTest: t.is_test,
  }))
  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <h1 className="text-brand-dark text-3xl font-bold">Testimonials</h1>
      <p className="text-muted-foreground mt-1 mb-6 text-sm">
        Shown as a carousel on the home page, in this order. Only published testimonials with
        written consent from both the client and the installer appear; with none published the
        section is hidden.
      </p>
      {error ? (
        <p className="text-destructive text-sm" role="alert">
          Testimonials are not set up yet (the database update has not been applied).
        </p>
      ) : (
        <TestimonialsAdmin rows={rows} />
      )}
    </main>
  )
}
