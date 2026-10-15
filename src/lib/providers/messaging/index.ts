import { deployEnv, mockProvidersAllowed } from '@/lib/testmode/policy'

export type MessageChannel = 'sms' | 'whatsapp' | 'email'

export type OutboundMessage = {
  channel: MessageChannel
  /** E.164 phone for sms/whatsapp, email address for email. */
  to: string
  /** Template name, e.g. 'waitlist_confirmation'. */
  template: string
  payload: Record<string, unknown>
}

export type MessagingProvider = {
  name: 'mock' | 'live' | 'unsent'
  send(
    message: OutboundMessage,
  ): Promise<{ id: string; status: 'queued' | 'sent' | 'failed' | 'not_sent' }>
}

/**
 * MESSAGING_PROVIDER=live → the live adapter (Termii/Resend, later prompt). Otherwise previews and
 * local runs use the mock (outbox, "queued"); production never uses the mock: messages are kept
 * in the outbox as "not_sent". Never throws, so a message can never break a page.
 */
export async function getMessagingProvider(): Promise<MessagingProvider> {
  if (process.env.MESSAGING_PROVIDER === 'live') {
    const { liveMessagingProvider } = await import('./live')
    return liveMessagingProvider
  }
  if (!mockProvidersAllowed(deployEnv())) {
    const { unsentMessagingProvider } = await import('./unsent')
    return unsentMessagingProvider
  }
  const { mockMessagingProvider } = await import('./mock')
  return mockMessagingProvider
}
