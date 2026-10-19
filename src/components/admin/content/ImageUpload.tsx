'use client'

import Image from 'next/image'
import { useId, useState } from 'react'

import { uploadSiteImage } from '@/lib/content/actions'
import { processImage } from '@/lib/media/process'
import { MEDIA_KINDS, type MediaKind } from '@/lib/media/rules'

/**
 * Pick a picture: the browser crops and compresses it to the kind's size, then it is uploaded to
 * the public site-media bucket. `previewUrl` is the current picture (if any).
 */
export function ImageUpload({
  kind,
  label,
  previewUrl,
  onUploaded,
}: {
  kind: MediaKind
  label: string
  previewUrl: string | null
  onUploaded: (path: string, localUrl: string) => void
}) {
  const id = useId()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const k = MEDIA_KINDS[kind]
  const round = kind === 'installer'

  async function choose(file: File | undefined) {
    if (!file) return
    setError(null)
    setBusy(true)
    try {
      const ready = await processImage(file, kind)
      const form = new FormData()
      form.set('kind', kind)
      form.set('file', ready)
      const r = await uploadSiteImage(form)
      if (r.ok) onUploaded(r.path, URL.createObjectURL(ready))
      else setError(r.error)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2">
      <label htmlFor={id} className="text-sm font-medium">
        {label}{' '}
        <span className="text-muted-foreground font-normal">
          (
          {k.fit === 'cover'
            ? `cropped to ${k.width} × ${k.height}`
            : `fitted inside ${k.width} × ${k.height}`}
          , max 10 MB)
        </span>
      </label>
      <div className="flex items-center gap-3">
        {previewUrl ? (
          <Image
            src={previewUrl}
            alt=""
            width={round ? 64 : 96}
            height={round ? 64 : k.fit === 'cover' ? 64 : 48}
            unoptimized
            className={`bg-brand-mist object-cover ${round ? 'rounded-full' : 'rounded-md object-contain'}`}
          />
        ) : (
          <span
            className={`bg-brand-mist text-muted-foreground flex items-center justify-center text-xs ${round ? 'h-16 w-16 rounded-full' : 'h-16 w-24 rounded-md'}`}
          >
            none
          </span>
        )}
        <input
          id={id}
          type="file"
          accept={
            kind === 'logo'
              ? 'image/png,image/jpeg,image/webp,image/svg+xml'
              : 'image/png,image/jpeg,image/webp'
          }
          disabled={busy}
          onChange={(e) => {
            void choose(e.target.files?.[0])
            e.target.value = ''
          }}
          className="text-sm"
        />
      </div>
      {busy && <p className="text-muted-foreground text-xs">Preparing and uploading…</p>}
      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
