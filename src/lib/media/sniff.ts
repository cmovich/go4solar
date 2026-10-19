export type SniffedImage = {
  type: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/svg+xml'
  width: number
  height: number
}

const startsWith = (b: Uint8Array, sig: number[], at = 0) => sig.every((v, i) => b[at + i] === v)

/**
 * The real type and pixel size of an uploaded file, read from its first bytes (the file name and
 * the browser's type can lie). null when it is not a PNG, JPEG, WebP or SVG. SVG has no reliable
 * pixel size here (0 × 0).
 */
export function sniffImage(b: Uint8Array): SniffedImage | null {
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength)
  if (b.length >= 24 && startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { type: 'image/png', width: view.getUint32(16), height: view.getUint32(20) }
  }
  if (b.length >= 4 && startsWith(b, [0xff, 0xd8, 0xff])) {
    // Walk the JPEG segments to the frame header (SOF0–SOF15, except 0xC4/0xC8/0xCC).
    let i = 2
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) return null
      const marker = b[i + 1]!
      const len = view.getUint16(i + 2)
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { type: 'image/jpeg', height: view.getUint16(i + 5), width: view.getUint16(i + 7) }
      }
      i += 2 + len
    }
    return null
  }
  if (
    b.length >= 30 &&
    startsWith(b, [0x52, 0x49, 0x46, 0x46]) &&
    startsWith(b, [0x57, 0x45, 0x42, 0x50], 8)
  ) {
    const chunk = String.fromCharCode(b[12]!, b[13]!, b[14]!, b[15]!)
    if (chunk === 'VP8 ') {
      return {
        type: 'image/webp',
        width: view.getUint16(26, true) & 0x3fff,
        height: view.getUint16(28, true) & 0x3fff,
      }
    }
    if (chunk === 'VP8L') {
      const bits = view.getUint32(21, true)
      return { type: 'image/webp', width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 }
    }
    if (chunk === 'VP8X') {
      const w = 1 + (b[24]! | (b[25]! << 8) | (b[26]! << 16))
      const h = 1 + (b[27]! | (b[28]! << 8) | (b[29]! << 16))
      return { type: 'image/webp', width: w, height: h }
    }
    return null
  }
  const head = new TextDecoder().decode(b.slice(0, 1024)).trimStart()
  if (/^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(head)) {
    return { type: 'image/svg+xml', width: 0, height: 0 }
  }
  return null
}

/** An SVG logo is shown as an image: refuse anything that could run code or load other files. */
export function svgIsSafe(text: string): boolean {
  return !(
    /<script/i.test(text) ||
    /\son[a-z]+\s*=/i.test(text) ||
    /javascript:/i.test(text) ||
    /<foreignObject/i.test(text) ||
    /(href|src)\s*=\s*["']\s*(https?:|\/\/|data:)/i.test(text)
  )
}
