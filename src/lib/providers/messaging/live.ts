import type { MessagingProvider } from './index'
import { mockMessagingProvider } from './mock'

/**
 * Placeholder until Termii (SMS) and Resend (email) are wired in a later prompt: logs once and
 * records the message in the outbox so nothing is silently lost.
 */
export const liveMessagingProvider: MessagingProvider = {
  name: 'live',
  async send(message) {
    console.warn('[messaging:live] not configured yet; message recorded in outbox only')
    return mockMessagingProvider.send(message)
  },
}
