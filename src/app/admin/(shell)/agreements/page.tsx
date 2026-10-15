import type { Metadata } from 'next'

import { TemplatesEditor, type TemplateView } from '@/components/admin/agreements/TemplatesEditor'
import { requireRole } from '@/lib/auth/roles'
import { createAdminClient } from '@/lib/supabase/admin'

export const metadata: Metadata = { title: 'Agreements' }
export const dynamic = 'force-dynamic'

/** super_admin: agreement templates, versions, approval. Signed agreements keep the version they used. */
export default async function AgreementsPage() {
  await requireRole('super_admin')
  const admin = createAdminClient()
  const [{ data: templates }, { data: signed }] = await Promise.all([
    admin
      .from('agreement_templates')
      .select('id, type, version, status, body_md, approved_at, created_at')
      .order('type')
      .order('version', { ascending: false }),
    admin.from('agreements').select('template_id'),
  ])
  const uses = new Map<string, number>()
  for (const a of signed ?? []) uses.set(a.template_id, (uses.get(a.template_id) ?? 0) + 1)
  const rows: TemplateView[] = (templates ?? []).map((t) => ({
    ...t,
    signedCount: uses.get(t.id) ?? 0,
  }))
  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <h1 className="text-brand-dark text-3xl font-bold">Agreements</h1>
      <p className="text-muted-foreground mt-1 mb-6 text-sm">
        Templates carry &ldquo;DRAFT — lawyer review required&rdquo; until you approve a version.
        New signers get the newest approved version (or the newest draft if none is approved).
        Signed agreements never change.
      </p>
      <TemplatesEditor rows={rows} />
    </main>
  )
}
