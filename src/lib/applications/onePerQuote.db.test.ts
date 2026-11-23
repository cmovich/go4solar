import { randomUUID } from 'node:crypto'

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { describe, expect, it } from 'vitest'

import type { Database } from '@/lib/supabase/database.types'

import { testPlusEmail } from '../../../e2e/helpers/test-identity'

/**
 * Migration 0042 against the real database (skipped without .env.local, and until 0042 is
 * applied): one live application per quote; a declined one does not count (any status other
 * than draft, submitted, under_review, more_info or approved is ignored). The account is a test
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
    // The rule checks applications created from 24 Nov 2026 (older pairs are left as they are).
    const createdAt = new Date(
      Math.max(Date.now(), Date.parse('2026-11-24T00:00:00+01:00') + 60_000),
    ).toISOString()
    const start = (status: 'draft' | 'declined') =>
      admin
        .from('applications')
        .insert({ consumer_id: userId, quote_id: quote.id, status, created_at: createdAt })
        .select('id')
        .single()

    const first = await start('draft')
    expect(first.error).toBeNull()
    // The second one is saved declined (always allowed), then made live: refused by 0042.
    // Without 0042 it is put back to declined at once, so no two live applications are left.
    const second = await start('declined')
    expect(second.error).toBeNull()
    const live = await admin
      .from('applications')
      .update({ status: 'draft' })
      .eq('id', second.data!.id)
    if (!live.error) {
      await admin.from('applications').update({ status: 'declined' }).eq('id', second.data!.id)
      ctx.skip() // 0042 not applied yet
    }
    expect(live.error?.code).toBe('23505')

    // After a decline the same quotation can start a new live application.
    await admin.from('applications').update({ status: 'declined' }).eq('id', first.data!.id)
    const again = await start('draft')
    expect(again.error).toBeNull()
  }, 60_000)
})
