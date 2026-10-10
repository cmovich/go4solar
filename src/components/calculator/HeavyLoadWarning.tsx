'use client'

import { Flame } from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import type { LoadItem } from '@/lib/load/types'

/** PRD Feature 3 results screen: warn about items over 1,000 W used together. */
export function HeavyLoadWarning({ items }: { items: LoadItem[] }) {
  if (items.length === 0) return null
  const names = items.map((i) => i.name).join(', ')
  return (
    <Alert className="mt-4 border-amber-300 bg-amber-50 text-amber-900" data-testid="heavy-warning">
      <Flame className="h-4 w-4" aria-hidden />
      <AlertTitle>Heavy loads: {names}</AlertTitle>
      <AlertDescription className="text-amber-900/90">
        Items over 1,000 W used together need a much bigger system. Run them in the daytime on
        solar, or keep them on gas or grid. This one tip can cut a quote by half.
      </AlertDescription>
    </Alert>
  )
}
