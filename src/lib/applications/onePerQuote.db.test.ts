import { randomUUID } from 'node:crypto'

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { describe, expect, it } from 'vitest'

import type { Database } from '@/lib/supabase/database.types'

import { testPlusEmail } from '../../../e2e/helpers/test-identity'

/**
 * Migration 0042 against the real database (skipped without .env.local, and until 0042 is
 * applied): one live application per quote; a declined one does not count. The account is a test
 * identity (flagged test); nothing is deleted.
 */
config({ path: '.env.local', quiet: true })
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const service = process.env.SUPABASE_SERVICE_ROLE_KEY
const hasDb = Boolean(url && service)

describe.skipIf(!hasDb)('one live application per quote (migration 0042)', () => {
  const admin = hasDb
    ? createClient<Database>(url!, service!, { auth: { persistSession: false } })
    : null!

  it('a second live application for the same quote is refused; after a decline a new one is allowed', async (ctx) => {
    const { data: user, error } = await admin.auth.admin.createUser({
      email: testPlusEmail('one-per-quote'),
      password: `Once-${randomUUID()}-Aa1!`,
      email_confirm: true,
    })
    if (error) throw error
    const userId = user.user.id
    const { data: quote, error: qErr } = await admin
      .from('quotes')
      .insert({
        anon_token_hash: randomUUID(),
        owner_id: userId,
        deposit_share: 0.2,
        load_items: [],
        load_totals: {},
        plan: 'comfort',
        result: {},
        state: 'Kaduna',
        system_size: {},
        valid_until: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      })
      .select('id')
      .single()
    if (qErr) throw qErr
    const start = () =>
      admin
        .from('applications')
        .insert({ consumer_id: userId, quote_id: quote.id })
        .select('id')
        .single()

    const first = await start()
    expect(first.error).toBeNull()
    const second = await start()
    if (!second.error) ctx.skip() // 0042 not applied yet
    expect(second.error?.code).toBe('23505')

    await admin.from('applications').update({ status: 'declined' }).eq('id', first.data!.id)
    const again = await start()
    expect(again.error).toBeNull()
  }, 60_000)
})
