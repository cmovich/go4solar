import 'server-only'

import { formatNaira, formatPercent } from '@/lib/money'
import { getMessagingProvider } from '@/lib/providers/messaging'
import { PLAN_LABELS } from '@/lib/quotes/buildEstimate'
import type { Plan } from '@/lib/sizing/types'
import { PRICE_LATER_TEXT, THANK_YOU_TEXT } from '@/lib/waitlist/schema'

export type WaitlistConfirmation = {
  firstName: string
  phoneE164: string
  whatsappE164: string | null
  email: string | null
  plan: Plan
  /** Overrides the plan name (e.g. "Your own system" from the builder). */
  planLabel?: string
  depositShare: number
  systemPrice: number
  deposit: number
  monthly: number
  tenureMonths: number
  /** True while any price used is a SAMPLE price: no naira amounts are sent. */
  samplePrices: boolean
}

export { PRICE_LATER_TEXT, THANK_YOU_TEXT }

/** The copy that goes to the customer's email and WhatsApp (PRD step 9). */
export function confirmationText(c: WaitlistConfirmation): string {
  const what = c.planLabel ?? `${PLAN_LABELS[c.plan]} plan`
  if (c.samplePrices) {
    return (
      `Hi ${c.firstName}. ${THANK_YOU_TEXT}\n\n` +
      `Your choice: ${what}, ${formatPercent(c.depositShare)} upfront. ` +
      PRICE_LATER_TEXT
    )
  }
  return (
    `Hi ${c.firstName}. ${THANK_YOU_TEXT}\n\n` +
    `Your estimate: ${what} — total ${formatNaira(c.systemPrice)}, ` +
    `${formatNaira(c.deposit)} upfront (${formatPercent(c.depositShare)}) then ` +
    `${formatNaira(c.monthly)} a month for ${c.tenureMonths} months. 0% interest. ` +
    `This is an estimate; your final quote comes at launch.`
  )
}

/** Sends the confirmation to every channel the customer gave us. Never throws. */
export async function sendWaitlistConfirmation(c: WaitlistConfirmation): Promise<void> {
  const provider = await getMessagingProvider()
  const text = confirmationText(c)
  const payload = { text, firstName: c.firstName, plan: c.plan, depositShare: c.depositShare }
  const sends = [
    provider.send({
      channel: 'whatsapp',
      to: c.whatsappE164 ?? c.phoneE164,
      template: 'waitlist_confirmation',
      payload,
    }),
  ]
  if (c.email) {
    sends.push(
      provider.send({
        channel: 'email',
        to: c.email,
        template: 'waitlist_confirmation',
        payload: { ...payload, subject: 'Your Go4Solar solar plan estimate' },
      }),
    )
  }
  const results = await Promise.allSettled(sends)
  for (const r of results) {
    if (r.status === 'rejected') {
      console.error(
        '[waitlist] confirmation failed:',
        r.reason instanceof Error ? r.reason.message : 'send error',
      )
    }
  }
}

export function installerThankYouText(name: string): string {
  return `Thank you, ${name}. We will contact you within 7 days about becoming a Go4Solar partner installer.`
}
