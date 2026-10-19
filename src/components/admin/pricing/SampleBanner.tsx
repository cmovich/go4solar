'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { Button } from '@/components/ui/button'
import { sampleSummary, type SampleItem, type SampleSection } from '@/lib/pricing/sampleStatus'

import { confirmSamplePrices } from '@/app/admin/(shell)/pricing/actions'

const SECTION_NAMES: Record<SampleSection, string> = {
  components: 'Components',
  margins: 'Margins',
  rates: 'Financing rates',
  installation: 'Installation',
  'unit-costs': 'Unit costs',
  energy: 'Energy & sizing',
}

/**
 * Top of /admin/pricing: how many rows are still SAMPLE (prices hidden on the website until they
 * are confirmed or changed), each with "Confirm as real price", and "Confirm all in this section".
 */
export function SampleBanner({ items }: { items: SampleItem[] }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const summary = sampleSummary(items)
  const sections = [...new Set(items.map((i) => i.section))]

  function confirm(section: SampleSection, keys?: string[]) {
    setError(null)
    start(async () => {
      const r = await confirmSamplePrices({ section, keys })
      if (r.ok) router.refresh()
      else setError(r.error)
    })
  }

  const hiding = summary.hiding > 0
  return (
    <section
      data-testid="sample-banner"
      aria-label="Sample prices"
      className={`mb-6 rounded-xl border px-4 py-3 text-sm ${hiding ? 'border-amber-300 bg-amber-50 text-amber-950' : 'border-green-300 bg-green-50 text-green-950'}`}
    >
      <p className="font-semibold" data-testid="sample-summary">
        {summary.message}
      </p>
      {items.length > 0 && (
        <p className="mt-1 text-xs">
          A SAMPLE price is a placeholder. If it is already right, press &ldquo;Confirm as real
          price&rdquo;; otherwise change it in its section and save.
          {summary.other > 0 &&
            ' Unit costs and energy prices do not hide website prices (they feed admin figures and advice).'}
        </p>
      )}
      {error && (
        <p className="mt-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}
      {sections.length > 0 && (
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          {sections.map((section) => {
            const rows = items.filter((i) => i.section === section)
            return (
              <div
                key={section}
                className="rounded-lg bg-white/70 p-3"
                data-testid={`sample-${section}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link
                    href={`/admin/pricing/${section}`}
                    className="text-brand-blue font-semibold underline"
                  >
                    {SECTION_NAMES[section]} ({rows.length})
                  </Link>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() => confirm(section)}
                  >
                    Confirm all in this section
                  </Button>
                </div>
                <ul className="mt-2 space-y-1">
                  {rows.map((r) => (
                    <li key={r.key} className="flex flex-wrap items-center justify-between gap-2">
                      <span>{r.label}</span>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => confirm(section, [r.key])}
                        className="text-brand-green text-xs font-semibold underline disabled:opacity-50"
                        aria-label={`Confirm ${r.label} as real price`}
                      >
                        Confirm as real price
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
