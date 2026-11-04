'use client'

import { useEffect } from 'react'

import { CompanyContact } from '@/components/company/CompanyContact'
import { clearSavedProgress, reportClientError } from '@/components/monitoring/report'

/** Last resort when the root layout itself fails: plain HTML, brand colours, no details. */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => reportClientError('boundary', error), [error])
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily: 'Inter, system-ui, sans-serif',
          background: '#0E3B22',
          color: '#fff',
        }}
      >
        <main
          style={{
            minHeight: '100vh',
            display: 'grid',
            placeItems: 'center',
            textAlign: 'center',
            padding: 24,
          }}
        >
          <div>
            <p style={{ color: '#FFC94D', fontWeight: 700, letterSpacing: 3 }}>500</p>
            <h1>Something went wrong on our side</h1>
            <p>
              Please try again in a moment. <CompanyContact />
            </p>
            <button
              type="button"
              onClick={reset}
              style={{
                marginTop: 16,
                padding: '12px 24px',
                fontWeight: 700,
                background: '#FFC94D',
                color: '#0E3B22',
                border: 0,
                borderRadius: 8,
              }}
            >
              Try again
            </button>
            <p>
              <button
                type="button"
                onClick={clearSavedProgress}
                style={{
                  marginTop: 16,
                  background: 'none',
                  border: 0,
                  color: '#fff',
                  textDecoration: 'underline',
                }}
              >
                Start again (clears the system and appliance list saved on this device)
              </button>
            </p>
          </div>
        </main>
      </body>
    </html>
  )
}
