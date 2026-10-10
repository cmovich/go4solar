import Image from 'next/image'
import Link from 'next/link'

import { EmailBanner } from '@/components/apply/EmailBanner'
import { Button } from '@/components/ui/button'
import { siteConfig } from '@/config/site'
import { requireUser } from '@/lib/auth/roles'

import { signOut } from '@/app/login/actions'

export const dynamic = 'force-dynamic'

/** Signed-in customer area. Shows the email banner until the email is verified. */
export default async function ConsumerAppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireUser('/app/apply')
  return (
    <>
      <header className="bg-brand-dark">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3 sm:px-6">
          <Link href="/" aria-label={`${siteConfig.name} home`}>
            <span className="inline-flex rounded-md bg-white px-3 py-1.5">
              <Image
                src="/brand/go4solar-logo.png"
                alt={siteConfig.name}
                width={150}
                height={48}
                priority
                className="h-9 w-auto"
              />
            </span>
          </Link>
          <form action={signOut}>
            <Button type="submit" size="sm" variant="outline">
              Sign out
            </Button>
          </form>
        </div>
      </header>
      {!session.emailVerified && session.user?.email && <EmailBanner email={session.user.email} />}
      {children}
    </>
  )
}
