'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'

/** A carousel slide: every plan card and the "See more plans" card (phones). */
const SLIDE = 'article[data-testid^="ready-plan-"], [data-testid="see-more-card"]'

/**
 * The home page's plan list: `shown` at once, `more` behind "See more plans (N)" (a button under
 * the list, and on phones also a last card in the carousel). "Show fewer" hides them again and
 * keeps the button where it was on screen, so the page does not jump.
 *
 * Phones: a carousel, one full-width card per screen with snap scrolling, arrows ("‹" only after
 * the first card, "›" not on the last) and a dot per card; swipes, arrows and dots stay in step.
 * Larger screens: the grid, no arrows or dots.
 */
export function SeeMorePlans({
  shown,
  more,
  moreCount,
}: {
  shown: ReactNode
  more: ReactNode
  moreCount: number
}) {
  const [open, setOpen] = useState(false)
  const [index, setIndex] = useState(0)
  const [count, setCount] = useState(0)
  const track = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  // Where the button sat on screen before "Show fewer" (null: nothing to keep in place).
  const keepAt = useRef<number | null>(null)

  const slides = useCallback(
    () =>
      Array.from(track.current?.querySelectorAll<HTMLElement>(SLIDE) ?? []).filter(
        (el) => el.offsetWidth > 0,
      ),
    [],
  )

  // Which card is on screen: the one whose left edge is nearest the scroll position.
  const sync = useCallback(() => {
    const t = track.current
    if (!t) return
    const all = slides()
    setCount(all.length)
    let best = 0
    all.forEach((el, i) => {
      if (Math.abs(el.offsetLeft - t.scrollLeft) < Math.abs(all[best]!.offsetLeft - t.scrollLeft))
        best = i
    })
    setIndex(best)
  }, [slides])

  useEffect(() => {
    const t = track.current
    if (!t) return
    sync()
    t.addEventListener('scroll', sync, { passive: true })
    window.addEventListener('resize', sync)
    return () => {
      t.removeEventListener('scroll', sync)
      window.removeEventListener('resize', sync)
    }
  }, [sync])

  useLayoutEffect(() => {
    sync()
    if (keepAt.current === null || !button.current) return
    const moved = button.current.getBoundingClientRect().top - keepAt.current
    keepAt.current = null
    if (moved !== 0) window.scrollBy({ top: moved, behavior: 'instant' })
  }, [open, sync])

  const goTo = (i: number) => {
    const el = slides()[i]
    if (!el || !track.current) return
    setIndex(i)
    track.current.scrollTo({ left: el.offsetLeft, behavior: 'smooth' })
  }

  const showFewer = () => {
    keepAt.current = button.current?.getBoundingClientRect().top ?? null
    setOpen(false)
  }
  const label = `See more plans (${moreCount})`
  const last = Math.max(count - 1, 0)
  const arrow =
    'bg-white/95 text-brand-dark absolute top-[calc(37.5cqw-1.375rem)] z-10 flex size-11 items-center justify-center rounded-full border shadow-md sm:hidden'

  return (
    <>
      <div className="@container relative mt-8">
        <div
          ref={track}
          className="relative flex snap-x snap-mandatory gap-4 overflow-x-auto pb-4 [scrollbar-width:none] sm:grid sm:snap-none sm:grid-cols-2 sm:overflow-visible lg:grid-cols-3 [&::-webkit-scrollbar]:hidden"
          aria-label="Ready-made plans"
          data-testid="ready-plans-list"
        >
          {shown}
          {moreCount > 0 && (
            <div id="more-ready-plans" className={open ? 'contents' : 'hidden'}>
              {more}
            </div>
          )}
          {moreCount > 0 && !open && (
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-controls="more-ready-plans"
              aria-expanded={false}
              className="border-brand-green text-brand-green bg-brand-mist flex w-full shrink-0 snap-start snap-always flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-6 text-center font-semibold sm:hidden"
              data-testid="see-more-card"
            >
              <span aria-hidden className="text-3xl leading-none">
                +
              </span>
              {label}
            </button>
          )}
        </div>
        {index > 0 && (
          <button
            type="button"
            onClick={() => goTo(index - 1)}
            aria-label="Previous plan"
            className={`${arrow} left-2`}
            data-testid="carousel-prev"
          >
            <ChevronLeft className="size-6" aria-hidden />
          </button>
        )}
        {count > 1 && index < last && (
          <button
            type="button"
            onClick={() => goTo(index + 1)}
            aria-label="Next plan"
            className={`${arrow} right-2`}
            data-testid="carousel-next"
          >
            <ChevronRight className="size-6" aria-hidden />
          </button>
        )}
      </div>
      {count > 1 && (
        <div className="flex justify-center sm:hidden" data-testid="carousel-dots">
          {Array.from({ length: count }, (_, i) => {
            const isMore = moreCount > 0 && !open && i === last
            return (
              <button
                key={i}
                type="button"
                onClick={() => goTo(i)}
                aria-label={isMore ? 'Go to See more plans' : `Go to plan ${i + 1}`}
                aria-current={i === index ? 'true' : undefined}
                className="flex size-11 items-center justify-center"
                data-testid="carousel-dot"
              >
                <span
                  aria-hidden
                  className={`block size-2.5 rounded-full ${i === index ? 'bg-brand-green' : 'bg-brand-dark/25'}`}
                />
              </button>
            )
          })}
        </div>
      )}
      {moreCount > 0 && (
        <div className="mt-2 flex justify-center">
          <button
            ref={button}
            type="button"
            onClick={open ? showFewer : () => setOpen(true)}
            aria-controls="more-ready-plans"
            aria-expanded={open}
            className="border-brand-green text-brand-green hover:bg-brand-mist min-h-11 rounded-full border-2 px-6 py-2 text-sm font-semibold"
            data-testid="see-more-plans"
          >
            {open ? 'Show fewer' : label}
          </button>
        </div>
      )}
    </>
  )
}
