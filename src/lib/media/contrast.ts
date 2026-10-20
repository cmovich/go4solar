/** WCAG 2 contrast for white text over a photo under a coloured overlay. Pure. */
export type Rgb = [number, number, number]

/**
 * Hero overlay: dark green, light over most of the photo (30–32 %) and darker only behind the
 * headline and explainer, fading out toward the bottom (phones) or the right (wider screens).
 * Stops are [position 0–1, opacity 0–1]. Readability is tested on every hero photo.
 */
export type OverlayStops = readonly (readonly [number, number])[]
export const HERO_OVERLAY_PHONE: OverlayStops = [
  [0, 0.65],
  [0.45, 0.65],
  [0.65, 0.32],
  [1, 0.3],
]
export const HERO_OVERLAY_DESKTOP: OverlayStops = [
  [0, 0.7],
  [0.4, 0.7],
  [0.62, 0.56],
  [0.8, 0.32],
  [1, 0.32],
]

/** Opacity of the overlay at a position (linear between stops, like CSS linear-gradient). */
export function overlayAt(stops: OverlayStops, t: number): number {
  const [first] = stops
  if (!first || t <= first[0]) return first?.[1] ?? 0
  for (let i = 1; i < stops.length; i++) {
    const [p0, a0] = stops[i - 1]!
    const [p1, a1] = stops[i]!
    if (t <= p1) return a0 + (a1 - a0) * ((t - p0) / (p1 - p0 || 1))
  }
  return stops[stops.length - 1]![1]
}

/** The CSS gradient for a set of stops, in brand-dark. */
export function overlayCss(direction: 'to bottom' | 'to right', stops: OverlayStops): string {
  const parts = stops.map(([p, a]) => `rgb(14 59 34 / ${a}) ${Math.round(p * 100)}%`)
  return `linear-gradient(${direction}, ${parts.join(', ')})`
}

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
