// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { LinkedText } from './LinkedText'

afterEach(cleanup)

const link = 'https://go4solar-git-phase-1-moses-semakos-projects.vercel.app/guarantee/abc123'

// Fix-up 1 #4/#5: the guarantor invite link in /admin/outbox could not be clicked.
describe('LinkedText', () => {
  it('shows the full message with the link clickable in a new tab', () => {
    const { container } = render(<LinkedText text={`Please respond within 72 hours: ${link}`} />)
    const a = screen.getByRole('link')
    expect(a.getAttribute('href')).toBe(link)
    expect(a.getAttribute('target')).toBe('_blank')
    expect(a.getAttribute('rel')).toContain('noopener')
    expect(container.textContent).toBe(`Please respond within 72 hours: ${link}`)
  })
})
