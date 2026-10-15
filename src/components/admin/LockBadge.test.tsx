// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { LockBadge } from './LockBadge'

afterEach(cleanup)

describe('LockBadge', () => {
  it('shows "Lock due" past the limit', () => {
    render(
      <LockBadge lock={{ daysOverdue: 9, lockDue: true, lockDate: null, pausedUntil: null }} />,
    )
    expect(screen.getByText('Lock due')).toBeTruthy()
  })

  it('shows the extension instead while one is running', () => {
    render(
      <LockBadge
        lock={{ daysOverdue: 9, lockDue: false, lockDate: null, pausedUntil: '2026-10-20' }}
      />,
    )
    expect(screen.queryByText('Lock due')).toBeNull()
    expect(screen.getByText(/Extension to 20 Oct 2026/)).toBeTruthy()
  })

  it('shows nothing when no payment is past the limit', () => {
    const { container } = render(
      <LockBadge
        lock={{ daysOverdue: 3, lockDue: false, lockDate: '2026-10-18', pausedUntil: null }}
      />,
    )
    expect(container.textContent).toBe('')
  })
})
