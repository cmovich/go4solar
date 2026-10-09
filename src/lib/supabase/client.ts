'use client'

import { createBrowserClient } from '@supabase/ssr'

import type { Database } from './database.types'
import { publicSupabaseEnv } from './env'

/** Supabase client for Client Components. Uses the anon key; RLS applies. */
export function createClient() {
  const { url, anonKey } = publicSupabaseEnv()
  return createBrowserClient<Database>(url, anonKey)
}
