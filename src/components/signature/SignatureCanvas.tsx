'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'

const INK = '#0E3B22'
const MIN_POINTS = 8

/**
 * Draw a signature with a finger or mouse. Calls onChange with a PNG data URL after each
 * stroke, or null when cleared / too short to count as a signature.
 */
export function SignatureCanvas({
  onChange,
  disabled = false,
  typedName = '',
}: {
  onChange: (png: string | null) => void
  disabled?: boolean
  /** Keyboard alternative: sign with this typed name instead of drawing. */
  typedName?: string
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const points = useRef(0)
  const [empty, setEmpty] = useState(true)

  const context = useCallback(() => canvasRef.current?.getContext('2d') ?? null, [])

  // Match the drawing buffer to the on-screen size (sharp on high-density phone screens).
  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = context()
    if (!canvas || !ctx) return
    const ratio = window.devicePixelRatio || 1
    const { width, height } = canvas.getBoundingClientRect()
    canvas.width = Math.max(1, Math.round(width * ratio))
    canvas.height = Math.max(1, Math.round(height * ratio))
    ctx.scale(ratio, ratio)
    ctx.lineWidth = 2.4
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = INK
  }, [context])

  function at(e: React.PointerEvent<HTMLCanvasElement>) {
    const r = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  function start(e: React.PointerEvent<HTMLCanvasElement>) {
    if (disabled) return
    const ctx = context()
    if (!ctx) return
    e.currentTarget.setPointerCapture?.(e.pointerId)
    drawing.current = true
    const p = at(e)
    ctx.beginPath()
    ctx.moveTo(p.x, p.y)
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return
    const ctx = context()
    if (!ctx) return
    const p = at(e)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
    points.current += 1
  }

  function end() {
    if (!drawing.current) return
    drawing.current = false
    const enough = points.current >= MIN_POINTS
    setEmpty(!enough)
    onChange(enough ? (canvasRef.current?.toDataURL('image/png') ?? null) : null)
  }

  function clear() {
    const canvas = canvasRef.current
    const ctx = context()
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height)
    points.current = 0
    setEmpty(true)
    onChange(null)
  }

  /** Keyboard / screen-reader alternative to drawing: the typed full name becomes the signature. */
  function signWithTypedName() {
    const canvas = canvasRef.current
    const ctx = context()
    const name = typedName.trim()
    if (!canvas || !ctx || name.length < 3) return
    const { width, height } = canvas.getBoundingClientRect()
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.save()
    ctx.fillStyle = INK
    ctx.font = 'italic 600 34px Inter, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(name, width / 2, height / 2, width - 24)
    ctx.restore()
    points.current = MIN_POINTS
    setEmpty(false)
    onChange(canvas.toDataURL('image/png'))
  }

  return (
    <div>
      <div className="relative rounded-xl border-2 border-dashed border-slate-300 bg-white">
        <canvas
          ref={canvasRef}
          data-testid="signature-canvas"
          aria-label="Signature box: draw your signature with your finger or mouse"
          className="block h-40 w-full touch-none"
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerLeave={end}
          onPointerCancel={end}
        />
        {empty && (
          <span className="text-muted-foreground pointer-events-none absolute inset-x-0 bottom-3 text-center text-sm">
            Sign here with your finger or mouse
          </span>
        )}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="mt-1"
        onClick={clear}
        disabled={disabled}
      >
        Clear
      </Button>
      <Button
        type="button"
        variant="link"
        size="sm"
        className="mt-1"
        onClick={signWithTypedName}
        disabled={disabled || typedName.trim().length < 3}
      >
        Use my typed name as my signature
      </Button>
    </div>
  )
}
