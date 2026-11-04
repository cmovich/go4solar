import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { hasSupabaseEnv } from '@/lib/supabase/env'

import { companyFrom, DEFAULT_COMPANY, type Company } from './schema'

/**
 * The company details (settings.company, admin "Company details"): invoices, the verify page, the
 * footer and the legal pages. Defaults when the setting cannot be read, so no page breaks.
 */
export async function loadCompany(): Promise<Company> {
  if (!hasSupabaseEnv()) return DEFAULT_COMPANY
  try {
    const { data, error } = await createAdminClient()
      .from('settings')
      .select('value')
      .eq('key', 'company')
      .maybeSingle()
    if (error) throw new Error(error.message)
    return companyFrom(data?.value)
  } catch (err) {
    console.error('[company] using the default details:', (err as Error).message)
    return DEFAULT_COMPANY
  }
}
