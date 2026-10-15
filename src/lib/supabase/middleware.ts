import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

import type { Database } from './database.types'
import { hasSupabaseEnv, publicSupabaseEnv } from './env'

/**
 * Refreshes the Supabase auth cookies on every request so Server Components always see a
 * valid session. Page-level guards (src/lib/auth/roles.ts) decide who may see what.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request })

  // Without the Supabase vars the public site must still load. Pages that need Supabase
  // throw a clear "Missing NEXT_PUBLIC_SUPABASE_URL…" error when they call createClient().
  if (!hasSupabaseEnv()) {
    console.warn('[supabase] NEXT_PUBLIC_SUPABASE_URL / ANON_KEY not set; skipping session refresh')
    return response
  }
  const { url, anonKey } = publicSupabaseEnv()

  const supabase = createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        )
      },
    },
  })

  // Do not add code between createServerClient and getUser(): it can log users out at random.
  await supabase.auth.getUser()

  return response
}
