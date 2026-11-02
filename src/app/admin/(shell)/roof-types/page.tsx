import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { RoofTypesAdmin, type RoofTypeRow } from '@/components/admin/content/RoofTypesAdmin'
import { requireStaffWithMfa } from '@/lib/auth/roles'
import { siteMediaUrl } from '@/lib/content/server'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Roof types' }
export const dynamic = 'force-dynamic'

/** Super admin and content staff: the roof picture cards in the quote questions. */
export default async function RoofTypesAdminPage() {
  const session = await requireStaffWithMfa()
  if (session.role !== 'super_admin' && session.role !== 'content') redirect('/admin')
  const { data, error } = await (
    await createClient()
  )
    .from('roof_types')
    .select('*')
    .order('sort_order')
  const rows: RoofTypeRow[] = (data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description ?? '',
    photo: r.photo,
    photoUrl: siteMediaUrl(r.photo),
    needsRack: r.needs_rack,
    active: r.active,
    sample: r.sample,
    ...('install_price' in r
      ? {
          installPrice: Number(r.install_price ?? 0),
          installPriceUnit:
            r.install_price_unit === 'per_kw' ? ('per_kw' as const) : ('per_panel' as const),
        }
      : {}),
  }))
  const canPrice =
    session.role === 'super_admin' &&
    rows.every((r) => r.installPrice !== undefined) &&
    rows.length > 0
  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <h1 className="text-brand-dark text-3xl font-bold">Roof types</h1>
      <p className="text-muted-foreground mt-1 mb-6 text-sm">
        The picture cards customers choose from in the quote questions (&ldquo;What type of roof do
        you have?&rdquo;), in this order. &ldquo;Needs a rack&rdquo; shows an alert when the
        customer does not want one. A super admin sets the installation extra for each roof (per
        panel or per kW, never marked up).
      </p>
      {error ? (
        <p className="text-destructive text-sm" role="alert">
          Roof types are not set up yet (migration 0026 has not been applied).
        </p>
      ) : (
        <RoofTypesAdmin rows={rows} canPrice={canPrice} />
      )}
    </main>
  )
}
