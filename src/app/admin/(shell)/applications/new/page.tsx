import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import {
  AssistedApplicationForm,
  type LeadOption,
} from '@/components/admin/applications/AssistedApplicationForm'
import { requireStaffWithMfa } from '@/lib/auth/roles'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'New application for a customer' }
export const dynamic = 'force-dynamic'

/** Assisted entry (permission or super admin). */
export default async function NewAssistedApplicationPage() {
  const session = await requireStaffWithMfa()
  if (session.role !== 'super_admin') {
    const { data } = await (
      await createClient()
    ).rpc('has_permission', { target: 'assisted_entry' })
    if (data !== true) redirect('/admin')
  }
  const { data } = await createAdminClient()
    .from('waitlist_consumers')
    .select('id, first_name, surname, phone_e164, state, email, estimate')
    .not('estimate', 'is', null)
    .order('created_at', { ascending: false })
    .limit(500)
  const leads: LeadOption[] = (data ?? [])
    .filter((l) => l.first_name && l.phone_e164 && l.state)
    .map((l) => ({
      id: l.id,
      name: [l.first_name, l.surname].filter(Boolean).join(' '),
      phone: l.phone_e164,
      state: l.state!,
      email: l.email,
    }))
  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <Link href="/admin/applications" className="text-brand-blue text-sm underline">
        ← Applications
      </Link>
      <h1 className="text-brand-dark mt-2 text-2xl font-bold">
        New application on behalf of a customer
      </h1>
      <p className="text-muted-foreground mb-6 text-sm">
        For customers without a smartphone or with poor network, or who call or walk in.
      </p>
      <AssistedApplicationForm leads={leads} />
    </main>
  )
}
