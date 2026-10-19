import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { PartnersAdmin, type PartnerRow } from '@/components/admin/content/PartnersAdmin'
import { requireStaffWithMfa } from '@/lib/auth/roles'
import { siteMediaUrl } from '@/lib/content/server'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Partners' }
export const dynamic = 'force-dynamic'

/** Super admin and content staff: the "Our partners" logo row on the home page. */
export default async function PartnersAdminPage() {
  const session = await requireStaffWithMfa()
  if (session.role !== 'super_admin' && session.role !== 'content') redirect('/admin')
  const { data, error } = await (
    await createClient()
  )
    .from('partners')
    .select('*')
    .order('sort_order')
  const rows: PartnerRow[] = (data ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    logo: p.logo,
    logoUrl: siteMediaUrl(p.logo),
    websiteUrl: p.website_url ?? '',
    active: p.active,
    isTest: p.is_test,
  }))
  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <h1 className="text-brand-dark text-3xl font-bold">Partners</h1>
      <p className="text-muted-foreground mt-1 mb-6 text-sm">
        The &ldquo;Our partners&rdquo; row on the home page, in this order. Hidden partners are not
        shown; with none showing the row is hidden.
      </p>
      {error ? (
        <p className="text-destructive text-sm" role="alert">
          Partners are not set up yet (the database update has not been applied).
        </p>
      ) : (
        <PartnersAdmin rows={rows} />
      )}
    </main>
  )
}
