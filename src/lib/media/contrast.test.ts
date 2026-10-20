import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { HERO_SLIDES } from '@/config/heroSlides'

import {
  BRAND_DARK,
  HERO_OVERLAY_DESKTOP,
  HERO_OVERLAY_PHONE,
  contrastWithWhite,
  overlay,
  overlayAt,
  overlayCss,
  type Rgb,
} from './contrast'

describe('contrast (WCAG 2)', () => {
  it('white on black is 21:1, white on white 1:1, white on brand dark green about 12.6:1', () => {
    expect(contrastWithWhite([0, 0, 0])).toBeCloseTo(21, 1)
    expect(contrastWithWhite([255, 255, 255])).toBeCloseTo(1, 5)
    expect(contrastWithWhite(BRAND_DARK)).toBeCloseTo(12.6, 1)
  })
  it('an overlay blends the colour over the photo pixel', () => {
    expect(overlay([255, 255, 255], BRAND_DARK, 1)).toEqual(BRAND_DARK)
    expect(overlay([255, 255, 255], BRAND_DARK, 0)).toEqual([255, 255, 255])
  })
  it('the overlay is light over most of the photo and darker only behind the text', () => {
    expect(overlayAt(HERO_OVERLAY_PHONE, 0.3)).toBe(0.65) // behind the headline
    expect(overlayAt(HERO_OVERLAY_PHONE, 0.8)).toBeLessThan(0.33) // lower part of the photo
    expect(overlayAt(HERO_OVERLAY_DESKTOP, 0.9)).toBe(0.32) // right-hand side
    expect(overlayCss('to bottom', HERO_OVERLAY_PHONE)).toBe(
      'linear-gradient(to bottom, rgb(14 59 34 / 0.65) 0%, rgb(14 59 34 / 0.65) 45%, rgb(14 59 34 / 0.32) 65%, rgb(14 59 34 / 0.3) 100%)',
    )
  })
})

/**
 * Where the hero text sits (fractions of the hero, measured at 375 × 993 and 1280 × 832) and
 * which text has its own dark-tinted box (badges, bottom line: brand dark at 60 %).
 */
type Area = {
  name: string
  rects: [number, number, number, number][]
  large?: boolean
  tint?: number
}
const LAYOUT = {
  phone: {
    hero: [375, 993] as const,
    file: 'mobile' as const,
    stops: HERO_OVERLAY_PHONE,
    along: 'y' as const,
    areas: [
      { name: 'headline', rects: [[0.043, 0.161, 0.957, 0.293]], large: true },
      { name: 'explainer', rects: [[0.043, 0.317, 0.957, 0.374]] },
      { name: 'small line', rects: [[0.043, 0.386, 0.957, 0.426]] },
      { name: 'badges', rects: [[0.088, 0.568, 0.912, 0.818]], tint: 0.6 },
      { name: 'bottom line', rects: [[0.043, 0.863, 0.957, 0.903]], tint: 0.6 },
    ] as Area[],
  },
  desktop: {
    hero: [1280, 832] as const,
    file: 'desktop' as const,
    stops: HERO_OVERLAY_DESKTOP,
    along: 'x' as const,
    areas: [
      { name: 'headline', rects: [[0.069, 0.24, 0.597, 0.392]], large: true },
      { name: 'explainer', rects: [[0.069, 0.421, 0.594, 0.454]] },
      { name: 'small line', rects: [[0.069, 0.469, 0.597, 0.493]] },
      { name: 'badges', rects: [[0.082, 0.662, 0.584, 0.768]], tint: 0.6 },
      { name: 'bottom line', rects: [[0.069, 0.822, 0.597, 0.846]], tint: 0.6 },
    ] as Area[],
  },
}

// WCAG: 4.5:1 for normal text, 3:1 for large text (the headline). Checked over 95 % of each text
// area of every hero photo (the soft text shadow covers the brightest specks), and never below
// 3.5:1 even on the brightest pixel. Re-run automatically after `npm run hero:build`.
describe('hero text stays readable on every hero photo', async () => {
  const sharp = (await import('sharp')).default
  for (const [mode, l] of Object.entries(LAYOUT)) {
    for (const slide of HERO_SLIDES) {
      it(`${mode}: ${slide[l.file]}`, async () => {
        const { data, info } = await sharp(readFileSync(`public${slide[l.file]}`))
          .raw()
          .toBuffer({ resolveWithObject: true })
        const [hw, hh] = l.hero
        const s = Math.max(hw / info.width, hh / info.height)
        const ox = (info.width * s - hw) / 2
        const oy = (info.height * s - hh) / 2
        for (const area of l.areas) {
          const cs: number[] = []
          for (const [x0, y0, x1, y1] of area.rects) {
            for (let py = Math.round(y0 * hh); py < y1 * hh; py += 3) {
              for (let px = Math.round(x0 * hw); px < x1 * hw; px += 3) {
                const ix = Math.min(info.width - 1, Math.floor((px + ox) / s))
                const iy = Math.min(info.height - 1, Math.floor((py + oy) / s))
                const i = (iy * info.width + ix) * 3
                const a = overlayAt(l.stops, l.along === 'y' ? py / hh : px / hw)
                let bg: Rgb = overlay([data[i]!, data[i + 1]!, data[i + 2]!], BRAND_DARK, a)
                if (area.tint) bg = overlay(bg, BRAND_DARK, area.tint)
                cs.push(contrastWithWhite(bg))
              }
            }
          }
          cs.sort((p, q) => p - q)
          const p95 = cs[Math.floor(cs.length * 0.05)]!
          expect(p95, `${area.name} (95 % of the area)`).toBeGreaterThanOrEqual(
            area.large ? 3 : 4.5,
          )
          expect(cs[0]!, `${area.name} (brightest pixel)`).toBeGreaterThanOrEqual(3.5)
        }
      })
    }
  }
})
