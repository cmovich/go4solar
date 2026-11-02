import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { beforeAll, describe, expect, it } from 'vitest'

import type { Database } from '@/lib/supabase/database.types'

import { testEmail, testPhone, toE164 } from '../../../e2e/helpers/test-identity'

/**
 * Row Level Security, every table, against the real database (skipped without .env.local).
 * Users A, B and a staff member use test identities (flagged is_test). Nothing is deleted: the
 * rows stay as labelled test data.
 */
config({ path: '.env.local', quiet: true })
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const service = process.env.SUPABASE_SERVICE_ROLE_KEY
const hasDb = Boolean(url && anonKey && service)
const TOKEN_SECRET = 'local-test-only-guarantor-0123456789'
process.env.GUARANTOR_TOKEN_SECRET ??= TOKEN_SECRET

type Table = keyof Database['public']['Tables']
type Access = 'own' | 'staff' | 'server' | 'public' | 'profit-staff'

/** Who may read each table. A table missing here fails the coverage test below. */
const ACCESS: Record<Table, Access> = {
  accessory_rules: 'staff',
  agreement_templates: 'staff',
  logistics_costs: 'staff',
  rack_prices: 'staff',
  agreements: 'own',
  appliance_library: 'public',
  sun_hours: 'staff',
  applications: 'own',
  change_requests: 'own',
  audit_log: 'staff',
  cash_referrals: 'staff',
  category_margins: 'staff',
  components: 'staff',
  consents: 'own',
  documents: 'own',
  email_verifications: 'server',
  forecast_scenarios: 'profit-staff',
  funder_draws: 'staff',
  funders: 'staff',
  guarantees: 'own',
  installation_costs: 'staff',
  jobs: 'own',
  kyc_checks: 'own',
  loan_profit_snapshots: 'profit-staff',
  loans: 'own',
  mandates: 'own',
  outbox: 'staff',
  overheads: 'staff',
  partners: 'public',
  roof_types: 'public',
  payments: 'own',
  phone_otps: 'server',
  pricing_rates: 'staff',
  profiles: 'own',
  quotes: 'own',
  rate_limits: 'server',
  reminders: 'staff',
  repayment_schedule: 'own',
  settings: 'staff',
  signature_otps: 'server',
  staff_permissions: 'staff',
  testimonials: 'public',
  unit_costs: 'staff',
  waitlist_consumers: 'staff',
  waitlist_exports: 'staff',
  waitlist_installers: 'staff',
}

