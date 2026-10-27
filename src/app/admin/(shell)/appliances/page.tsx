import type { Metadata } from 'next'

import {
  ApplianceEditor,
  type ApplianceRowView,
} from '@/components/admin/appliances/ApplianceEditor'
import { requireRole } from '@/lib/auth/roles'
import { isCategoryId } from '@/lib/load/categories'
import { dayNightDefaults } from '@/lib/appliances/defaults'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Appliances' }

/** The calculator's library. super_admin edits; operations and content can view. */
export default async function AppliancesPage() {
  const session = await requireRole('super_admin', 'operations', 'content')
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('appliance_library')
    .select('*')
    .order('category')
    .order('sort')
  if (error) throw new Error(error.message)

  const rows: ApplianceRowView[] = data.flatMap((r) =>
    isCategoryId(r.category)
      ? [
          {
            id: r.id,
            category: r.category,
            name: r.name,
            defaultWatts: r.default_watts,
            surgeFactor: Number(r.surge_factor),
            dutyCycle: Number(r.duty_cycle),
            ...dayNightDefaults(r),
            sort: r.sort,
            active: r.active,
          },
        ]
      : [],
  )

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <h1 className="text-brand-dark text-3xl font-bold">Appliances</h1>
      <p className="text-muted-foreground mt-1 mb-6 text-sm">
        Default watts, start-up surge, duty cycle, hours in the day and at night, and whether the
        item starts ticked as essential, for every item in the calculator. Changes reach the
        calculator within the hour.
      </p>
      <ApplianceEditor rows={rows} canEdit={session.role === 'super_admin'} />
    </main>
  )
}
