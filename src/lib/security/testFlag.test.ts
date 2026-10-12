import { randomUUID } from 'node:crypto'

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { describe, expect, it } from 'vitest'

import type { Database } from '@/lib/supabase/database.types'

import {
  plainEmailWithTestPhone,
  testPhone,
  testPlusEmail,
  toE164,
} from '../../../e2e/helpers/test-identity'

/**
 * The is_test trigger on profiles (migration 0016), against the real database (skipped without
 * .env.local). Identities come from e2e/helpers/test-identity.ts (+g4stest email or +234800000
 * phone), so every account this test creates is flagged test; accounts are created confirmed, so
 * no mail is sent. Nothing is deleted. The staff checks end by switching the account to a
 * customer, which flags it test as well.
 */
config({ path: '.env.local', quiet: true })
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const service = process.env.SUPABASE_SERVICE_ROLE_KEY
const hasDb = Boolean(url && service)
type Role = Database['public']['Enums']['app_role']

describe.skipIf(!hasDb)('is_test flag (profiles trigger)', () => {
  const admin = hasDb
    ? createClient<Database>(url!, service!, { auth: { persistSession: false } })
    : null!

  /** Create an account, then set its role and phone the way the app does (service role). */
  async function account(email: string, role: Role, phone?: string) {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: `Flag-${randomUUID()}-Aa1!`,
      email_confirm: true,
    })
    if (error) throw error
    const { error: e2 } = await admin
      .from('profiles')
      .update({ role, ...(phone ? { phone_e164: phone } : {}) })
      .eq('id', data.user.id)
    if (e2) throw e2
    return data.user.id
  }
  const flag = async (id: string) =>
    (await admin.from('profiles').select('role, is_test').eq('id', id).single()).data

  it('an installer with a +g4stest email is test', async () => {
    const id = await account(testPlusEmail('installer'), 'installer')
    expect(await flag(id)).toEqual({ role: 'installer', is_test: true })
  }, 60_000)

  it('an installer with a +234800000 phone (and a real-looking email) is test', async () => {
    const id = await account(plainEmailWithTestPhone('installer'), 'installer', toE164(testPhone()))
    expect(await flag(id)).toEqual({ role: 'installer', is_test: true })
  }, 60_000)

  it('vendors and guarantors follow the same rule', async () => {
    expect(await flag(await account(testPlusEmail('vendor'), 'vendor'))).toEqual({
      role: 'vendor',
      is_test: true,
    })
    expect(
      await flag(
        await account(plainEmailWithTestPhone('guarantor'), 'guarantor', toE164(testPhone())),
      ),
    ).toEqual({
      role: 'guarantor',
      is_test: true,
    })
  }, 60_000)

  it('a staff account with a +g4stest email or a test phone is never test (only @go4solar.test is)', async () => {
    const plus = await account(testPlusEmail('staff'), 'operations')
    expect(await flag(plus)).toEqual({ role: 'operations', is_test: false })
    const phone = await account(plainEmailWithTestPhone('staff'), 'finance', toE164(testPhone()))
    expect(await flag(phone)).toEqual({ role: 'finance', is_test: false })

    // Leave nothing that looks real: as customers, both accounts become test data.
    for (const id of [plus, phone]) {
      await admin.from('profiles').update({ role: 'consumer' }).eq('id', id)
      expect(await flag(id)).toEqual({ role: 'consumer', is_test: true })
    }
  }, 60_000)
})
