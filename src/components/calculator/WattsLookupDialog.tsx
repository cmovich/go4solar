'use client'

import { Camera, Upload } from 'lucide-react'
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

type State =
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
  onUse: (watts: number) => void
}) {
  const [state, setState] = useState<State>({ step: 'idle' })
  const cameraRef = useRef<HTMLInputElement>(null)
  const uploadRef = useRef<HTMLInputElement>(null)

  // Reset and free the preview URL when the dialog closes.
  useEffect(() => {
    if (open) return
    setState((s) => {
      if ('preview' in s && s.preview) URL.revokeObjectURL(s.preview)
      return { step: 'idle' }
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
            Snap the label at the back or bottom of the appliance. The photo is read once and not
            kept.
          </DialogDescription>
        </DialogHeader>

        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => void handleFile(e.target.files?.[0])}
        />
        <input
          ref={uploadRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => void handleFile(e.target.files?.[0])}
        />

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
            Reading the label…
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
            {result.method === 'estimate' && result.watts !== null && (
              <>
                <p className="text-brand-dark text-2xl font-bold">
                  About {result.watts.toLocaleString('en-US')} W
                  <span className="bg-brand-orange ml-2 rounded-full px-2 py-0.5 align-middle text-xs font-bold text-white uppercase">
                    Estimate
                  </span>
                </p>
                <p className="text-muted-foreground text-sm">
                  {result.appliance ? `${result.appliance} · ` : ''}
                  {result.low !== undefined && result.high !== undefined
                    ? `typically ${result.low.toLocaleString('en-US')}–${result.high.toLocaleString('en-US')} W`
                    : 'no label visible, so this is a typical value'}
                </p>
              </>
            )}
            {(result.method === 'unreadable' || result.watts === null) && (
              <p className="text-brand-dark text-sm">
                We couldn&apos;t read a label in that photo. Try again closer, with the sticker in
                focus and good light.
              </p>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          {state.step !== 'idle' && (
            <Button
              type="button"
              variant="outline"
              className="h-11"
              onClick={() => setState({ step: 'idle' })}
            >
              Try another photo
            </Button>
          )}
          {result && result.watts !== null && (
            <Button type="button" className="h-11" onClick={() => onUse(result.watts as number)}>
              Use this value
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
