'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

import { lockTestMode, unlockTestMode } from '@/app/test-mode/actions'

export function TestModeForm({ on }: { on: boolean }) {
  const router = useRouter()
  const [secret, setSecret] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  if (on) {
    return (
      <div className="mt-3 space-y-3 text-sm">
        <p className="text-brand-green font-semibold">
          Test mode is unlocked on this browser for 30 days.
        </p>
        <p>You can now use the test checkout and &quot;Show test data&quot; in the back office.</p>
        <Button
          type="button"
          variant="outline"
          onClick={() => start(async () => (await lockTestMode(), router.refresh()))}
        >
          Lock it again
        </Button>
      </div>
    )
  }
  return (
    <form
      className="mt-3 space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        setError(null)
        start(async () => {
          const r = await unlockTestMode({ secret })
          if (r.ok) router.refresh()
          else setError(r.error ?? 'Could not unlock.')
        })
      }}
    >
      <div className="space-y-1">
        <Label htmlFor="test-secret">Test-mode secret</Label>
        <Input
          id="test-secret"
          type="password"
          autoComplete="off"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
        />
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
      <Button
        type="submit"
        disabled={pending}
        className="bg-brand-green hover:bg-brand-dark w-full"
      >
        Unlock test mode
      </Button>
    </form>
  )
}
