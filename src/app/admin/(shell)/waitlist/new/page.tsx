import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { AssistedEntryForm } from '@/components/admin/waitlist/AssistedEntryForm'
import { photoLookupAvailable } from '@/lib/providers/vision/available'
import { requireStaffWithMfa } from '@/lib/auth/roles'
import { fetchApplianceLibrary } from '@/lib/appliances/library'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Add on behalf of customer' }
export const dynamic = 'force-dynamic'

export default async function AssistedEntryPage() {
  const session = await requireStaffWithMfa()
  const supabase = await createClient()
  const { data: allowed } = await supabase.rpc('has_permission', { target: 'assisted_entry' })
  if (!allowed && session.role !== 'super_admin') redirect('/admin/waitlist')

  const library = await fetchApplianceLibrary()

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <Link href="/admin/waitlist" className="text-brand-blue text-sm underline">
        ← Back to the waiting list
      </Link>
      <h1 className="text-brand-dark mt-3 text-3xl font-bold">Add on behalf of customer</h1>
      <p className="text-muted-foreground mt-1 text-sm">
        For walk-ins, phone calls and field visits. The record shows you as the person who entered
        it, and the customer still receives the confirmation.
      </p>
      <div className="mt-8">
        <AssistedEntryForm library={library} photoLookup={photoLookupAvailable()} />
      </div>
    </main>
  )
}
