import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { TestModeForm } from '@/components/payments/TestModeForm'
import { deployEnv } from '@/lib/testmode/policy'
import { testSwitchesOn } from '@/lib/testmode/server'

export const metadata: Metadata = { title: 'Test mode', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

/** Previews only: unlock the test-only switches with TEST_MODE_SECRET. 404 in production. */
export default async function TestModePage() {
  const env = deployEnv()
  if (env === 'production') notFound()
  const on = await testSwitchesOn()
  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <h1 className="text-brand-dark text-2xl font-bold">Test mode</h1>
      {env === 'local' ? (
        <p className="mt-2 text-sm">
          On your own computer test mode is always on. Nothing to unlock.
        </p>
      ) : (
        <TestModeForm on={on} />
      )}
    </main>
  )
}
