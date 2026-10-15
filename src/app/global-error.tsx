'use client'

/** Last resort when the root layout itself fails: plain HTML, brand colours, no details. */
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
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
            <p>Please try again in a moment. Contact@go4solar.app · 08182112423</p>
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
          </div>
        </main>
      </body>
    </html>
  )
}
