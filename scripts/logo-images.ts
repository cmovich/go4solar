/**
 * Builds the site logos from the original in logo-originals/ (never committed):
 *   public/brand/go4solar-logo.png        full colour, transparent, trimmed
 *   public/brand/go4solar-logo-white.png  for dark green: the sun and panels stay in colour, the
 *                                         lettering ("Go4solar" and the tagline) turns white
 * Run: npm run logo:build
 */
import path from 'node:path'

import sharp from 'sharp'

const ROOT = process.cwd()
const SOURCE = path.join(ROOT, 'logo-originals/go4solar_logo.png')
const OUT = path.join(ROOT, 'public/brand')
/** Rows (of the 500 × 500 original) where the lettering starts: everything below is text. */
const TEXT_FROM_Y = 240
const PAD = 8

async function main() {
  const { data, info } = await sharp(SOURCE).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const white = Buffer.from(data)
  for (let y = TEXT_FROM_Y; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * 4
      if (white[i + 3]! > 0) white[i] = white[i + 1] = white[i + 2] = 255
    }
  }
  const raw = { raw: { width: info.width, height: info.height, channels: 4 as const } }
  for (const [name, pixels] of [
    ['go4solar-logo.png', data],
    ['go4solar-logo-white.png', white],
  ] as const) {
    const trimmed = await sharp(pixels, raw).trim({ threshold: 1 }).png().toBuffer()
    await sharp(trimmed)
      .extend({ top: PAD, bottom: PAD, left: PAD, right: PAD, background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png({ compressionLevel: 9 })
      .toFile(path.join(OUT, name))
    const m = await sharp(path.join(OUT, name)).metadata()
    console.log(`${name}  ${m.width}×${m.height}`)
  }
}

void main()
