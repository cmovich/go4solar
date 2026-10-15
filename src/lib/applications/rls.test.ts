import { randomUUID } from 'node:crypto'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { beforeAll, describe, expect, it } from 'vitest'

import type { Database } from '@/lib/supabase/database.types'

import { testEmail } from '../../../e2e/helpers/test-identity'

// Integration test against the real database: two users, A owns an application, a document and
// a KYC file; B must see none of it. Skipped without .env.local.
config({ path: '.env.local', quiet: true })
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const service = process.env.SUPABASE_SERVICE_ROLE_KEY
const hasDb = Boolean(url && anon && service)

describe.skipIf(!hasDb)('RLS: one consumer cannot read another’s application data', () => {
  const admin = hasDb
    ? createClient<Database>(url!, service!, { auth: { persistSession: false } })
    : null!
  const password = `Rls-${randomUUID()}`
  const ids: { a?: string; b?: string; app?: string; path?: string } = {}

  async function signedIn(email: string): Promise<SupabaseClient<Database>> {
    const c = createClient<Database>(url!, anon!, { auth: { persistSession: false } })
    const { error } = await c.auth.signInWithPassword({ email, password })
    if (error) throw error
    return c
  }

  beforeAll(async () => {
    const tag = randomUUID().slice(0, 8)
    const a = await admin.auth.admin.createUser({
      email: testEmail('rls-a', tag),
      password,
      email_confirm: true,
    })
    const b = await admin.auth.admin.createUser({
      email: testEmail('rls-b', tag),
      password,
      email_confirm: true,
    })
    if (a.error || b.error) throw a.error ?? b.error
    ids.a = a.data.user.id
    ids.b = b.data.user.id

    const { data: app, error } = await admin
      .from('applications')
      .insert({ consumer_id: ids.a, personal: { firstName: 'Ada', ninLast4: '4521' } })
      .select('id')
      .single()
    if (error) throw error
    ids.app = app.id
    ids.path = `${ids.a}/${app.id}/nin_front-${tag}.pdf`
    const up = await admin.storage
      .from('kyc')
      .upload(ids.path, new Blob(['%PDF-1.4 test'], { type: 'application/pdf' }), {
        contentType: 'application/pdf',
      })
    if (up.error) throw up.error
    await admin.from('documents').insert({
      owner_id: ids.a,
      application_id: app.id,
      kind: 'nin_front',
      storage_path: ids.path,
    })
    await admin.from('kyc_checks').insert({
      subject_type: 'consumer',
      subject_id: app.id,
      kind: 'nin',
      provider: 'mock',
      status: 'passed',
      result_summary: { last4: '4521' },
    })
  }, 90_000)

  // No clean-up: these rows use test identities (is_test) and stay as labelled test data.

  it('A can read their own application, document, check and file (control)', async () => {
    const a = await signedIn((await admin.auth.admin.getUserById(ids.a!)).data.user!.email!)
    expect((await a.from('applications').select('id').eq('id', ids.app!)).data).toHaveLength(1)
    expect(
      (await a.from('documents').select('id').eq('application_id', ids.app!)).data,
    ).toHaveLength(1)
    expect((await a.from('kyc_checks').select('id').eq('subject_id', ids.app!)).data).toHaveLength(
      1,
    )
    expect((await a.storage.from('kyc').download(ids.path!)).error).toBeNull()
  }, 60_000)

  it('B cannot read A’s application, documents, KYC checks or storage objects', async () => {
    const b = await signedIn((await admin.auth.admin.getUserById(ids.b!)).data.user!.email!)
    expect((await b.from('applications').select('id').eq('id', ids.app!)).data).toEqual([])
    expect((await b.from('documents').select('id').eq('application_id', ids.app!)).data).toEqual([])
    expect((await b.from('kyc_checks').select('id').eq('subject_id', ids.app!)).data).toEqual([])
    expect((await b.storage.from('kyc').download(ids.path!)).error).not.toBeNull()
    expect((await b.storage.from('kyc').createSignedUrl(ids.path!, 60)).error).not.toBeNull()
    // …and cannot write into A's folder either.
    const put = await b.storage
      .from('kyc')
      .upload(`${ids.a}/${ids.app}/sneaky.pdf`, new Blob(['x'], { type: 'application/pdf' }))
    expect(put.error).not.toBeNull()
  }, 60_000)

  it('an anonymous visitor reads nothing', async () => {
    const c = createClient<Database>(url!, anon!, { auth: { persistSession: false } })
    expect((await c.from('applications').select('id').eq('id', ids.app!)).data).toEqual([])
    expect((await c.storage.from('kyc').download(ids.path!)).error).not.toBeNull()
  }, 60_000)
})
