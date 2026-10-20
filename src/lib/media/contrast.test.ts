import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { HERO_SLIDES } from '@/config/heroSlides'

import {
  BRAND_DARK,
  HERO_PHONE_OVERLAY,
  contrastWithWhite,
  overlay,
  worstWhiteContrast,
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
})

// Phones: the hero photo shows through a flat dark-green overlay (HERO_PHONE_OVERLAY). White
// text must keep at least 4.5:1 everywhere, even on the brightest pixel of every hero photo
// (checked again whenever the photos change with `npm run hero:build`).

describe('hero photos on phones keep white text readable', async () => {
  const sharp = (await import('sharp')).default
  for (const slide of HERO_SLIDES) {
    it(`${slide.mobile}: at least 4.5:1 at the brightest spot`, async () => {
      const file = `public${slide.mobile}`
      const { data } = await sharp(readFileSync(file))
        .resize(270, 338)
        .raw()
        .toBuffer({ resolveWithObject: true })
      expect(worstWhiteContrast(data, HERO_PHONE_OVERLAY)).toBeGreaterThanOrEqual(4.5)
    })
  }
})
