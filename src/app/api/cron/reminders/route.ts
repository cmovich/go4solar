import { NextResponse } from 'next/server'

import { sendReminder } from '@/lib/quotes/messages'
import { quoteReference } from '@/lib/quotes/quote'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/**
 * Vercel Cron: sends every reminder that is due and not yet sent ("Save and decide later").
 * Vercel calls it with `Authorization: Bearer $CRON_SECRET`; anything else is refused.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorised' }, { status: 401 })
  }

  const admin = createAdminClient()
  const { data: due, error } = await admin
    .from('reminders')
    .select('id, quote_id, channel, to')
    .is('sent_at', null)
    .lte('due_at', new Date().toISOString())
    .limit(200)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let sent = 0
  for (const r of due) {
    const { data: quote } = await admin
      .from('quotes')
      .select('id, status, waitlist_id')
      .eq('id', r.quote_id)
      .maybeSingle()
    // A customer who already chose a plan does not need a nudge.
    if (quote && quote.status === 'draft') {
      const { data: lead } = quote.waitlist_id
        ? await admin
            .from('waitlist_consumers')
            .select('first_name')
            .eq('id', quote.waitlist_id)
            .maybeSingle()
        : { data: null }
      await sendReminder(r.channel, r.to, lead?.first_name ?? 'there', quoteReference(quote.id))
      sent++
    }
    await admin.from('reminders').update({ sent_at: new Date().toISOString() }).eq('id', r.id)
  }
  return NextResponse.json({ due: due.length, sent })
}
