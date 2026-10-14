import type { Metadata } from 'next'

import { LinkedText } from '@/components/admin/outbox/LinkedText'
import { STAFF_ROLES, requireRole } from '@/lib/auth/roles'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Outbox' }

const date = (iso: string) =>
  new Date(iso).toLocaleString('en-NG', {
    timeZone: 'Africa/Lagos',
    dateStyle: 'medium',
    timeStyle: 'short',
  })

/** Messages the mock messaging provider "sent" (and, later, live delivery status). */
export default async function OutboxPage() {
  await requireRole(...STAFF_ROLES)
  const supabase = await createClient()
  const { data: rows, error } = await supabase
    .from('outbox')
    .select('id, channel, to, template, payload, status, created_at')
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) throw new Error(error.message)

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <h1 className="text-brand-dark text-3xl font-bold">Outbox</h1>
      <p className="text-muted-foreground mt-1 text-sm">
        {process.env.MESSAGING_PROVIDER === 'live'
          ? 'Live messaging: this list shows delivery status.'
          : 'Mock messaging: nothing is really sent. Every message lands here instead.'}
      </p>
      <div className="mt-6 space-y-3">
        {rows.map((r) => {
          const payload = (r.payload ?? {}) as Record<string, unknown>
          const text = typeof payload.text === 'string' ? payload.text : JSON.stringify(payload)
          return (
            <article key={r.id} className="rounded-xl border bg-white p-4" data-testid="outbox-row">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="bg-brand-green rounded-full px-2 py-0.5 font-semibold text-white uppercase">
                  {r.channel}
                </span>
                <span className="text-brand-dark font-medium">{r.to}</span>
                <span className="text-muted-foreground">· {r.template}</span>
                <span className="text-muted-foreground">· {r.status}</span>
                <span className="text-muted-foreground ml-auto">{date(r.created_at)}</span>
              </div>
              {typeof payload.subject === 'string' && (
                <p className="text-brand-dark mt-2 text-sm font-semibold">{payload.subject}</p>
              )}
              <p className="text-muted-foreground mt-1 text-sm whitespace-pre-wrap">
                <LinkedText text={text} />
              </p>
            </article>
          )
        })}
        {rows.length === 0 && <p className="text-muted-foreground text-sm">No messages yet.</p>}
      </div>
    </main>
  )
}
