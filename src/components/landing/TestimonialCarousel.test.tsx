// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { HomeTestimonial } from '@/lib/content/server'

const { TestimonialCarousel } = await import('./TestimonialCarousel')

const items: HomeTestimonial[] = ['Amaka', 'Bola', 'Chidi'].map((name, i) => ({
  id: String(i),
  quote: `Quote from ${name}`,
  clientName: name,
  city: 'Ikeja',
  systemSize: '3.5 kVA',
  installerName: `Installer ${i}`,
  installerPhoto: null,
  jobPhoto: null,
}))

let reduced = false
beforeEach(() => {
  vi.useFakeTimers()
  reduced = false
  window.matchMedia = ((q: string) => ({
    matches: q.includes('reduce') ? reduced : false,
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const shown = () => screen.getByTestId('testimonial-current').textContent

describe('TestimonialCarousel', () => {
  it('moves on every 6 seconds', () => {
    render(<TestimonialCarousel items={items} />)
    expect(shown()).toContain('Quote from Amaka')
    act(() => vi.advanceTimersByTime(6000))
    expect(shown()).toContain('Quote from Bola')
  })

  it('pauses while the pointer is over it', () => {
    render(<TestimonialCarousel items={items} />)
    fireEvent.mouseEnter(screen.getByRole('region', { name: 'What our customers say' }))
    act(() => vi.advanceTimersByTime(12000))
    expect(shown()).toContain('Quote from Amaka')
  })

  it('arrows, dots and the keyboard', () => {
    render(<TestimonialCarousel items={items} />)
    fireEvent.click(screen.getByRole('button', { name: 'Next testimonial' }))
    expect(shown()).toContain('Quote from Bola')
    fireEvent.click(screen.getByRole('button', { name: 'Previous testimonial' }))
    expect(shown()).toContain('Quote from Amaka')
    fireEvent.click(screen.getByRole('button', { name: 'Show testimonial 3 of 3' }))
    expect(shown()).toContain('Quote from Chidi')
    fireEvent.keyDown(screen.getByRole('region', { name: 'What our customers say' }), {
      key: 'ArrowRight',
    })
    expect(shown()).toContain('Quote from Amaka') // wraps round
  })

  it('never moves by itself for people who asked for reduced motion', () => {
    reduced = true
    render(<TestimonialCarousel items={items} />)
    act(() => vi.advanceTimersByTime(30000))
    expect(shown()).toContain('Quote from Amaka')
  })

  it('a single testimonial has no arrows or dots', () => {
    render(<TestimonialCarousel items={items.slice(0, 1)} />)
    expect(screen.queryByRole('button', { name: 'Next testimonial' })).toBeNull()
  })
})
