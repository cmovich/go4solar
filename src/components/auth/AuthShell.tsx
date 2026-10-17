import Image from 'next/image'
import Link from 'next/link'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { siteConfig } from '@/config/site'

/** Branded frame for the sign-in, password and link pages (logo above one card). */
export function AuthShell({
  title,
  description,
  children,
}: {
  title: string
  description?: React.ReactNode
  children: React.ReactNode
}) {
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
            <CardTitle className="text-brand-dark">{title}</CardTitle>
            {description && <CardDescription>{description}</CardDescription>}
          </CardHeader>
          <CardContent>{children}</CardContent>
        </Card>
      </div>
    </main>
  )
}

/** Shown for a used or expired invite / password link: how to get a new one. */
export function LinkExpired() {
  return (
    <div className="space-y-4 text-sm" data-testid="link-expired">
      <p className="rounded-md bg-amber-50 px-4 py-3 text-amber-900" role="status">
        This link has expired or was already used. Each link works once and expires after 1 hour.
      </p>
      <p className="text-muted-foreground">
        Get a new link by email below. Staff who were invited can also ask a super admin to press
        &ldquo;Resend invite&rdquo; on the Staff page.
      </p>
      <Link
        href="/forgot-password"
        className="bg-brand-green hover:bg-brand-green/90 inline-flex h-11 w-full items-center justify-center rounded-md px-4 font-semibold text-white"
      >
        Get a new link
      </Link>
    </div>
  )
}
