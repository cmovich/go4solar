import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'

import { companyFrom, type Company } from './schema'

/** The company details for invoices and the verify page (settings.company; defaults if missing). */
export async function loadCompany(): Promise<Company> {
  const { data } = await createAdminClient()
    .from('settings')
    .select('value')
    .eq('key', 'company')
    .maybeSingle()
  return companyFrom(data?.value)
}
