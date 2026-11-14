'use client'

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'

/**
 * The home page's plan list: `shown` at once, `more` behind "See more plans (N)" (a button under
 * the list, and on phones also a last card in the swipe row). "Show fewer" hides them again and
 * keeps the button where it was on screen, so the page does not jump.
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
  const button = useRef<HTMLButtonElement>(null)
  // Where the button sat on screen before "Show fewer" (null: nothing to keep in place).
  const keepAt = useRef<number | null>(null)

  useLayoutEffect(() => {
    if (keepAt.current === null || !button.current) return
    const moved = button.current.getBoundingClientRect().top - keepAt.current
    keepAt.current = null
    if (moved !== 0) window.scrollBy({ top: moved, behavior: 'instant' })
  }, [open])

  const showFewer = () => {
    keepAt.current = button.current?.getBoundingClientRect().top ?? null
    setOpen(false)
  }
  const label = `See more plans (${moreCount})`

  return (
    <>
      <div
        className="-mx-4 mt-8 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-4 sm:mx-0 sm:grid sm:snap-none sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-3"
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
            className="border-brand-green text-brand-green bg-brand-mist flex w-[60vw] max-w-xs shrink-0 snap-start flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-6 text-center font-semibold sm:hidden"
            data-testid="see-more-card"
          >
            <span aria-hidden className="text-3xl leading-none">
              +
            </span>
            {label}
          </button>
        )}
      </div>
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
