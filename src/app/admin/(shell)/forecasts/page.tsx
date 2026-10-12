import type { Metadata } from 'next'
import Link from 'next/link'

import { ForecastWorkbench } from '@/components/admin/forecasts/ForecastWorkbench'
import { TestDataToggle, showTestFrom } from '@/components/admin/TestDataToggle'
import { requireRole } from '@/lib/auth/roles'
import { breakEvenSystemsPerYear } from '@/lib/forecast/breakEven'
import { perSystem } from '@/lib/forecast/scenario'
import { defaultInputs, getScenario, listScenarios } from '@/lib/reports/forecast'

export const metadata: Metadata = { title: 'Forecasts' }
export const dynamic = 'force-dynamic'

/** Named forecast scenarios, 1–10 years, Low / Base / High (super admin, finance). */
export default async function ForecastsPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; test?: string }>
}) {
  await requireRole('super_admin', 'finance')
  const sp = await searchParams
  const includeTest = showTestFrom(sp.test)
  const [scenarios, current, defaults] = await Promise.all([
    listScenarios(includeTest),
    sp.id ? getScenario(sp.id) : Promise.resolve(null),
    defaultInputs(),
  ])
  const inputs = current?.inputs ?? defaults
  const p = perSystem(inputs)
  const breakEven = breakEvenSystemsPerYear(
    inputs.overheadFixedPerMonthYear1 * 12,
    p.netProfit,
    inputs.overheadPerSystemYear1,
  )
  const testQs = includeTest ? '&test=1' : ''

  return (
    <main className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6">
      <div>
        <h1 className="text-brand-dark text-3xl font-bold">Forecasts</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Starts from today&apos;s settings; every input can be changed for the scenario. Break-even
          at today&apos;s numbers:{' '}
          {breakEven === null
            ? 'never (each system loses money)'
            : `about ${breakEven.toFixed(1)} systems a year`}
          .
        </p>
        <div className="mt-2">
          <TestDataToggle path="/admin/forecasts" params={sp} on={includeTest} />
        </div>
      </div>
      <nav className="flex flex-wrap gap-2 text-sm" aria-label="Scenarios">
        <Link
          href={`/admin/forecasts?${testQs.slice(1)}`}
          className={`rounded-full border px-3 py-1 ${!current ? 'bg-brand-green text-white' : 'bg-white'}`}
        >
          New from today&apos;s settings
        </Link>
        {scenarios.map((s) => (
          <Link
            key={s.id}
            href={`/admin/forecasts?id=${s.id}${testQs}`}
            className={`rounded-full border px-3 py-1 ${current?.id === s.id ? 'bg-brand-green text-white' : 'bg-white'}`}
          >
            {s.name}
          </Link>
        ))}
      </nav>
      <ForecastWorkbench
        key={current?.id ?? 'new'}
        id={current?.id ?? null}
        name={current?.name ?? 'Base case'}
        inputs={inputs}
        includeTest={includeTest}
      />
    </main>
  )
}
