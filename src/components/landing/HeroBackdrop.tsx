'use client'

import { getImageProps } from 'next/image'
import { useEffect, useState } from 'react'

import { HERO_OVERLAY_DESKTOP, HERO_OVERLAY_PHONE, overlayCss } from '@/lib/media/contrast'

export type HeroSlide = { desktop: string; mobile: string }

const ROTATE_MS = 6000
const FADE_MS = 1500
const PHONE = '(max-width: 767px)'

/** One photo: the phone crop on small screens, the desktop crop elsewhere (served as WebP/AVIF). */
function Slide({ slide, first }: { slide: HeroSlide; first: boolean }) {
  const common = { alt: '', sizes: '100vw', quality: 60 }
  const loading = first ? { priority: true } : { loading: 'lazy' as const }
  const {
    props: { srcSet: mobileSrcSet },
  } = getImageProps({ ...common, ...loading, src: slide.mobile, width: 1080, height: 1350 })
  const { props: desktop } = getImageProps({
    ...common,
    ...loading,
    src: slide.desktop,
    width: 1920,
    height: 1080,
  })
  return (
    <picture>
      <source media={PHONE} srcSet={mobileSrcSet} />
      {/* eslint-disable-next-line jsx-a11y/alt-text -- alt="" comes from getImageProps (decorative) */}
      <img {...desktop} className="absolute inset-0 h-full w-full object-cover" />
    </picture>
  )
}

/**
 * Hero background: a slow crossfade between the hero photos (about 6 s each). Only the first
 * photo is on the page at first (loaded eagerly); the rest are added after the page has loaded,
 * lazily. People who asked for reduced motion only ever see the first photo. A dark-green overlay
 * keeps the white text readable. Decorative, so hidden from screen readers.
 */
export function HeroBackdrop({ slides }: { slides: HeroSlide[] }) {
  const [all, setAll] = useState(false)
  const [active, setActive] = useState(0)

  useEffect(() => {
    if (slides.length < 2) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const add = () => window.setTimeout(() => setAll(true), 0)
    if (document.readyState === 'complete') add()
    else window.addEventListener('load', add, { once: true })
    return () => window.removeEventListener('load', add)
  }, [slides.length])

  useEffect(() => {
    if (!all) return
    const t = window.setInterval(() => {
      if (!document.hidden) setActive((i) => (i + 1) % slides.length)
    }, ROTATE_MS)
    return () => window.clearInterval(t)
  }, [all, slides.length])

  if (slides.length === 0) return null
  const shown = all ? slides : slides.slice(0, 1)
  return (
    <div aria-hidden="true" className="absolute inset-0">
      {shown.map((slide, i) => (
        <div
          key={slide.desktop}
          data-slide={i}
          data-active={i === active}
          className="absolute inset-0 transition-opacity ease-in-out motion-reduce:transition-none"
          style={{ opacity: i === active ? 1 : 0, transitionDuration: `${FADE_MS}ms` }}
        >
          <Slide slide={slide} first={i === 0} />
        </div>
      ))}
      {/* Light over most of the photo, darker only behind the text (readability tested). */}
      <div
        data-testid="hero-overlay-phone"
        className="absolute inset-0 sm:hidden"
        style={{ backgroundImage: overlayCss('to bottom', HERO_OVERLAY_PHONE) }}
      />
      <div
        data-testid="hero-overlay-desktop"
        className="absolute inset-0 hidden sm:block"
        style={{ backgroundImage: overlayCss('to right', HERO_OVERLAY_DESKTOP) }}
      />
    </div>
  )
}
