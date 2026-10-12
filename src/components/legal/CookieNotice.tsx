'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

const KEY = 'g4s.cookie-notice.v1'

/** Essential cookies only, so this informs rather than asks. Dismissal is remembered on this device. */
export function CookieNotice() {
  const [show, setShow] = useState(false)
  const path = usePathname()
  useEffect(() => {
    try {
      setShow(window.localStorage.getItem(KEY) !== 'seen')
    } catch {
      setShow(true)
    }
  }, [])
  // Staff in the back office are not visitors.
  if (!show || path?.startsWith('/admin')) return null
  return (
    <div
      role="region"
      aria-label="Cookie notice"
      data-testid="cookie-notice"
      className="bg-brand-dark fixed inset-x-0 bottom-0 z-50 px-4 py-3 text-sm text-white shadow-lg"
    >
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
        <p>
          We use essential cookies only, to keep you signed in and remember your progress. No
          advertising or tracking.{' '}
          <Link href="/privacy" className="text-brand-gold underline">
            Privacy policy
          </Link>
        </p>
        <button
          type="button"
          className="bg-brand-gold text-brand-dark rounded-md px-4 py-2 font-semibold focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
          onClick={() => {
            try {
              window.localStorage.setItem(KEY, 'seen')
            } catch {
              /* private mode: just hide it for now */
            }
            setShow(false)
          }}
        >
          OK
        </button>
      </div>
    </div>
  )
}
