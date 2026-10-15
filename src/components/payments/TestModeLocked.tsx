import Link from 'next/link'

/** Shown on a preview when the mock (test) checkout is opened before test mode is unlocked. */
export function TestModeLocked() {
  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <div
        className="rounded-2xl border-2 border-dashed border-amber-400 bg-white p-6"
        data-testid="test-mode-locked"
      >
        <h1 className="text-brand-dark text-xl font-bold">Test mode is locked</h1>
        <p className="mt-2 text-sm">
          This is the test checkout. On a preview it only opens after you unlock test mode with the
          test-mode secret.
        </p>
        <Link
          href="/test-mode"
          className="text-brand-blue mt-4 inline-block font-semibold underline"
        >
          Unlock test mode
        </Link>
      </div>
    </main>
  )
}
