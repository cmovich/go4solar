/** Ready-made plan pictures (4:3, WebP, in the public site-media bucket). Pure. */
export const PLAN_IMAGE_MAX_WIDTH = 800

/** The largest 4:3 crop of a photo, at most 800 px wide and never larger than the photo. */
export function planImageSize(w: number, h: number): { width: number; height: number } {
  // Even multiples of 4 × 3 keep the ratio exact.
  const byWidth = Math.floor(Math.min(w, PLAN_IMAGE_MAX_WIDTH) / 4)
  const byHeight = Math.floor(h / 3)
  const unit = Math.min(byWidth, byHeight)
  return { width: unit * 4, height: unit * 3 }
}

/** Storage path for a plan picture, named by its content (a new picture gets a new name). */
export function planImagePath(slug: string, contentHash: string): string {
  return `plan/${slug}-${contentHash.slice(0, 8)}.webp`
}
