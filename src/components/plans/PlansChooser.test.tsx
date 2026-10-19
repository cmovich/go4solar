// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { sampleHomeItems } from '@/lib/load/load.fixture'
import { computeLoadTotals } from '@/lib/load/totals'
import { formatNaira } from '@/lib/money'
import { buildEstimate } from '@/lib/quotes/buildEstimate'
import { priceVariant } from '@/lib/quotes/quote'
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

// An estimate made while 18 and 24 months were switched on.
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
      fallbackNumber="08182112423"
      tenures={tenures}
    />,
  )
  return within(screen.getByRole('group', { name: 'Tenure' }))
}

afterEach(cleanup)

describe('PlansChooser: payment plan lengths', () => {
  it('shows only the lengths offered (24 switched off since: not shown)', () => {
    const group = show([3, 6, 9, 12, 18])
    expect(group.getAllByRole('button').map((b) => b.textContent)).toEqual([
      '3 months',
      '6 months',
      '9 months',
      '12 months',
      '18 months',
    ])
    expect(group.queryByText('24 months')).toBeNull()
    // 12 months is chosen first.
    expect(group.getByText('12 months').getAttribute('aria-pressed')).toBe('true')
  })

  it('choosing 18 months prices every plan at 18 months with the 18-month rate', () => {
    const group = show([3, 6, 9, 12, 18])
    fireEvent.click(group.getByText('18 months'))
    const v = priceVariant(estimate, 'comfort', 18, 0.2)
    expect(screen.getByTestId('total-comfort').textContent).toBe(formatNaira(v.quote.systemPrice))
    expect(v.quote.snapshot.pricingRateAnnual).toBe(0.26)
  })

  it('old estimates (3, 6, 9, 12) keep working with four buttons', () => {
    const group = show([3, 6, 9, 12])
    expect(group.getAllByRole('button')).toHaveLength(4)
  })
})
