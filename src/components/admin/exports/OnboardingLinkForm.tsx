'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

import { saveOnboardingLink } from '@/app/admin/(shell)/funder/actions'

/** The funder's onboarding link for one person (itemId) or the whole batch (itemId null). */
export function OnboardingLinkForm(props: {
  batchId: string
  itemId: string | null
  url: string | null
  viewAs: string | null
  label: string
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [url, setUrl] = useState(props.url ?? '')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  return (
    <div className="flex flex-col gap-1" data-testid={props.itemId ? 'item-link' : 'batch-link'}>
      <div className="flex flex-wrap gap-2">
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://…"
          aria-label={props.label}
          className="h-9 min-w-48 flex-1 bg-white"
          maxLength={500}
        />
        <Button
          type="button"
          size="sm"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await saveOnboardingLink({
                batchId: props.batchId,
                itemId: props.itemId,
                url,
                viewAs: props.viewAs,
              })
              setMsg(
                r.ok
                  ? { ok: true, text: url ? 'Saved.' : 'Removed.' }
                  : { ok: false, text: r.error },
              )
              if (r.ok) router.refresh()
            })
          }
        >
          Save link
        </Button>
      </div>
      {msg && (
        <span
          className={msg.ok ? 'text-brand-green text-xs' : 'text-destructive text-xs'}
          role="status"
        >
          {msg.text}
        </span>
      )}
    </div>
  )
}
