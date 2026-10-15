import 'server-only'

import { formatNaira, formatPercent } from '@/lib/money'
import { getMessagingProvider, type MessageChannel } from '@/lib/providers/messaging'
import type { Plan } from '@/lib/sizing/types'

import { PLAN_LABELS } from './buildEstimate'

export type SavedQuoteLine = {
  reference: string
  plan: Plan
  systemPrice: number
  deposit: number
  monthly: number
  tenureMonths: number
  depositShare: number
}

export type Recipient = {
  firstName: string
  phoneE164: string
  whatsappE164: string | null
  email: string | null
}

function channels(r: Recipient): { channel: MessageChannel; to: string }[] {
  const out: { channel: MessageChannel; to: string }[] = [
    { channel: 'whatsapp', to: r.whatsappE164 ?? r.phoneE164 },
  ]
  if (r.email) out.push({ channel: 'email', to: r.email })
  return out
}

export function savedQuotesText(
  firstName: string,
  lines: SavedQuoteLine[],
  validUntil: Date,
): string {
  const until = validUntil.toLocaleDateString('en-GB', {
    timeZone: 'Africa/Lagos',
    dateStyle: 'long',
  })
  return (
    `Hello ${firstName}, here are your Go4Solar solar plans (valid until ${until}):\n` +
    lines
      .map(
        (l) =>
          `• ${PLAN_LABELS[l.plan]} (${l.reference}): ${formatNaira(l.deposit)} upfront ` +
          `(${formatPercent(l.depositShare)}), then ${formatNaira(l.monthly)} a month for ${l.tenureMonths} months. ` +
          `Total ${formatNaira(l.systemPrice)}, 0% interest.`,
      )
      .join('\n') +
    `\nLate payments attract 0.75% of the overdue amount per day. Reply here when you are ready to choose.`
  )
}

/** Sends the saved plans to WhatsApp and email. Returns the channels used (for reminders). */
export async function sendSavedQuotes(
  r: Recipient,
  lines: SavedQuoteLine[],
  until: Date,
): Promise<{ channel: MessageChannel; to: string }[]> {
  const provider = await getMessagingProvider()
  const text = savedQuotesText(r.firstName, lines, until)
  const targets = channels(r)
  await Promise.allSettled(
    targets.map((t) =>
      provider.send({
        ...t,
        template: 'quotes_saved',
        payload: {
          text,
          subject: 'Your Go4Solar solar plans',
          references: lines.map((l) => l.reference),
        },
      }),
    ),
  )
  return targets
}

export async function sendReminder(
  channel: MessageChannel,
  to: string,
  firstName: string,
  reference: string,
) {
  const provider = await getMessagingProvider()
  return provider.send({
    channel,
    to,
    template: 'quote_reminder',
    payload: {
      subject: 'Your Go4Solar plans are waiting',
      text: `Hello ${firstName}, your Go4Solar solar plans (${reference}) are still waiting for you. Reply here or open the link we sent to choose a plan before it expires.`,
    },
  })
}

/** The one-time code goes by SMS. Never log it. */
export async function sendOtpSms(phoneE164: string, code: string) {
  const provider = await getMessagingProvider()
  return provider.send({
    channel: 'sms',
    to: phoneE164,
    template: 'otp_code',
    payload: { text: `Your Go4Solar code is ${code}. It expires in 10 minutes. Never share it.` },
  })
}

export async function sendCashReferralNotice(r: Recipient, reference: string) {
  const provider = await getMessagingProvider()
  await Promise.allSettled(
    channels(r).map((t) =>
      provider.send({
        ...t,
        template: 'cash_referral',
        payload: {
          subject: 'Buying your solar system outright',
          text: `Hello ${r.firstName}, thank you. We'll connect you to a verified vendor near you for your ${reference} system.`,
        },
      }),
    ),
  )
}
