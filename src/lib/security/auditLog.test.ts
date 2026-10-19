import { randomUUID } from 'node:crypto'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { beforeAll, describe, expect, it } from 'vitest'

import type { Database } from '@/lib/supabase/database.types'

import { testEmail } from '../../../e2e/helpers/test-identity'

/**
 * The permanent audit log and the home-page content tables, against the real database
 * (migration 0020). Skipped without .env.local, and until 0020 is applied. Test identities only;
 * rows made here are flagged is_test and removed again (their audit rows stay, as they must).
 */
config({ path: '.env.local', quiet: true })
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const service = process.env.SUPABASE_SERVICE_ROLE_KEY
const hasDb = Boolean(url && anonKey && service)

const admin = hasDb
  ? createClient<Database>(url!, service!, { auth: { persistSession: false } })
  : (null as unknown as SupabaseClient<Database>)
let migrated = false
if (hasDb) {
  const { error } = await admin.from('audit_log').select('source').limit(1)
  migrated = !error
}

describe.skipIf(!hasDb || !migrated)('permanent audit log (migration 0020)', () => {
  const password = `Audit-${randomUUID()}-Aa1!`
  let staffId = ''
  let staffEmail = ''
  let staff: SupabaseClient<Database>
  let customer: SupabaseClient<Database>
  let customerId = ''

  async function account(label: string, role: 'content' | 'consumer') {
    const email = testEmail(label)
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })
    if (error) throw error
    if (role !== 'consumer') await admin.from('profiles').update({ role }).eq('id', data.user.id)
    const c = createClient<Database>(url!, anonKey!, { auth: { persistSession: false } })
    const s = await c.auth.signInWithPassword({ email, password })
    if (s.error) throw s.error
    return { id: data.user.id, email, client: c }
  }

  const latest = async (entity: string, entityId: string) =>
    (
      await admin
        .from('audit_log')
        .select('*')
        .eq('entity', entity)
        .eq('entity_id', entityId)
        .order('created_at', { ascending: false })
    ).data ?? []

  beforeAll(async () => {
    const s = await account('audit-content', 'content')
    staffId = s.id
    staffEmail = s.email
    staff = s.client
    const c = await account('audit-customer', 'consumer')
    customerId = c.id
    customer = c.client
  }, 60_000)

  it('a staff change through their own session is recorded with who, before and after', async () => {
    const { data: p } = await staff
      .from('partners')
      .insert({ name: 'Audit test partner' })
      .select()
      .single()
    expect(p?.is_test).toBe(true)
    await staff.from('partners').update({ name: 'Audit test partner 2' }).eq('id', p!.id)
    const rows = await latest('partners', p!.id)
    expect(rows.map((r) => r.action)).toEqual(['db.update', 'db.insert'])
    expect(rows[0]).toMatchObject({
      actor_id: staffId,
      actor_email: staffEmail,
      actor_role: 'content',
      source: 'trigger',
    })
    expect((rows[0]!.before as { name: string }).name).toBe('Audit test partner')
    expect((rows[0]!.after as { name: string }).name).toBe('Audit test partner 2')
    await staff.from('partners').delete().eq('id', p!.id)
    expect((await latest('partners', p!.id))[0]?.action).toBe('db.delete')
  }, 30_000)

  it('a server (service role) change names the staff member it was made for', async () => {
    const server = createClient<Database>(url!, service!, {
      auth: { persistSession: false },
      global: { headers: { 'x-g4s-actor-id': staffId } },
    })
    const { data: p } = await server
      .from('partners')
      .insert({ name: 'Audit server partner', is_test: true })
      .select()
      .single()
    const [row] = await latest('partners', p!.id)
    expect(row).toMatchObject({ actor_id: staffId, actor_email: staffEmail, action: 'db.insert' })
    await admin.from('partners').delete().eq('id', p!.id)
  }, 30_000)

  it('a browser cannot pretend to be someone else (the header counts only for the server)', async () => {
    const forged = createClient<Database>(url!, anonKey!, {
      auth: { persistSession: false },
      global: { headers: { 'x-g4s-actor-id': staffId } },
    })
    const { error } = await forged.from('partners').insert({ name: 'Forged' })
    expect(error).not.toBeNull() // visitors cannot write at all
    // A customer editing their own profile is not a staff change: nothing is logged for it.
    await customer.from('profiles').update({ full_name: 'Audit Customer' }).eq('id', customerId)
    const rows = await latest('profiles', customerId)
    expect(rows.filter((r) => r.source === 'trigger')).toEqual([])
  }, 30_000)

  it('audit rows can never be changed or deleted, not even by the service role', async () => {
    const { data: row } = await admin.from('audit_log').select('id, action').limit(1).single()
    const upd = await admin.from('audit_log').update({ action: 'tampered' }).eq('id', row!.id)
    expect(upd.error).not.toBeNull()
    const del = await admin.from('audit_log').delete().eq('id', row!.id)
    expect(del.error).not.toBeNull()
    const { data: still } = await admin
      .from('audit_log')
      .select('action')
      .eq('id', row!.id)
      .single()
    expect(still?.action).toBe(row!.action)
  }, 30_000)

  it('site-media: only super admin / Content staff upload; nobody else uploads or deletes; everyone can view', async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    const path = `test/${randomUUID()}.png`
    const anon = createClient<Database>(url!, anonKey!, { auth: { persistSession: false } })
    const put = (c: SupabaseClient<Database>, p: string) =>
      c.storage.from('site-media').upload(p, png, { contentType: 'image/png' })

    // A visitor and a signed-in customer cannot upload.
    expect((await put(anon, `test/${randomUUID()}.png`)).error).not.toBeNull()
    expect((await put(customer, `test/${randomUUID()}.png`)).error).not.toBeNull()
    // Content staff can.
    expect((await put(staff, path)).error).toBeNull()
    // Anyone can view it through the public address.
    const res = await fetch(`${url}/storage/v1/object/public/site-media/${path}`)
    expect(res.status).toBe(200)
    // Visitors and customers cannot delete it (the file stays) …
    await anon.storage.from('site-media').remove([path])
    await customer.storage.from('site-media').remove([path])
    expect((await fetch(`${url}/storage/v1/object/public/site-media/${path}`)).status).toBe(200)
    // Content staff cannot delete either yet (deleting needs a read policy too; see the 0021
    // proposal). The site never deletes pictures; the server removes this test file.
    expect((await admin.storage.from('site-media').remove([path])).error).toBeNull()
  }, 60_000)

  it('testimonials: cannot be published without both consents; test rows never shown to visitors', async () => {
    const base = {
      client_name: 'Amaka',
      client_city: 'Ikeja',
      client_quote: 'Quiet nights at last.',
      system_size: '3.5 kVA',
      installer_name: 'Musa',
    }
    const bad = await staff
      .from('testimonials')
      .insert({ ...base, published: true, consent_client: true })
    expect(bad.error?.code).toBe('23514')
    const { data: t } = await staff
      .from('testimonials')
      .insert({ ...base, published: true, consent_client: true, consent_installer: true })
      .select()
      .single()
    expect(t?.is_test).toBe(true)
    const anon = createClient<Database>(url!, anonKey!, { auth: { persistSession: false } })
    const { data: seen } = await anon.from('testimonials').select('id').eq('id', t!.id)
    expect(seen).toEqual([])
    await staff.from('testimonials').delete().eq('id', t!.id)
  }, 30_000)
})
