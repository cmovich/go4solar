'use client'

import { BUILDER_STORAGE_KEY } from '@/lib/build/store'
import { STORAGE_KEY as CALCULATOR_STORAGE_KEY } from '@/lib/calculator/store'

/**
 * "Start again": after a confirmation, forgets the appliance list (and builder progress) saved in
 * this browser and opens the calculator afresh. Anything already sent to us is kept.
 */
export function StartAgain({ className = '' }: { className?: string }) {
  return (
    <button
      type="button"
      className={`text-brand-blue min-h-11 text-sm font-semibold underline ${className}`}
      data-testid="start-again"
      onClick={() => {
        if (!window.confirm('Start again? Your appliance list on this device will be cleared.')) {
          return
        }
        try {
          window.localStorage.removeItem(CALCULATOR_STORAGE_KEY)
          window.localStorage.removeItem(BUILDER_STORAGE_KEY)
        } catch {
          // Storage blocked: nothing saved to clear.
        }
        window.location.href = '/waitlist'
      }}
    >
      Start again
    </button>
  )
}
