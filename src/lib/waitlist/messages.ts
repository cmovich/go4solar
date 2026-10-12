import 'server-only'

import { formatNaira, formatPercent } from '@/lib/money'
import { getMessagingProvider } from '@/lib/providers/messaging'
import { PLAN_LABELS } from '@/lib/quotes/buildEstimate'
import type { Plan } from '@/lib/sizing/types'

export type WaitlistConfirmation = {
  firstName: string
  phoneE164: string
  whatsappE164: string | null
  email: string | null
  plan: Plan
  depositShare: number
  systemPrice: number
  deposit: number
  monthly: number
  tenureMonths: number
}

/** The copy that goes to the customer's email and WhatsApp (PRD step 9). */
export function confirmationText(c: WaitlistConfirmation): string {
  return (
    `Thank you, ${c.firstName}. We will get back to you within the next 7 days.\n\n` +
    `Your estimate: ${PLAN_LABELS[c.plan]} plan — total ${formatNaira(c.systemPrice)}, ` +
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
