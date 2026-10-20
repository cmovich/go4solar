/** WCAG 2 contrast for white text over a photo under a coloured overlay. Pure. */
export type Rgb = [number, number, number]

/**
 * Dark-green overlay over the hero photo on phones (0–1). 0.68 keeps white text at 4.8:1 or more
 * on the brightest pixel of every current hero photo (was a 95% → 70% gradient: 5.0:1 or more).
 */
export const HERO_PHONE_OVERLAY = 0.68

/** brand-dark #0E3B22 */
export const BRAND_DARK: Rgb = [0x0e, 0x3b, 0x22]

const channel = (c: number) => {
  const s = c / 255
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

export function luminance([r, g, b]: Rgb): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

/** Contrast ratio of white text on this colour (1 to 21). */
export function contrastWithWhite(rgb: Rgb): number {
  return 1.05 / (luminance(rgb) + 0.05)
}

/** The colour seen where `color` at `alpha` (0–1) lies over the photo pixel. */
export function overlay(pixel: Rgb, color: Rgb, alpha: number): Rgb {
  return pixel.map((p, i) => Math.round(p * (1 - alpha) + color[i]! * alpha)) as Rgb
}

/** The lowest white-text contrast anywhere on an RGB photo under a flat brand-dark overlay. */
export function worstWhiteContrast(
  rgb: Uint8Array,
  alpha: number,
  color: Rgb = BRAND_DARK,
): number {
  let worst = 21
  for (let i = 0; i + 2 < rgb.length; i += 3) {
    const c = contrastWithWhite(overlay([rgb[i]!, rgb[i + 1]!, rgb[i + 2]!], color, alpha))
    if (c < worst) worst = c
  }
  return worst
}
