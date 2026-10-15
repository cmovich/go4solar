import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

import type { Database } from './database.types'
import { publicSupabaseEnv } from './env'

/**
 * Supabase client for Server Components, Server Actions and Route Handlers.
 * Runs as the logged-in user (RLS applies). Create a new one per request.
 */
export async function createClient() {
  // Read cookies first: it marks the page as dynamic, so the build never tries to
  // prerender it (and never needs the env vars at build time).
  const cookieStore = await cookies()
  const { url, anonKey } = publicSupabaseEnv()

  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        } catch {
          // Called from a Server Component: cookies are read-only there. The middleware
          // refreshes the session, so this is safe to ignore.
        }
      },
    },
  })
}
