'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

import { launchMode } from '@/config/site'
import { accountLink, hasAuthCookie } from '@/lib/site/account'

/**
 * "Sign in" (or "My account" when signed in) for the site header and footer. Live mode only:
 * in prelaunch the site is waiting-list only. The sign-in check reads the cookie in the browser,
 * so the cached home page stays cached.
 */
export function AccountLink({
  className,
  place,
}: {
  className?: string
  place: 'header' | 'footer'
}) {
  const [signedIn, setSignedIn] = useState(false)
  useEffect(() => setSignedIn(hasAuthCookie(document.cookie)), [])
  const link = accountLink(launchMode(), signedIn)
  if (!link) return null
  return (
    <Link
      href={link.href}
      prefetch={false}
      className={className}
      data-testid={`account-link-${place}`}
    >
      {link.label}
    </Link>
  )
}
