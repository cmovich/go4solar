import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { siteConfig } from '@/config/site'
import { isStaffRole } from '@/lib/auth/roles'
import { getSessionInfo } from '@/lib/auth/session'

import { LoginForm } from './LoginForm'

export const metadata: Metadata = { title: 'Sign in' }

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const { next } = await searchParams

  // Already signed in: skip the form.
  const { user, role } = await getSessionInfo()
  if (user) redirect(isStaffRole(role) ? '/admin' : (next ?? '/'))

  return (
    <main className="bg-brand-mist flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm space-y-6">
        <Link href="/" className="flex justify-center">
          <Image
            src="/brand/go4solar-logo.png"
            alt={siteConfig.name}
            width={160}
            height={52}
            priority
            className="h-12 w-auto"
          />
        </Link>
        <Card>
          <CardHeader>
            <CardTitle className="text-brand-dark">Sign in to Go4Solar</CardTitle>
            <CardDescription>Use the email and password for your account.</CardDescription>
          </CardHeader>
          <CardContent>
            <LoginForm next={next} />
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
