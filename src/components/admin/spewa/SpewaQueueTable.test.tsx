// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { FunderQueueItem } from '@/lib/funderQueue/server'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/app/admin/(shell)/spewa/actions', () => ({ decideSpewaFiles: vi.fn() }))

const { SpewaQueueTable } = await import('./SpewaQueueTable')
const { RowBoundary } = await import('@/components/admin/RowBoundary')

afterEach(cleanup)

const row = (id: string, patch: Partial<FunderQueueItem> = {}): FunderQueueItem => ({
  id,
  name: `Business ${id}`,
  state: 'Kaduna',
  reference: `G4S-${id}`,
  totalPayable: 2_468_340,
  financed: 1_427_965,
  quoteUnavailable: false,
  depositShare: 0.3,
  routedAt: '2026-11-21T14:19:00Z',
  decision: 'pending',
  decidedBy: null,
  decidedAt: null,
  reason: null,
  cheques: { received: null, count: null, receivedOn: null },
  appStatus: 'submitted',
  loanStatus: 'pending_approval',
  repayment: null,
  isTest: false,
  ...patch,
})

describe('SPEWA queue table', () => {
  it('a file without a usable quote says "Quote details unavailable"; the other files show', () => {
    render(
      <SpewaQueueTable
        rows={[row('A'), row('B', { quoteUnavailable: true, totalPayable: null, financed: null })]}
        canDecide
      />,
    )
    expect(screen.getByText('Business A')).toBeTruthy()
    expect(screen.getByText('₦2,468,340')).toBeTruthy()
    expect(screen.getByText('Business B')).toBeTruthy()
    expect(screen.getByTestId('quote-unavailable').textContent).toBe('Quote details unavailable')
  })

  it('a row that fails to draw shows a notice; the rest of the table stays', () => {
    const Boom = () => {
      throw new Error('broken row')
    }
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <table>
        <tbody>
          <RowBoundary cols={3}>
            <Boom />
          </RowBoundary>
          <tr>
            <td>fine row</td>
          </tr>
        </tbody>
      </table>,
    )
    expect(screen.getByTestId('row-unavailable').textContent).toBe('Quote details unavailable')
    expect(screen.getByText('fine row')).toBeTruthy()
    err.mockRestore()
  })
})
