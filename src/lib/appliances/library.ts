import { createClient } from '@supabase/supabase-js'

import type { LibraryItem } from '@/lib/calculator/store'

import { dayNightDefaults } from './defaults'
import { isCategoryId } from '@/lib/load/categories'
import type { Database } from '@/lib/supabase/database.types'
import { hasSupabaseEnv, publicSupabaseEnv } from '@/lib/supabase/env'

/**
 * Active appliance_library rows, ordered for display. Uses the anon key with no cookies, so
 * pages that call it can be statically cached. Returns [] (and logs) if the database is
 * unreachable or the env vars are missing; the calculator still works with custom items.
 */
export async function fetchApplianceLibrary(): Promise<LibraryItem[]> {
  if (!hasSupabaseEnv()) {
    console.warn('[appliances] Supabase env not set; appliance library is empty')
    return []
  }
  const { url, anonKey } = publicSupabaseEnv()
  const supabase = createClient<Database>(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data, error } = await supabase
    .from('appliance_library')
    // Every column: the day/night/essential defaults exist from migration 0024.
    .select('*')
    .eq('active', true)
    .order('category')
    .order('sort')

  if (error) {
    console.error('[appliances] could not load appliance_library:', error.message)
    return []
  }

  return data.flatMap((row) =>
    isCategoryId(row.category)
      ? [
          {
            id: row.id,
            category: row.category,
            name: row.name,
            defaultWatts: row.default_watts,
            surgeFactor: Number(row.surge_factor),
            dutyCycle: Number(row.duty_cycle),
            defaultHours: Number(row.default_hours),
            ...dayNightDefaults(row),
          },
        ]
      : [],
  )
}
