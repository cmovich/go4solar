/** Pure geometry for the browser-side image processing (see ImageUpload). */

/** The centre part of the source that fills a dstW × dstH frame (the rest is cut off). */
export function coverCrop(
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
): { sx: number; sy: number; sw: number; sh: number } {
  const target = dstW / dstH
  if (srcW / srcH > target) {
    const sw = Math.round(srcH * target)
    return { sx: Math.round((srcW - sw) / 2), sy: 0, sw, sh: srcH }
  }
  const sh = Math.round(srcW / target)
  return { sx: 0, sy: Math.round((srcH - sh) / 2), sw: srcW, sh }
}

/** The size that fits inside maxW × maxH keeping the shape; never enlarged. */
export function containFit(
  srcW: number,
  srcH: number,
  maxW: number,
  maxH: number,
): { width: number; height: number } {
  const scale = Math.min(1, maxW / srcW, maxH / srcH)
  return { width: Math.round(srcW * scale), height: Math.round(srcH * scale) }
}

/**
 * Like coverCrop, but the window is centred on a focus point (fx, fy as 0–1 of the photo's width
 * and height) as far as the photo's edges allow — e.g. to keep the panels in the middle.
 */
export function focalCrop(
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
  fx: number,
  fy: number,
): { sx: number; sy: number; sw: number; sh: number } {
  const { sw, sh } = coverCrop(srcW, srcH, dstW, dstH)
  const clamp = (v: number, max: number) => Math.min(Math.max(0, Math.round(v)), max)
  return {
    sx: clamp(fx * srcW - sw / 2, srcW - sw),
    sy: clamp(fy * srcH - sh / 2, srcH - sh),
    sw,
    sh,
  }
}
