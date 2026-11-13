// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
const assign = vi.fn()
vi.mock('@/app/admin/(shell)/jobs/actions', () => ({
  assign: (...a: unknown[]) => assign(...a),
  installed: vi.fn(),
  payout: vi.fn(),
  pickup: vi.fn(),
  saveSerials: vi.fn(),
  schedule: vi.fn(),
  uploadPhoto: vi.fn(),
}))

const { AwaitingJobCard } = await import('./JobControls')

afterEach(cleanup)
beforeEach(() => {
  refresh.mockReset()
  assign.mockReset()
})

function fillAndAssign() {
  fireEvent.change(screen.getByLabelText('Installer'), { target: { value: 'Bayo Installs' } })
  fireEvent.change(screen.getByLabelText('Installer phone'), { target: { value: '08031234567' } })
  fireEvent.click(screen.getByRole('button', { name: 'Assign' }))
}

describe('AwaitingJobCard (Admin → Jobs)', () => {
  it('leaves the list as soon as the installer is assigned, and the page refreshes (no reload)', async () => {
    assign.mockResolvedValue({ ok: true })
    render(
      <ul>
        <AwaitingJobCard loanId="loan-1" label="Ada Obi · Lagos · +2348031234567" />
      </ul>,
    )
    expect(screen.getByTestId('awaiting-job')).toBeTruthy()
    fillAndAssign()
    await waitFor(() => expect(screen.queryByTestId('awaiting-job')).toBeNull())
    expect(assign).toHaveBeenCalledWith(
      expect.objectContaining({ loanId: 'loan-1', installerName: 'Bayo Installs' }),
    )
    expect(refresh).toHaveBeenCalled()
  })

  it('stays, with the reason, when the assignment is refused', async () => {
    assign.mockResolvedValue({ ok: false, error: "Enter the installer's Nigerian mobile number." })
    render(
      <ul>
        <AwaitingJobCard loanId="loan-1" label="Ada Obi · Lagos · +2348031234567" />
      </ul>,
    )
    fillAndAssign()
    await waitFor(() =>
      expect(screen.getByText("Enter the installer's Nigerian mobile number.")).toBeTruthy(),
    )
    expect(screen.getByTestId('awaiting-job')).toBeTruthy()
    expect(refresh).not.toHaveBeenCalled()
  })
})
