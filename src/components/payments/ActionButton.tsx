'use client'

import { Loader2 } from 'lucide-react'
import { useState, useTransition } from 'react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

type Result = { ok: true; url: string } | { ok: false; error: string; missing?: string[] }

/** Runs a server action, then goes to the URL it returns (a checkout page, a bank, or back home). */
export function ActionButton({
  action,
  children,
  variant = 'default',
  className = '',
  testId,
}: {
  action: () => Promise<Result>
  children: React.ReactNode
  variant?: 'default' | 'outline' | 'link'
  className?: string
  testId?: string
}) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<{ error: string; missing?: string[] } | null>(null)
  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant={variant}
        data-testid={testId}
        className={className}
        disabled={pending}
        onClick={() => {
          setError(null)
          start(async () => {
            const r = await action()
            if (r.ok) window.location.assign(r.url)
            else setError(r)
          })
        }}
      >
        {pending && <Loader2 className="mr-2 size-5 animate-spin" />}
        {children}
      </Button>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>
            {error.error}
            {error.missing && (
              <ul className="mt-1 list-disc pl-5">
                {error.missing.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            )}
          </AlertDescription>
        </Alert>
      )}
    </div>
  )
}
