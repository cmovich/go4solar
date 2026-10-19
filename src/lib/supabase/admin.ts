import 'server-only'

import { createClient as createSupabaseClient } from '@supabase/supabase-js'

import { actorFetch } from './actor'
import type { Database } from './database.types'
import { publicSupabaseEnv } from './env'

/**
 * Service-role client. Bypasses RLS, so use it only in server code that has already
 * checked who is calling (webhooks, outbox writes, admin scripts). Never import from a
 * client component: `server-only` makes that a build error.
 */
export function createAdminClient() {
  const { url } = publicSupabaseEnv()
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceRoleKey) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY')

  return createSupabaseClient<Database>(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    // Writes carry the signed-in staff member's id for the audit triggers.
    global: { fetch: actorFetch() },
  })
}
