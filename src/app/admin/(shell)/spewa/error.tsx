'use client'

import { Button } from '@/components/ui/button'

/** SPEWA approvals: if a page part still fails, a short message (inside the admin frame). */
export default function SpewaError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6" data-testid="spewa-error">
      <h1 className="text-brand-dark text-2xl font-bold">SPEWA approvals</h1>
      <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
        Some file details could not be shown (quote details unavailable). Nothing was changed.
      </p>
      <Button type="button" className="mt-4" onClick={reset}>
        Try again
      </Button>
    </main>
  )
}
