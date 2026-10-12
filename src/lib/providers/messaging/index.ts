import { MockInProductionError, deployEnv, mockProvidersAllowed } from '@/lib/testmode/policy'

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
  name: 'mock' | 'live'
  send(message: OutboundMessage): Promise<{ id: string; status: 'queued' | 'sent' | 'failed' }>
}

/** MESSAGING_PROVIDER=mock (default) writes to the outbox table; 'live' is wired in a later prompt. */
export async function getMessagingProvider(): Promise<MessagingProvider> {
  if (process.env.MESSAGING_PROVIDER === 'live') {
    const { liveMessagingProvider } = await import('./live')
    return liveMessagingProvider
  }
  if (!mockProvidersAllowed(deployEnv())) throw new MockInProductionError('Messaging')
  const { mockMessagingProvider } = await import('./mock')
  return mockMessagingProvider
}
