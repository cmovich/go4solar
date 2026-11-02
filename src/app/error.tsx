'use client'

import { useEffect } from 'react'

import { ErrorScreen } from '@/components/brand/ErrorScreen'
import { clearSavedProgress, reportClientError } from '@/components/monitoring/report'

/**
 * Any page that fails: a friendly message, never a stack trace. The cause goes to the server log;
 * "Start again" clears progress saved in this browser in case that is what broke the page.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => reportClientError('boundary', error), [error])
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
      secondary={
        <button
          type="button"
          onClick={clearSavedProgress}
          className="text-white/80 underline"
          data-testid="start-again"
        >
          Start again (clears the system and appliance list saved on this device)
        </button>
      }
    />
  )
}
