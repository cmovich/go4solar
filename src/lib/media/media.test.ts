import { describe, expect, it } from 'vitest'

import { containFit, coverCrop } from './crop'
import { MEDIA_KINDS, uploadProblem } from './rules'
import { sniffImage, svgIsSafe } from './sniff'

describe('coverCrop (fill the frame, cut the overflow from the centre)', () => {
  it('a wide photo cropped to a square keeps the middle', () => {
    expect(coverCrop(4000, 3000, 400, 400)).toEqual({ sx: 500, sy: 0, sw: 3000, sh: 3000 })
  })
  it('a tall phone photo cropped to 3:2 keeps the middle band', () => {
    expect(coverCrop(3000, 4000, 1200, 800)).toEqual({ sx: 0, sy: 1000, sw: 3000, sh: 2000 })
  })
})

describe('containFit (logo fits inside the box, never stretched or enlarged)', () => {
  it('a wide logo fits the 400 × 200 box by width', () => {
    expect(containFit(1600, 400, 400, 200)).toEqual({ width: 400, height: 100 })
  })
  it('a tall logo fits by height', () => {
    expect(containFit(500, 1000, 400, 200)).toEqual({ width: 100, height: 200 })
  })
  it('a small logo is not enlarged', () => {
    expect(containFit(120, 60, 400, 200)).toEqual({ width: 120, height: 60 })
  })
})

// Minimal real file headers.
const png = (w: number, h: number) => {
  const b = new Uint8Array(33)
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52])
  new DataView(b.buffer).setUint32(16, w)
  new DataView(b.buffer).setUint32(20, h)
  return b
}
const jpeg = (w: number, h: number) =>
  new Uint8Array([
    0xff,
    0xd8,
    0xff,
    0xe0,
    0x00,
    0x04,
    0x00,
    0x00,
    0xff,
    0xc0,
    0x00,
    0x11,
    0x08,
    h >> 8,
    h & 255,
    w >> 8,
    w & 255,
    0x03,
  ])
const webpLossy = (w: number, h: number) => {
  const b = new Uint8Array(30)
  b.set([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20])
  b.set([0, 0, 0, 0, 0, 0, 0x9d, 0x01, 0x2a], 16)
  new DataView(b.buffer).setUint16(26, w, true)
  new DataView(b.buffer).setUint16(28, h, true)
  return b
}

describe('sniffImage (trust the bytes, not the file name)', () => {
  it('reads type and size from PNG, JPEG and WebP headers', () => {
    expect(sniffImage(png(400, 400))).toEqual({ type: 'image/png', width: 400, height: 400 })
    expect(sniffImage(jpeg(1200, 800))).toEqual({ type: 'image/jpeg', width: 1200, height: 800 })
    expect(sniffImage(webpLossy(1200, 800))).toEqual({
      type: 'image/webp',
      width: 1200,
      height: 800,
    })
  })
  it('an SVG is recognised by its text', () => {
    const svg = new TextEncoder().encode(
      '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" width="10" height="5"></svg>',
    )
    expect(sniffImage(svg)?.type).toBe('image/svg+xml')
  })
  it('anything else is not an image', () => {
    expect(sniffImage(new TextEncoder().encode('%PDF-1.7 not an image'))).toBeNull()
    expect(sniffImage(new Uint8Array([0x4d, 0x5a, 0x90, 0x00]))).toBeNull() // a program
  })
})

describe('svgIsSafe', () => {
  it('refuses scripts, event handlers and outside links', () => {
    expect(svgIsSafe('<svg><circle r="1"/></svg>')).toBe(true)
    expect(svgIsSafe('<svg><script>alert(1)</script></svg>')).toBe(false)
    expect(svgIsSafe('<svg onload="x()"></svg>')).toBe(false)
    expect(svgIsSafe('<svg><a href="javascript:x()">x</a></svg>')).toBe(false)
    expect(svgIsSafe('<svg><image href="https://evil.example/x.png"/></svg>')).toBe(false)
    expect(svgIsSafe('<svg><foreignObject></foreignObject></svg>')).toBe(false)
  })
})

describe('uploadProblem (server check of a processed upload)', () => {
  it('the three kinds and their sizes', () => {
    expect(MEDIA_KINDS.installer).toMatchObject({ width: 400, height: 400, fit: 'cover' })
    expect(MEDIA_KINDS.job).toMatchObject({ width: 1200, height: 800, fit: 'cover' })
    expect(MEDIA_KINDS.logo).toMatchObject({ width: 400, height: 200, fit: 'contain' })
  })
  it('accepts a processed photo of exactly the right size', () => {
    expect(uploadProblem('installer', 30_000, sniffImage(png(400, 400)), null)).toBeNull()
    expect(uploadProblem('job', 200_000, sniffImage(webpLossy(1200, 800)), null)).toBeNull()
  })
  it('refuses non-images, files over 10 MB and the wrong size', () => {
    expect(uploadProblem('job', 1000, null, null)).toBe(
      'That file is not a picture (use JPG, PNG or WebP).',
    )
    expect(uploadProblem('job', 10 * 1024 * 1024 + 1, sniffImage(png(1200, 800)), null)).toBe(
      'That picture is larger than 10 MB.',
    )
    expect(uploadProblem('installer', 1000, sniffImage(png(500, 400)), null)).toBe(
      'The installer photo must be 400 × 400 after cropping.',
    )
  })
  it('logos: fit inside 400 × 200; SVG only for logos, and only a safe one', () => {
    expect(uploadProblem('logo', 1000, sniffImage(png(400, 100)), null)).toBeNull()
    expect(uploadProblem('logo', 1000, sniffImage(png(401, 100)), null)).toBe(
      'The logo must fit inside 400 × 200.',
    )
    const svgSniff = { type: 'image/svg+xml' as const, width: 0, height: 0 }
    expect(uploadProblem('logo', 1000, svgSniff, '<svg></svg>')).toBeNull()
    expect(uploadProblem('logo', 1000, svgSniff, '<svg><script/></svg>')).toBe(
      'That SVG contains scripts or links, so it cannot be used.',
    )
    expect(uploadProblem('job', 1000, svgSniff, '<svg></svg>')).toBe(
      'That file is not a picture (use JPG, PNG or WebP).',
    )
  })
})
