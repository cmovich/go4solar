import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { STAFF_ROLES, requireRole } from '@/lib/auth/roles'

import { MfaSetup } from './MfaSetup'

export const metadata: Metadata = { title: 'Two-factor login' }

// Depends on the visitor's session: never prerendered at build time.
export const dynamic = 'force-dynamic'

export default async function MfaPage() {
  // Staff only; a consumer never sees this page.
  const { aal } = await requireRole(...STAFF_ROLES)
  if (aal === 'aal2') redirect('/admin')

  return (
    <main className="bg-brand-mist flex min-h-screen items-center justify-center px-4 py-12">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-brand-dark">Two-factor login</CardTitle>
          <CardDescription>
            Staff accounts need a code from an authenticator app before reaching the back office.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MfaSetup />
        </CardContent>
      </Card>
    </main>
  )
}
