import 'server-only'

import { createClient } from '@supabase/supabase-js'

import { siteMediaUrl } from '@/lib/content/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Database } from '@/lib/supabase/database.types'
import { hasSupabaseEnv, publicSupabaseEnv } from '@/lib/supabase/env'

import { DEFAULT_WIRING, wiringSchema, type WiringSettings } from './questions'

export type RoofTypeCard = {
  id: string
  name: string
  description: string | null
  photoUrl: string | null
  needsRack: boolean
}

/**
 * Active roof types for the wizard's picture cards. Anonymous read (no cookies), so the page stays
 * cached; [] before migration 0026 or when the database cannot be reached.
 */
export async function fetchRoofTypes(): Promise<RoofTypeCard[]> {
  if (!hasSupabaseEnv()) return []
  const { url, anonKey } = publicSupabaseEnv()
  const supabase = createClient<Database>(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await supabase
    .from('roof_types')
    .select('id, name, description, photo, needs_rack')
    .eq('active', true)
    .order('sort_order')
  if (error) {
    console.error('[wizard] could not load roof types:', error.message)
    return []
  }
  return data.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    photoUrl: siteMediaUrl(r.photo),
    needsRack: r.needs_rack,
  }))
}

/** The wire-estimate setting (staff-only table: read with the service role on the server). */
export async function fetchWiring(): Promise<WiringSettings> {
  if (!hasSupabaseEnv() || !process.env.SUPABASE_SERVICE_ROLE_KEY) return DEFAULT_WIRING
  const { data } = await createAdminClient()
    .from('settings')
    .select('value')
    .eq('key', 'wiring')
    .maybeSingle()
  const parsed = wiringSchema.safeParse(data?.value)
  return parsed.success ? parsed.data : DEFAULT_WIRING
}
