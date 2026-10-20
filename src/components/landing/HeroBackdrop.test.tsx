// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { HeroBackdrop } = await import('./HeroBackdrop')

const slides = [1, 2, 3].map((n) => ({
  desktop: `/brand/hero/hero-${n}-desktop.jpg`,
  mobile: `/brand/hero/hero-${n}-mobile.jpg`,
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

const imgs = (c: HTMLElement) => [...c.querySelectorAll('img')]
const shown = (c: HTMLElement) =>
  [...c.querySelectorAll('[data-slide]')].filter((el) => el.getAttribute('data-active') === 'true')

function pageLoaded() {
  act(() => {
    window.dispatchEvent(new Event('load'))
    vi.advanceTimersByTime(50)
  })
}

describe('HeroBackdrop', () => {
  it('only the first photo is on the page at first, and it loads eagerly', () => {
    const { container } = render(<HeroBackdrop slides={slides} />)
    expect(imgs(container)).toHaveLength(1)
    expect(imgs(container)[0]!.getAttribute('loading')).not.toBe('lazy')
    expect(container.querySelector('source')?.getAttribute('media')).toBe('(max-width: 767px)')
  })

  it('after the page has loaded the others are added (lazily) and it crossfades every 6 s', () => {
    const { container } = render(<HeroBackdrop slides={slides} />)
    pageLoaded()
    expect(imgs(container)).toHaveLength(3)
    expect(imgs(container)[1]!.getAttribute('loading')).toBe('lazy')
    expect(shown(container).map((e) => e.getAttribute('data-slide'))).toEqual(['0'])
    act(() => vi.advanceTimersByTime(6000))
    expect(shown(container).map((e) => e.getAttribute('data-slide'))).toEqual(['1'])
    act(() => vi.advanceTimersByTime(12000))
    expect(shown(container).map((e) => e.getAttribute('data-slide'))).toEqual(['0']) // wraps
  })

  it('reduced motion: the first photo only, never anything else', () => {
    reduced = true
    const { container } = render(<HeroBackdrop slides={slides} />)
    pageLoaded()
    act(() => vi.advanceTimersByTime(30000))
    expect(imgs(container)).toHaveLength(1)
  })

  it('one photo: no rotation; no photos: nothing (the green band alone)', () => {
    const one = render(<HeroBackdrop slides={slides.slice(0, 1)} />)
    pageLoaded()
    expect(imgs(one.container)).toHaveLength(1)
    one.unmount()
    const none = render(<HeroBackdrop slides={[]} />)
    expect(imgs(none.container)).toHaveLength(0)
  })

  it('decorative: hidden from screen readers', () => {
    const { container } = render(<HeroBackdrop slides={slides} />)
    expect(container.firstElementChild?.getAttribute('aria-hidden')).toBe('true')
    expect(imgs(container)[0]!.getAttribute('alt')).toBe('')
  })
})
