'use client'

import { ErrorScreen } from '@/components/brand/ErrorScreen'

/** Any page that fails: a friendly message, never a stack trace. */
export default function Error({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <ErrorScreen
      code="500"
      title="Something went wrong on our side"
      body="Nothing you did caused this. Please try again in a moment. If it keeps happening, contact us and we will help."
      action={
        <button
          type="button"
          onClick={reset}
          className="rounded-lg border border-white px-6 py-3 font-semibold focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
        >
          Try again
        </button>
      }
    />
  )
}
