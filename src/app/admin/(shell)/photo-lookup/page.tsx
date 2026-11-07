import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { VisionSettingsForm } from '@/components/admin/VisionSettingsForm'
import { requireStaffWithMfa } from '@/lib/auth/roles'
import { formatNaira } from '@/lib/money'
import { photoLookupAvailable } from '@/lib/providers/vision/available'
import { capReached } from '@/lib/vision/spend'
import { loadVisionSettings, usageToday } from '@/lib/vision/server'

export const metadata: Metadata = { title: 'Photo lookup' }
export const dynamic = 'force-dynamic'

/** Super admin: the calculator's photo watts lookup — daily cap, per-visitor limit, prices. */
export default async function PhotoLookupPage() {
  const session = await requireStaffWithMfa()
  if (session.role !== 'super_admin') redirect('/admin')
  const [settings, usage] = await Promise.all([loadVisionSettings(), usageToday()])
  const keySet = photoLookupAvailable() && process.env.VISION_PROVIDER === 'anthropic'
  const spent = usage?.spent ?? 0
  const open = photoLookupAvailable() && !capReached(spent, settings)
  return (
    <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <h1 className="text-brand-dark text-3xl font-bold">Photo lookup</h1>
      <p className="text-muted-foreground mt-1 text-sm">
        In the calculator, customers can read an appliance&apos;s watts from a photo of its label,
        or get an estimate from a photo of the appliance (sized at the 70th percentile of the
        range). Photos are never stored. The button hides when today&apos;s spend reaches the cap or
        when no API key is set; typing the watts always works.
      </p>
      {settings.sample && (
        <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          SAMPLE values: check the cap and the prices, then save.
        </p>
      )}
      <dl
        className="bg-brand-mist mt-6 grid grid-cols-2 gap-3 rounded-xl p-4 text-sm"
        data-testid="vision-today"
      >
        <dt className="text-muted-foreground">Status</dt>
        <dd className="font-semibold">{open ? 'On' : 'Off (button hidden)'}</dd>
        <dt className="text-muted-foreground">API key (Anthropic)</dt>
        <dd className="font-semibold">{keySet ? 'Set' : 'Not set'}</dd>
        <dt className="text-muted-foreground">Lookups today</dt>
        <dd className="font-semibold">{usage ? usage.lookups : '—'}</dd>
        <dt className="text-muted-foreground">Spent today</dt>
        <dd className="font-semibold">
          {formatNaira(spent)} of {formatNaira(settings.dailyCapNaira)}
        </dd>
      </dl>
      <div className="mt-8">
        <VisionSettingsForm initial={settings} />
      </div>
    </main>
  )
}
