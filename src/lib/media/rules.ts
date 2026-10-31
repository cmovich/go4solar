import type { SniffedImage } from './sniff'
import { svgIsSafe } from './sniff'

/** What each kind of home-page picture is turned into before upload. */
export const MEDIA_KINDS = {
  /** Installer's face: square, shown as a circle. */
  installer: { width: 400, height: 400, fit: 'cover', label: 'installer photo' },
  /** The finished installation: 3:2. */
  job: { width: 1200, height: 800, fit: 'cover', label: 'job photo' },
  /** Product photo in the builder: square. */
  product: { width: 600, height: 600, fit: 'cover', label: 'product photo' },
  /** Roof type picture for the quote wizard: 4:3. */
  roof: { width: 800, height: 600, fit: 'cover', label: 'roof photo' },
  /** Partner logo: fitted inside, transparency kept. */
  logo: { width: 400, height: 200, fit: 'contain', label: 'logo' },
} as const
export type MediaKind = keyof typeof MEDIA_KINDS

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

/**
 * Why a processed upload is refused, in plain words; null when it is fine. The browser crops and
 * compresses first; the server checks the real bytes again.
 */
export function uploadProblem(
  kind: MediaKind,
  bytes: number,
  sniffed: SniffedImage | null,
  svgText: string | null,
): string | null {
  const k = MEDIA_KINDS[kind]
  if (bytes > MAX_UPLOAD_BYTES) return 'That picture is larger than 10 MB.'
  if (!sniffed || (sniffed.type === 'image/svg+xml' && kind !== 'logo')) {
    return 'That file is not a picture (use JPG, PNG or WebP).'
  }
  if (sniffed.type === 'image/svg+xml') {
    return svgText !== null && svgIsSafe(svgText)
      ? null
      : 'That SVG contains scripts or links, so it cannot be used.'
  }
  if (k.fit === 'cover' && (sniffed.width !== k.width || sniffed.height !== k.height)) {
    return `The ${k.label} must be ${k.width} × ${k.height} after cropping.`
  }
  if (k.fit === 'contain' && (sniffed.width > k.width || sniffed.height > k.height)) {
    return `The logo must fit inside ${k.width} × ${k.height}.`
  }
  return null
}
