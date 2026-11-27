// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { sampleHomeItems } from '@/lib/load/load.fixture'
import { computeLoadTotals } from '@/lib/load/totals'
import { formatNaira } from '@/lib/money'
import { buildEstimate } from '@/lib/quotes/buildEstimate'
import { cashPrice, priceVariant } from '@/lib/quotes/quote'
import { DEFAULT_QUOTE_SETTINGS } from '@/lib/settings/schemas'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock('@/app/(public)/plans/actions', () => ({
  chooseQuote: vi.fn(),
  payInFull: vi.fn(),
  saveForLater: vi.fn(),
}))

// jsdom has no ResizeObserver (used by the deposit slider).
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const { PlansChooser } = await import('./PlansChooser')

// A home estimate on the ready-made terms (the Tenure rates table does not matter).
const estimate = buildEstimate(computeLoadTotals(sampleHomeItems), 'Lagos', 0.2, {
  ...DEFAULT_QUOTE_SETTINGS,
  pricing: {
    ...DEFAULT_QUOTE_SETTINGS.pricing,
    pricingRateByTenure: { 3: 0.24, 6: 0.24, 9: 0.24, 12: 0.24, 18: 0.26, 24: 0.28 },
  },
})

function show(tenures: (3 | 6 | 9 | 12 | 18 | 24)[]) {
  render(
    <PlansChooser
      leadId="00000000-0000-4000-8000-000000000000"
      firstName="Ada"
      estimate={estimate}
      current={null}
      validUntilLabel="1 November 2026"
      reference="G4S-TEST"
      whatsappNumber=""
      fallbackNumber="09018617165"
      tenures={tenures}
    />,
  )
  return within(screen.getByRole('group', { name: 'Tenure' }))
}

afterEach(cleanup)

describe('PlansChooser: payment plan lengths', () => {
  it('home estimates: 6, 9 and 12 months, 12 chosen first', () => {
    const group = show([6, 9, 12])
    expect(group.getAllByRole('button').map((b) => b.textContent)).toEqual([
      '6 months',
      '9 months',
      '12 months',
    ])
    expect(group.getByText('12 months').getAttribute('aria-pressed')).toBe('true')
  })

  it('choosing 6 months prices every plan at 6 months on the ready-made terms; cash price fixed', () => {
    const group = show([6, 9, 12])
    const cash = screen.getByTestId('cash-comfort').textContent
    fireEvent.click(group.getByText('6 months'))
    const v = priceVariant(estimate, 'comfort', 6, 0.2)
    expect(screen.getByTestId('total-comfort').textContent).toBe(formatNaira(v.quote.systemPrice))
    expect(v.quote.snapshot.terms?.monthlyRate).toBe(0.04)
    expect(screen.getByTestId('cash-comfort').textContent).toBe(cash)
    expect(cash).toContain(formatNaira(cashPrice(v.quote.snapshot)))
  })
})
