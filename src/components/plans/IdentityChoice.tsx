'use client'

import Link from 'next/link'
import { useTransition } from 'react'

import { Button } from '@/components/ui/button'

import { signOutForQuote } from '@/app/(public)/account/actions'
import { signedInAsMessage } from '@/app/(public)/account/messages'

/**
 * The browser is signed in as someone other than the person this quote is for: continue as
 * the signed-in account, or sign out so the quote's person can make their own account.
 */
export function IdentityChoice({
  quoteId,
  accountName,
  quoteFirstName,
}: {
  quoteId: string
  accountName: string | null
  quoteFirstName: string
}) {
  const [pending, start] = useTransition()
  const who = accountName || 'another account'
  return (
    <div className="space-y-4" data-testid="identity-choice">
      <p className="rounded-lg border-2 border-amber-400 bg-amber-50 px-4 py-3 text-amber-950">
        {signedInAsMessage(accountName)}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Button asChild variant="outline" className="h-12 text-base">
          <Link href={`/account?quote=${quoteId}&as=account`}>Continue as {who}</Link>
        </Button>
        <Button
          type="button"
          className="h-12 text-base"
          disabled={pending}
          onClick={() => start(() => signOutForQuote({ quoteId }))}
        >
          Sign out and apply as {quoteFirstName}
        </Button>
      </div>
      <p className="text-muted-foreground text-sm">
        Continuing as {who} uses {who}&apos;s own details, ID checks and phone. The quote is then
        theirs.
      </p>
    </div>
  )
}
