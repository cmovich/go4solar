import { containFit, coverCrop } from './crop'
import { MAX_UPLOAD_BYTES, MEDIA_KINDS, type MediaKind } from './rules'

/**
 * Browser only: crop, resize and compress a chosen picture before upload. Photos become WebP
 * (JPG where the browser cannot write WebP); a PNG logo stays PNG so its transparency is kept;
 * an SVG logo is sent as it is (the server checks it is safe).
 */
export async function processImage(file: File, kind: MediaKind): Promise<File> {
  if (file.size > MAX_UPLOAD_BYTES) throw new Error('That picture is larger than 10 MB.')
  if (!file.type.startsWith('image/')) {
    throw new Error('That file is not a picture (use JPG, PNG or WebP).')
  }
  const k = MEDIA_KINDS[kind]
  if (file.type === 'image/svg+xml') {
    if (kind !== 'logo') throw new Error('That file is not a picture (use JPG, PNG or WebP).')
    return file
  }
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    throw new Error('That picture could not be opened. Try a JPG or PNG.')
  }
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('This browser cannot prepare pictures.')
  if (k.fit === 'cover') {
    const c = coverCrop(bitmap.width, bitmap.height, k.width, k.height)
    canvas.width = k.width
    canvas.height = k.height
    ctx.drawImage(bitmap, c.sx, c.sy, c.sw, c.sh, 0, 0, k.width, k.height)
  } else {
    const fit = containFit(bitmap.width, bitmap.height, k.width, k.height)
    canvas.width = fit.width
    canvas.height = fit.height
    ctx.clearRect(0, 0, fit.width, fit.height)
    ctx.drawImage(bitmap, 0, 0, fit.width, fit.height)
  }
  bitmap.close()

  const encode = (type: string, quality?: number) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality))
  let blob: Blob | null
  if (kind === 'logo' && file.type === 'image/png') {
    blob = await encode('image/png')
  } else {
    blob = await encode('image/webp', 0.82)
    // Browsers that cannot write WebP hand back PNG instead: use JPG for photos.
    if (!blob || blob.type !== 'image/webp') {
      blob = kind === 'logo' ? await encode('image/png') : await encode('image/jpeg', 0.85)
    }
  }
  if (!blob) throw new Error('This browser could not prepare the picture.')
  const ext = blob.type.split('/')[1] === 'jpeg' ? 'jpg' : blob.type.split('/')[1]
  return new File([blob], `${kind}.${ext}`, { type: blob.type })
}
