import { createAdminClient } from '@/lib/supabase/admin'
import type { Json } from '@/lib/supabase/database.types'

import type { MessagingProvider } from './index'

/** Writes every message to the outbox table (shown at /admin/outbox) instead of sending it. */
export const mockMessagingProvider: MessagingProvider = {
  name: 'mock',
  async send(message) {
    const { data, error } = await createAdminClient()
      .from('outbox')
      .insert({
        channel: message.channel,
        to: message.to,
        template: message.template,
        payload: message.payload as Json,
        status: 'queued',
      })
      .select('id')
      .single()
    if (error) {
      console.error('[messaging:mock] outbox insert failed:', error.message)
      return { id: '', status: 'failed' }
    }
    return { id: data.id, status: 'queued' }
  },
}