describe('every table is covered', () => {
  it('ACCESS lists exactly the tables in the database types', () => {
    const types = readFileSync(
      path.join(process.cwd(), 'src/lib/supabase/database.types.ts'),
      'utf8',
    )
    const tablesBlock = types.slice(types.indexOf('Tables: {'), types.indexOf('Views: {'))
    const names = [...tablesBlock.matchAll(/^ {6}(\w+): \{$/gm)].map((m) => m[1]).sort()
    expect(names.length).toBeGreaterThan(30)
    expect(Object.keys(ACCESS).sort()).toEqual(names)
  })
})

describe.skipIf(!hasDb)('RLS against the real database', () => {
  const admin = hasDb
    ? createClient<Database>(url!, service!, { auth: { persistSession: false } })
    : null!
  const password = `Rls-${randomUUID()}-Aa1!`
  const ids: Record<string, string> = {}
  /** One row owned by (or about) A in each private table. */
  const owned: Partial<Record<Table, string>> = {}
  // Tables whose migration is not applied yet (their checks run once it is).
  const notYetMigrated = new Set<Table>()
  let a: SupabaseClient<Database>
  let b: SupabaseClient<Database>
  let staff: SupabaseClient<Database>
  let anon: SupabaseClient<Database>
  let kycPath = ''
  let tokenA = ''

  async function user(label: string, role?: 'credit_officer') {
    const email = testEmail(label)
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })
    if (error) throw error
    await admin
      .from('profiles')
      .update({ phone_e164: toE164(testPhone()), ...(role ? { role } : {}) })
      .eq('id', data.user.id)
    const c = createClient<Database>(url!, anonKey!, { auth: { persistSession: false } })
    const s = await c.auth.signInWithPassword({ email, password })
    if (s.error) throw s.error
    return { id: data.user.id, client: c }
  }
  const must = <R extends { data: unknown; error: { message: string } | null }>(
    r: R,
  ): NonNullable<R['data']> => {
    if (r.error || r.data === null) throw new Error(r.error?.message ?? 'no data')
    return r.data as NonNullable<R['data']>
  }

  beforeAll(async () => {
    const [ua, ub, us] = await Promise.all([
      user('rls-a'),
      user('rls-b'),
      user('rls-staff', 'credit_officer'),
    ])
    a = ua.client
    b = ub.client
    staff = us.client
    ids.a = ua.id
    anon = createClient<Database>(url!, anonKey!, { auth: { persistSession: false } })

    const quote = must(
      await admin
        .from('quotes')
        .insert({
          owner_id: ids.a,
          anon_token_hash: `rls:${randomUUID()}`,
          state: 'Lagos',
          load_items: [],
          load_totals: {},
          plan: 'comfort',
          system_size: {},
          deposit_share: 0.2,
          tenure: 12,
          result: {},
          valid_until: new Date(Date.now() + 7 * 86400000).toISOString(),
          status: 'chosen',
        })
        .select('id')
        .single(),
    )
    owned.quotes = quote.id
    const app = must(
      await admin
        .from('applications')
        .insert({
          consumer_id: ids.a,
          quote_id: quote.id,
          status: 'submitted',
          personal: { firstName: 'Rls' },
        })
        .select('id')
        .single(),
    )
    owned.applications = app.id
    kycPath = `${ids.a}/${app.id}/nin_front-${randomUUID().slice(0, 8)}.pdf`
    const up = await admin.storage
      .from('kyc')
      .upload(kycPath, new Blob(['%PDF-1.4 rls test'], { type: 'application/pdf' }), {
        contentType: 'application/pdf',
      })
    if (up.error) throw up.error
    owned.documents = must(
      await admin
        .from('documents')
        .insert({
          owner_id: ids.a,
          application_id: app.id,
          kind: 'nin_front',
          storage_path: kycPath,
        })
        .select('id')
        .single(),
    ).id
    owned.kyc_checks = must(
      await admin
        .from('kyc_checks')
        .insert({
          subject_type: 'consumer',
          subject_id: app.id,
          kind: 'nin',
          provider: 'mock',
          status: 'passed',
          attempt: 1,
          result_summary: {},
        })
        .select('id')
        .single(),
    ).id
    const { newGuaranteeToken } = await import('@/lib/agreements/tokens')
    const t = newGuaranteeToken(process.env.GUARANTOR_TOKEN_SECRET)
    tokenA = t.token
    owned.guarantees = must(
      await admin
        .from('guarantees')
        .insert({
          application_id: app.id,
          name: 'Rls Guarantor',
          phone: toE164(testPhone()),
          email: testEmail('rls-guarantor'),
          token_hash: t.hash,
          expires_at: new Date(Date.now() + 3600000).toISOString(),
        })
        .select('id')
        .single(),
    ).id
    const template = must(
      await admin
        .from('agreement_templates')
        .select('id, version')
        .eq('type', 'consumer')
        .limit(1)
        .single(),
    )
    owned.agreements = must(
      await admin
        .from('agreements')
        .insert({
          type: 'consumer',
          template_id: template.id,
          version: template.version,
          subject_id: ids.a,
          application_id: app.id,
          signer_name: 'Rls',
          signature_path: `${ids.a}/sig.png`,
          typed_name: 'Rls',
          otp_verified_at: new Date().toISOString(),
          pdf_path: `${ids.a}/a.pdf`,
          pdf_sha256: '0'.repeat(64),
          content_sha256: '0'.repeat(64),
        })
        .select('id')
        .single(),
    ).id
    const loan = must(
      await admin
        .from('loans')
        .insert({
          application_id: app.id,
          consumer_id: ids.a,
          system_price: 100,
          cost_price: 80,
          deposit: 20,
          balance: 80,
          tenure: 3,
        })
        .select('id')
        .single(),
    )
    owned.loans = loan.id
    owned.repayment_schedule = must(
      await admin
        .from('repayment_schedule')
        .insert({ loan_id: loan.id, n: 1, due_date: '2027-01-01', amount: 80 })
        .select('id')
        .single(),
    ).id
    owned.mandates = must(
      await admin
        .from('mandates')
        .insert({
          consumer_id: ids.a,
          application_id: app.id,
          provider: 'mock',
          init_reference: `RLS-${randomUUID()}`,
        })
        .select('id')
        .single(),
    ).id
    owned.payments = must(
      await admin
        .from('payments')
        .insert({
          provider: 'mock',
          reference: `RLS-${randomUUID()}`,
          kind: 'deposit',
          consumer_id: ids.a,
          application_id: app.id,
          amount: 20,
        })
        .select('id')
        .single(),
    ).id
    owned.jobs = must(
      await admin
        .from('jobs')
        .insert({
          loan_id: loan.id,
          installer_name: 'Rls Installs',
          installer_phone: toE164(testPhone()),
          equipment_source: 'go4solar_store',
          pickup_code: '123456',
        })
        .select('id')
        .single(),
    ).id
    owned.consents = must(
      await admin
        .from('consents')
        .insert({
          subject_type: 'profile',
          subject_id: ids.a,
          profile_id: ids.a,
          kind: 'biometric',
          text_version: 'biometric-test',
          text_sha256: '0'.repeat(64),
        })
        .select('id')
        .single(),
    ).id
    // From migration 0025: until it is applied the table is missing and is checked after.
    const change = await admin
      .from('change_requests')
      .insert({ consumer_id: ids.a, field: 'name', new_value: 'Rls Name Change' })
      .select('id')
      .single()
    if (change.data) owned.change_requests = change.data.id
    else notYetMigrated.add('change_requests')
    owned.profiles = ids.a
  }, 120_000)

  const ownTables = () =>
    (Object.keys(ACCESS) as Table[]).filter((t) => ACCESS[t] === 'own' && !notYetMigrated.has(t))

  it('A reads every one of their own rows (control)', async () => {
    for (const t of ownTables()) {
      const { data } = await a
        .from(t as never)
        .select('id')
        .eq('id', owned[t]!)
      expect(data, t).toHaveLength(1)
    }
  }, 60_000)

  it('B cannot read A’s rows in any private table', async () => {
    for (const t of ownTables()) {
      const { data } = await b
        .from(t as never)
        .select('id')
        .eq('id', owned[t]!)
      expect(data ?? [], t).toEqual([])
    }
  }, 60_000)

  it('B cannot update or delete A’s rows (checked with the service role afterwards)', async () => {
    const patch: Partial<Record<Table, Record<string, unknown>>> = {
      repayment_schedule: { paid_amount: 80 },
      profiles: { full_name: 'hacked' },
    }
    for (const t of ownTables()) {
      const p = patch[t] ?? { created_at: new Date('2000-01-01').toISOString() }
      await b
        .from(t as never)
        .update(p as never)
        .eq('id', owned[t]!)
      await b
        .from(t as never)
        .delete()
        .eq('id', owned[t]!)
      const { data } = await admin
        .from(t as never)
        .select('*')
        .eq('id', owned[t]!)
        .single()
      expect(data, `${t} still there`).not.toBeNull()
      for (const [k, v] of Object.entries(p))
        expect((data as unknown as Record<string, unknown>)[k], `${t}.${k}`).not.toEqual(v)
    }
  }, 90_000)

  it('a visitor who is not signed in reads nothing private', async () => {
    for (const t of Object.keys(ACCESS) as Table[]) {
      if (ACCESS[t] === 'public') continue
      const { data } = await anon
        .from(t as never)
        .select('*')
        .limit(5)
      expect(data ?? [], t).toEqual([])
    }
  }, 60_000)

  it('staff-only and server-only tables return nothing to a customer', async () => {
    for (const t of Object.keys(ACCESS) as Table[]) {
      if (ACCESS[t] === 'own' || ACCESS[t] === 'public') continue
      const { data } = await a
        .from(t as never)
        .select('*')
        .limit(5)
      expect(data ?? [], t).toEqual([])
    }
  }, 60_000)

  it('server-only tables refuse even a plain read (no table privileges)', async () => {
    for (const t of [
      'email_verifications',
      'phone_otps',
      'rate_limits',
      'signature_otps',
    ] as const) {
      const { error } = await a.from(t).select('*').limit(1)
      expect(error?.code, t).toBe('42501')
    }
  }, 30_000)

  it('kyc files: signed URLs only for the owner and staff', async () => {
    expect((await a.storage.from('kyc').createSignedUrl(kycPath, 60)).error).toBeNull()
    expect((await staff.storage.from('kyc').createSignedUrl(kycPath, 60)).error).toBeNull()
    expect((await b.storage.from('kyc').createSignedUrl(kycPath, 60)).error).not.toBeNull()
    expect((await anon.storage.from('kyc').createSignedUrl(kycPath, 60)).error).not.toBeNull()
  }, 30_000)

  it('a guarantor link opens only its own application', async () => {
    const { openGuarantee } = await import('@/lib/agreements/guarantor')
    const mine = await openGuarantee(tokenA)
    expect(mine.check).toBe('ok')
    expect(mine.row?.application_id).toBe(owned.applications)
    const other = await openGuarantee(`${tokenA.slice(0, -4)}abcd`)
    expect(other).toEqual({ check: 'not_found', row: null })
  }, 30_000)

  it('a customer cannot change is_test, role, the email-verified date, prices, funders or approvals', async () => {
    expect(
      (await a.from('profiles').update({ is_test: false }).eq('id', ids.a!)).error,
    ).not.toBeNull()
    expect(
      (await a.from('profiles').update({ role: 'super_admin' }).eq('id', ids.a!)).error,
    ).not.toBeNull()
    expect(
      (
        await a
          .from('profiles')
          .update({ email_verified_at: new Date().toISOString() })
          .eq('id', ids.a!)
      ).error,
    ).not.toBeNull()
    expect(
      (await a.from('profiles').update({ phone_e164: '+2348031234567' }).eq('id', ids.a!)).error,
    ).not.toBeNull()
    // Their own name is fine.
    expect(
      (await a.from('profiles').update({ full_name: 'Rls A' }).eq('id', ids.a!)).error,
    ).toBeNull()

    const before = must(await admin.from('components').select('id, unit_cost').limit(1).single())
    await a.from('components').update({ unit_cost: 1 }).eq('id', before.id)
    expect(
      must(await admin.from('components').select('unit_cost').eq('id', before.id).single())
        .unit_cost,
    ).toBe(before.unit_cost)

    const funder = must(
      await admin.from('funders').select('id, balance_available').limit(1).single(),
    )
    await a.from('funders').update({ balance_available: 1 }).eq('id', funder.id)
    expect(
      must(await admin.from('funders').select('balance_available').eq('id', funder.id).single())
        .balance_available,
    ).toBe(funder.balance_available)

    await a.from('applications').update({ status: 'approved' }).eq('id', owned.applications!)
    expect(
      must(await admin.from('applications').select('status').eq('id', owned.applications!).single())
        .status,
    ).toBe('submitted')
    await a.from('loans').update({ status: 'active' }).eq('id', owned.loans!)
    expect(
      must(await admin.from('loans').select('status').eq('id', owned.loans!).single()).status,
    ).toBe('pending_approval')

    // And cannot write rows for themselves where only the server may.
    const { error: insertError } = await a.from('payments').insert({
      provider: 'mock',
      reference: `RLS-FAKE-${randomUUID()}`,
      kind: 'deposit',
      consumer_id: ids.a!,
      amount: 1,
      status: 'success',
    })
    expect(insertError).not.toBeNull()
    const profile = must(
      await admin.from('profiles').select('is_test, role').eq('id', ids.a!).single(),
    )
    expect(profile).toEqual({ is_test: true, role: 'consumer' })
  }, 60_000)
})
