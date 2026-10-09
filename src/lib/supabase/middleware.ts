import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

import type { Database } from './database.types'
import { publicSupabaseEnv } from './env'

/**
 * Refreshes the Supabase auth cookies on every request so Server Components always see a
 * valid session. Page-level guards (src/lib/auth/roles.ts) decide who may see what.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  const { url, anonKey } = publicSupabaseEnv()
  let response = NextResponse.next({ request })

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
