'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { NairaField } from '@/components/admin/NairaField'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { VisionSettings } from '@/lib/vision/spend'

import { saveVisionSettings } from '@/app/admin/(shell)/photo-lookup/actions'

const NUMBER_FIELDS: [keyof VisionSettings, string, string][] = [
  ['perVisitorPerDay', 'Lookups per visitor per day', '1'],
  ['nairaPerUsd', 'Naira per US dollar', 'any'],
  ['inputUsdPerMTok', 'Input price, US$ per million tokens', 'any'],
  ['outputUsdPerMTok', 'Output price, US$ per million tokens', 'any'],
  ['webSearchUsd', 'Web search, US$ each', 'any'],
]

export function VisionSettingsForm({ initial }: { initial: VisionSettings }) {
  const router = useRouter()
  const [v, setV] = useState<VisionSettings>(initial)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [pending, start] = useTransition()
  return (
    <form
      className="space-y-4"
      data-testid="vision-form"
      onSubmit={(e) => {
        e.preventDefault()
        setMsg(null)
        start(async () => {
          const r = await saveVisionSettings(v)
          setMsg(r.ok ? { ok: true, text: 'Saved.' } : { ok: false, text: r.error })
          if (r.ok) router.refresh()
        })
      }}
    >
      <div className="space-y-1">
        <Label htmlFor="vs-cap">Daily spend cap (0 switches the photo lookup off)</Label>
        <NairaField
          id="vs-cap"
          value={v.dailyCapNaira}
          onChange={(n) => setV({ ...v, dailyCapNaira: n })}
        />
      </div>
      {NUMBER_FIELDS.map(([k, label, step]) => (
        <div key={k} className="space-y-1">
          <Label htmlFor={`vs-${k}`}>{label}</Label>
          <Input
            id={`vs-${k}`}
            type="number"
            step={step}
            value={String(v[k] ?? '')}
            onChange={(e) => setV({ ...v, [k]: Number(e.target.value) })}
            className="h-11 w-48"
          />
        </div>
      ))}
      {msg && (
        <Alert variant={msg.ok ? 'default' : 'destructive'} role="status">
          <AlertDescription>{msg.text}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" className="h-11" disabled={pending}>
        {pending ? 'Saving…' : 'Save photo lookup settings'}
      </Button>
    </form>
  )
}
