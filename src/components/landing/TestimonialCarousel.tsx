'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import Image from 'next/image'
import { useCallback, useEffect, useRef, useState } from 'react'

import type { HomeTestimonial } from '@/lib/content/server'

const ROTATE_MS = 6000

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(mq.matches)
    const on = (e: MediaQueryListEvent) => setReduced(e.matches)
    mq.addEventListener?.('change', on)
    return () => mq.removeEventListener?.('change', on)
  }, [])
  return reduced
}

/**
 * Home-page testimonials: one at a time, moving on every 6 s. Pauses while hovered, touched or
 * focused; swipe, arrows, dots and the arrow keys move it; never moves by itself for people who
 * asked for reduced motion. Pictures load lazily.
 */
export function TestimonialCarousel({ items }: { items: HomeTestimonial[] }) {
  const [index, setIndex] = useState(0)
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const [touched, setTouched] = useState(false)
  const reduced = useReducedMotion()
  const swipeFrom = useRef<number | null>(null)
  const count = items.length
  const paused = hovered || focused || touched || reduced

  const go = useCallback((i: number) => setIndex(((i % count) + count) % count), [count])

  useEffect(() => {
    if (paused || count < 2) return
    const t = window.setInterval(() => setIndex((i) => (i + 1) % count), ROTATE_MS)
    return () => window.clearInterval(t)
  }, [paused, count])

  const item = items[index]
  if (!item) return null

  return (
    <section
      aria-roledescription="carousel"
      aria-label="What our customers say"
      role="region"
      className="relative"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false)
      }}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') go(index + 1)
        if (e.key === 'ArrowLeft') go(index - 1)
      }}
      onPointerDown={(e) => {
        if (e.pointerType !== 'mouse') setTouched(true)
        swipeFrom.current = e.clientX
      }}
      onPointerUp={(e) => {
        const from = swipeFrom.current
        swipeFrom.current = null
        if (from !== null && Math.abs(e.clientX - from) > 50) {
          go(index + (e.clientX < from ? 1 : -1))
        }
      }}
    >
      <div
        role="group"
        aria-roledescription="slide"
        aria-label={`${index + 1} of ${count}`}
        aria-live={paused ? 'polite' : 'off'}
        data-testid="testimonial-current"
        className="grid items-center gap-6 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5 md:grid-cols-2"
      >
        {item.jobPhoto ? (
          <Image
            src={item.jobPhoto}
            alt={`Solar installation for ${item.clientName} in ${item.city}`}
            width={1200}
            height={800}
            unoptimized
            loading="lazy"
            className="aspect-[3/2] h-auto w-full object-cover"
          />
        ) : (
          <div className="bg-brand-mist aspect-[3/2] w-full" aria-hidden />
        )}
        <figure className="space-y-5 p-6 md:pr-10">
          <blockquote className="text-brand-dark text-lg leading-relaxed font-medium sm:text-xl">
            &ldquo;{item.quote}&rdquo;
          </blockquote>
          <figcaption className="space-y-3">
            <p className="text-sm">
              <span className="text-brand-dark font-semibold">{item.clientName}</span>, {item.city}{' '}
              · {item.systemSize}
            </p>
            <p className="flex items-center gap-3 text-sm">
              {item.installerPhoto && (
                <Image
                  src={item.installerPhoto}
                  alt=""
                  width={48}
                  height={48}
                  unoptimized
                  loading="lazy"
                  className="h-12 w-12 rounded-full object-cover"
                />
              )}
              <span>
                Installed by <span className="font-semibold">{item.installerName}</span>
              </span>
            </p>
          </figcaption>
        </figure>
      </div>

      {count > 1 && (
        <div className="mt-6 flex items-center justify-center gap-4">
          <button
            type="button"
            aria-label="Previous testimonial"
            onClick={() => go(index - 1)}
            className="text-brand-dark hover:bg-brand-mist focus-visible:ring-brand-green flex h-11 w-11 items-center justify-center rounded-full border bg-white focus-visible:ring-2 focus-visible:outline-none"
          >
            <ChevronLeft className="h-5 w-5" aria-hidden />
          </button>
          <div className="flex gap-1">
            {items.map((t, i) => (
              <button
                key={t.id}
                type="button"
                aria-label={`Show testimonial ${i + 1} of ${count}`}
                aria-current={i === index}
                onClick={() => go(i)}
                className="focus-visible:ring-brand-green flex h-11 w-6 items-center justify-center rounded-full focus-visible:ring-2 focus-visible:outline-none"
              >
                <span
                  className={`block h-2.5 rounded-full transition-all ${i === index ? 'bg-brand-green w-5' : 'w-2.5 bg-black/20'}`}
                />
              </button>
            ))}
          </div>
          <button
            type="button"
            aria-label="Next testimonial"
            onClick={() => go(index + 1)}
            className="text-brand-dark hover:bg-brand-mist focus-visible:ring-brand-green flex h-11 w-11 items-center justify-center rounded-full border bg-white focus-visible:ring-2 focus-visible:outline-none"
          >
            <ChevronRight className="h-5 w-5" aria-hidden />
          </button>
        </div>
      )}
    </section>
  )
}
