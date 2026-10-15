import { createAdminClient } from '@/lib/supabase/admin'
import type { Json } from '@/lib/supabase/database.types'

import type { MessagingProvider } from './index'

/**
 * Production without SMS/email keys (prelaunch): nothing can be sent yet, so every message is
 * recorded in the outbox as "not_sent" for staff to follow up. Never throws.
 */
export const unsentMessagingProvider: MessagingProvider = {
  name: 'unsent',
  async send(message) {
    try {
      const { data, error } = await createAdminClient()
        .from('outbox')
        .insert({
          channel: message.channel,
          to: message.to,
          template: message.template,
          payload: message.payload as Json,
          status: 'not_sent',
        })
        .select('id')
        .single()
      if (error) throw new Error(error.message)
      return { id: data.id, status: 'not_sent' }
    } catch (err) {
      console.error(
        '[messaging:unsent] outbox insert failed:',
        err instanceof Error ? err.message : 'unknown error',
      )
      return { id: '', status: 'failed' }
    }
  },
}
