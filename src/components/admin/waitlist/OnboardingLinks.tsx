'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { Button } from '@/components/ui/button'

import { sendLeadOnboardingLink } from '@/app/admin/(shell)/waitlist/profiles/actions'

export type OnboardingLinkView = {
  itemId: string
  funderName: string
  batch: string
  url: string
  scope: 'person' | 'batch'
  whatsappHref: string
  hasEmail: boolean
  sends: { channel: 'whatsapp' | 'email'; at: string; by: string }[]
}

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-NG', {
    timeZone: 'Africa/Lagos',
    dateStyle: 'medium',
    timeStyle: 'short',
  })

/** The funders' onboarding links for this person, with "Send by WhatsApp" / "Send by email". */
export function OnboardingLinks({
  waitlistId,
  links,
}: {
  waitlistId: string
  links: OnboardingLinkView[]
}) {
  if (links.length === 0) return null
  return (
    <section className="mt-6 space-y-3 rounded-xl border p-4" data-testid="onboarding-links">
      <h2 className="text-brand-dark font-semibold">Funder onboarding links</h2>
      <p className="text-muted-foreground text-sm">
        Where the customer completes their details and verification with the funder.
      </p>
      {links.map((l) => (
        <LinkRow key={l.itemId} waitlistId={waitlistId} l={l} />
      ))}
    </section>
  )
}

function LinkRow({ waitlistId, l }: { waitlistId: string; l: OnboardingLinkView }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const record = (channel: 'whatsapp' | 'email') =>
    start(async () => {
      const r = await sendLeadOnboardingLink({ itemId: l.itemId, channel, waitlistId })
      setMsg(
        r.ok
          ? {
              ok: true,
              text:
                channel === 'email' ? 'Emailed to the customer.' : 'Recorded: sent by WhatsApp.',
            }
          : { ok: false, text: r.error },
      )
      if (r.ok) router.refresh()
    })
  return (
    <div className="rounded-lg border p-3 text-sm" data-testid="onboarding-link">
      <p className="font-medium">
        {l.funderName} · {l.batch} {l.scope === 'batch' ? '(link for the whole batch)' : ''}
      </p>
      <p className="mt-1 break-all">
        <a href={l.url} target="_blank" rel="noreferrer" className="text-brand-blue underline">
          {l.url}
        </a>
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button asChild size="sm">
          <a
            href={l.whatsappHref}
            target="_blank"
            rel="noreferrer"
            onClick={() => record('whatsapp')}
            data-testid="send-whatsapp"
          >
            Send by WhatsApp
          </a>
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending || !l.hasEmail}
          onClick={() => record('email')}
          data-testid="send-email"
        >
          {l.hasEmail ? 'Send by email' : 'No email address'}
        </Button>
      </div>
      {l.sends.length > 0 && (
        <ul className="text-muted-foreground mt-2 text-xs" data-testid="onboarding-sends">
          {l.sends.map((x, i) => (
            <li key={i}>
              Sent by {x.channel === 'email' ? 'email' : 'WhatsApp'}: {x.by}, {when(x.at)}
            </li>
          ))}
        </ul>
      )}
      {msg && (
        <p
          className={msg.ok ? 'text-brand-green mt-1 text-xs' : 'text-destructive mt-1 text-xs'}
          role="status"
        >
          {msg.text}
        </p>
      )}
    </div>
  )
}
