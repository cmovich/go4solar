import { NextResponse } from 'next/server'

import { companyPhones } from '@/lib/company/schema'
import { loadCompany } from '@/lib/company/server'

export const dynamic = 'force-dynamic'

/**
 * The public contact details from the admin "Company details" setting, for screens that run in
 * the browser (the error pages). Only what the footer already shows.
 */
export async function GET() {
  const c = await loadCompany()
  return NextResponse.json(
    { name: c.name, email: c.email, phones: companyPhones(c.phone), website: c.website },
    { headers: { 'cache-control': 'public, max-age=60, s-maxage=300' } },
  )
}
