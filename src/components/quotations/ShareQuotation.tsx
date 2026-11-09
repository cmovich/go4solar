'use client'

import { useState } from 'react'

import { Button } from '@/components/ui/button'

import { recordShare } from '@/app/admin/(shell)/quotations/actions'

/** "Share on WhatsApp" (message with the total, monthly and link) and "Copy link". */
export function ShareQuotation({
  id,
  whatsappHref,
  link,
}: {
  id: string
  whatsappHref: string
  link: string
}) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button asChild className="h-11">
        <a
          href={whatsappHref}
          target="_blank"
          rel="noopener"
          data-testid="share-whatsapp"
          onClick={() => void recordShare({ id })}
        >
          Share on WhatsApp
        </a>
      </Button>
      <Button
        type="button"
        variant="outline"
        className="h-11"
        data-testid="copy-link"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(link)
            setCopied(true)
          } catch {
            // Clipboard blocked: the link is shown below to copy by hand.
          }
          void recordShare({ id })
        }}
      >
        {copied ? 'Link copied' : 'Copy link'}
      </Button>
    </div>
  )
}
