import 'server-only'

import { getMessagingProvider } from '@/lib/providers/messaging'

export type CustomerContact = { phone: string | null; email: string | null }

/** Tell the customer by SMS, WhatsApp and email (mock mode: all three land in the outbox). */
export async function notifyCustomer(
  to: CustomerContact,
  template: string,
  message: { subject: string; text: string },
) {
  const provider = await getMessagingProvider()
  await Promise.allSettled([
    to.phone &&
      provider.send({ channel: 'sms', to: to.phone, template, payload: { text: message.text } }),
    to.phone &&
      provider.send({
        channel: 'whatsapp',
        to: to.phone,
        template,
        payload: { text: message.text },
      }),
    to.email && provider.send({ channel: 'email', to: to.email, template, payload: message }),
  ])
}

/** Contact details stored on an application (personal jsonb). */
export function contactFromPersonal(personal: unknown): CustomerContact & { firstName: string } {
  const p = (personal ?? {}) as { phone?: string; email?: string; firstName?: string }
  return { phone: p.phone ?? null, email: p.email ?? null, firstName: p.firstName ?? '' }
}
