'use client'

import { Camera, Refrigerator, Tag, Upload } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { visionResultSchema, type VisionResult } from '@/lib/providers/vision/schema'

const MAX_BYTES = 5 * 1024 * 1024

type Kind = 'label' | 'item'

/** What "Use this value" hands back: the watts and where they came from. */
export type PhotoWatts = {
  watts: number
  source: 'label' | 'web' | 'estimate'
  range?: { low: number; high: number }
}

type State =
  | { step: 'choose' }
  | { step: 'idle' }
  | { step: 'loading'; preview: string }
  | { step: 'result'; preview: string; result: VisionResult }
  | { step: 'error'; preview: string | null; message: string }

export function WattsLookupDialog({
  open,
  itemName,
  onClose,
  onUse,
}: {
  open: boolean
  itemName: string
  onClose: () => void
  /** Called only when the user taps "Use this value" — never automatically. */
  onUse: (value: PhotoWatts) => void
}) {
  const [state, setState] = useState<State>({ step: 'choose' })
  const [kind, setKind] = useState<Kind>('label')
  const cameraRef = useRef<HTMLInputElement>(null)
  const uploadRef = useRef<HTMLInputElement>(null)

  // Reset and free the preview URL when the dialog closes.
  useEffect(() => {
    if (open) return
    setState((s) => {
      if ('preview' in s && s.preview) URL.revokeObjectURL(s.preview)
      return { step: 'choose' }
    })
  }, [open])

  async function handleFile(file: File | undefined) {
    if (!file) return
    if (file.size > MAX_BYTES) {
      setState({
        step: 'error',
        preview: null,
        message: 'That photo is over 5 MB. Try a smaller one.',
      })
      return
    }
    const preview = URL.createObjectURL(file)
    setState({ step: 'loading', preview })

    const body = new FormData()
    body.append('image', file)
    body.append('kind', kind)
    try {
      const res = await fetch('/api/vision/watts', { method: 'POST', body })
      const json: unknown = await res.json().catch(() => null)
      if (!res.ok) {
        const message =
          typeof json === 'object' && json && 'error' in json && typeof json.error === 'string'
            ? json.error
            : 'Could not read the photo. Please try again.'
        setState({ step: 'error', preview, message })
        return
      }
      const parsed = visionResultSchema.safeParse(json)
      if (!parsed.success) {
        setState({ step: 'error', preview, message: 'Unexpected reply. Please try again.' })
        return
      }
      setState({ step: 'result', preview, result: parsed.data })
    } catch {
      setState({
        step: 'error',
        preview,
        message: 'No connection. Check your network and try again.',
      })
    }
  }

  const preview = 'preview' in state ? state.preview : null
  const result = state.step === 'result' ? state.result : null

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-brand-dark">Find the watts: {itemName}</DialogTitle>
          <DialogDescription>
            {kind === 'label' && state.step !== 'choose'
              ? 'Snap the label at the back or bottom of the appliance.'
              : state.step === 'choose'
                ? 'Use a photo of the rating label (exact watts) or of the appliance itself (an estimate).'
                : 'Snap the whole appliance. If the brand and model are clearly visible we look up its rating.'}{' '}
            The photo is read once and not kept.
          </DialogDescription>
        </DialogHeader>

        <input
          ref={cameraRef}
          aria-label="Take a photo of the appliance label"
          tabIndex={-1}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => void handleFile(e.target.files?.[0])}
        />
        <input
          ref={uploadRef}
          aria-label="Upload a photo of the appliance label"
          tabIndex={-1}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => void handleFile(e.target.files?.[0])}
        />

        {state.step === 'choose' && (
          <div className="grid gap-3" data-testid="photo-kind">
            <Button
              type="button"
              className="h-auto min-h-14 justify-start gap-3 py-2 text-left"
              onClick={() => {
                setKind('label')
                setState({ step: 'idle' })
              }}
            >
              <Tag className="h-5 w-5 shrink-0" aria-hidden />
              <span>
                Photo of the label
                <span className="block text-xs font-normal opacity-90">
                  Exact watts from the sticker
                </span>
              </span>
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-auto min-h-14 justify-start gap-3 py-2 text-left"
              onClick={() => {
                setKind('item')
                setState({ step: 'idle' })
              }}
            >
              <Refrigerator className="h-5 w-5 shrink-0" aria-hidden />
              <span>
                Photo of the appliance
                <span className="text-muted-foreground block text-xs font-normal">
                  No label? We estimate the watts
                </span>
              </span>
            </Button>
          </div>
        )}

        {state.step === 'idle' && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Button type="button" className="h-12" onClick={() => cameraRef.current?.click()}>
              <Camera className="h-5 w-5" aria-hidden /> Take a photo
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-12"
              onClick={() => uploadRef.current?.click()}
            >
              <Upload className="h-5 w-5" aria-hidden /> Upload a photo
            </Button>
          </div>
        )}

        {preview && (
          // eslint-disable-next-line @next/next/no-img-element -- local object URL, not an asset
          <img src={preview} alt="" className="max-h-48 w-full rounded-lg object-contain" />
        )}

        {state.step === 'loading' && (
          <p className="text-muted-foreground text-sm" role="status">
            {kind === 'label' ? 'Reading the label…' : 'Looking at the appliance…'}
          </p>
        )}

        {state.step === 'error' && (
          <Alert variant="destructive">
            <AlertDescription>{state.message}</AlertDescription>
          </Alert>
        )}

        {result && (
          <div className="bg-brand-mist rounded-lg p-4" role="status">
            {result.method === 'label' && result.watts !== null && (
              <>
                <p className="text-brand-dark text-2xl font-bold">
                  {result.watts.toLocaleString('en-US')} W
                </p>
                <p className="text-muted-foreground text-sm">
                  Read from the label{result.appliance ? ` · ${result.appliance}` : ''}
                </p>
              </>
            )}
            {result.method === 'web' && result.watts !== null && (
              <>
                <p className="text-brand-dark text-2xl font-bold">
                  {result.watts.toLocaleString('en-US')} W
                </p>
                <p className="text-muted-foreground text-sm">
                  From the maker&apos;s specs for{' '}
                  {[result.brand, result.model].filter(Boolean).join(' ')}
                  {result.appliance ? ` · ${result.appliance}` : ''}
                </p>
              </>
            )}
            {result.method === 'estimate' && result.watts !== null && (
              <>
                <p className="text-brand-dark text-2xl font-bold" data-testid="photo-estimate">
                  {result.watts.toLocaleString('en-US')} W
                  <span className="bg-brand-orange text-brand-dark ml-2 rounded-full px-2 py-0.5 align-middle text-xs font-bold uppercase">
                    Estimated
                  </span>
                </p>
                <p className="text-muted-foreground text-sm">
                  {result.appliance ? `${result.appliance} · ` : ''}
                  {result.low !== undefined && result.high !== undefined
                    ? `usually ${result.low.toLocaleString('en-US')}–${result.high.toLocaleString('en-US')} W; we size with the upper part of that range`
                    : 'a typical value for this appliance'}
                </p>
              </>
            )}
            {(result.method === 'unreadable' || result.watts === null) && (
              <p className="text-brand-dark text-sm">
                {kind === 'label'
                  ? "We couldn't read a label in that photo. Try again closer, with the sticker in focus and good light."
                  : "We couldn't tell what this appliance is. Try a clearer photo, or type the watts."}
              </p>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          {state.step !== 'idle' && state.step !== 'choose' && (
            <Button
              type="button"
              variant="outline"
              className="h-11"
              onClick={() => setState({ step: 'choose' })}
            >
              Try another photo
            </Button>
          )}
          {result && result.watts !== null && result.method !== 'unreadable' && (
            <Button
              type="button"
              className="h-11"
              onClick={() =>
                onUse({
                  watts: result.watts as number,
                  source: result.method as PhotoWatts['source'],
                  ...(result.method === 'estimate' &&
                  result.low !== undefined &&
                  result.high !== undefined
                    ? { range: { low: result.low, high: result.high } }
                    : {}),
                })
              }
            >
              Use this value
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
