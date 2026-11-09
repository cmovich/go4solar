import { closeSync, openSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

import { TEST_EMAIL_DOMAIN } from './helpers/test-identity'
import { totp } from './helpers/totp'

/**
 * Prepares two staff test accounts for the admin e2e tests (a super admin and an operations
 * member without extra permissions), each with a known password and a fresh TOTP factor, and
 * exposes the credentials to the tests through process.env (same process as the runner).
 * Skipped entirely when the Supabase env vars are absent; the admin tests then skip too.
 */
export default async function globalSetup() {
  config({ path: '.env.local' })
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !anon || !service) {
    console.warn('[e2e] Supabase env missing: admin tests will be skipped')
    return
  }

  const admin = serviceClient(url, service)

  // Local runs all share one IP: reset the per-IP quotas so repeated runs are not rate-limited.
  await admin
    .from('rate_limits')
    .delete()
    .or(
      'key.like.waitlist:%,key.like.waitlist-phone:%,key.like.vision:%,key.like.vision-day:%,key.like.otp-send:%,key.like.otp-verify:%,key.like.sig-otp:%,key.like.sig-verify:%,key.like.login:%,key.like.login-email:%,key.like.signup:%,key.like.guarantee-open:%,key.like.guarantee-steps:%,key.like.export:%,key.like.forgot:%,key.like.forgot-email:%,key.like.build:%,key.like.advice:%,key.like.staffq:%',
    )

  const staff = await prepareStaff(
    url,
    anon,
    admin,
    `e2e-staff@${TEST_EMAIL_DOMAIN}`,
    'super_admin',
    `E2e-${service.slice(-12)}!`,
  )
  // A second staff member with an ordinary role and no extra permissions (Part W: cannot delete).
  const ops = await prepareStaff(
    url,
    anon,
    admin,
    `e2e-ops@${TEST_EMAIL_DOMAIN}`,
    'operations',
    `E2e-ops-${service.slice(-12)}!`,
  )
  await admin.from('staff_permissions').delete().eq('profile_id', ops.userId)
  // A sales account (Quotations only). The role exists from migration 0033; before it, skipped.
  const sales = await prepareStaff(
    url,
    anon,
    admin,
    `e2e-sales@${TEST_EMAIL_DOMAIN}`,
    'sales',
    `E2e-sales-${service.slice(-12)}!`,
  ).catch((e: unknown) => {
    console.warn('[global-setup] no sales test account (migration 0033 not applied?):', e)
    return null
  })

  // 4. hand over to the tests
  process.env.E2E_STAFF_EMAIL = staff.email
  process.env.E2E_STAFF_PASSWORD = staff.password
  process.env.E2E_STAFF_TOTP_SECRET = staff.secret
  process.env.E2E_OPS_EMAIL = ops.email
  process.env.E2E_OPS_PASSWORD = ops.password
  process.env.E2E_OPS_TOTP_SECRET = ops.secret
  if (sales) {
    process.env.E2E_SALES_EMAIL = sales.email
    process.env.E2E_SALES_PASSWORD = sales.password
    process.env.E2E_SALES_TOTP_SECRET = sales.secret
  }
}

const serviceClient = (url: string, service: string) =>
  createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } })
type Admin = ReturnType<typeof serviceClient>

/**
 * 1. creates (or reuses) a confirmed user with a known password, 2. sets the role,
 * 3. removes old authenticator factors and enrols + verifies a fresh TOTP factor.
 */
async function prepareStaff(
  url: string,
  anon: string,
  admin: Admin,
  email: string,
  role: 'super_admin' | 'operations' | 'sales',
  password: string,
) {
  // 1. user
  let userId: string | undefined
  // Look through every page: the shared project has more than one page of accounts.
  let existing: { id: string } | undefined
  for (let page = 1; !existing; page++) {
    const { data: list } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
    const users = list?.users ?? []
    existing = users.find((u) => u.email === email)
    if (users.length < 1000) break
  }
  if (existing) {
    userId = existing.id
    await admin.auth.admin.updateUserById(userId, { password, email_confirm: true })
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name:
          role === 'super_admin' ? 'E2E Staff' : role === 'sales' ? 'E2E Sales' : 'E2E Operations',
      },
    })
    if (error) throw error
    userId = data.user.id
  }

  // 2. role
  const { error: roleError } = await admin.from('profiles').update({ role }).eq('id', userId)
  if (roleError) throw roleError

  // 3. MFA: wipe old factors, enrol a new one as the user, verify it with a computed code
  const { data: factors } = await admin.auth.admin.mfa.listFactors({ userId })
  for (const f of factors?.factors ?? []) {
    await admin.auth.admin.mfa.deleteFactor({ id: f.id, userId })
  }
  const user = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
  const { error: signInError } = await user.auth.signInWithPassword({ email, password })
  if (signInError) throw signInError
  const { data: enrol, error: enrolError } = await user.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: 'e2e',
  })
  if (enrolError) throw enrolError
  const { error: verifyError } = await user.auth.mfa.challengeAndVerify({
    factorId: enrol.id,
    code: totp(enrol.totp.secret),
  })
  if (verifyError) throw verifyError
  // That code's 30 s window is now used: tests signing in must wait for the next one.
  try {
    closeSync(
      openSync(path.join(tmpdir(), `g4s-e2e-totp-${Math.floor(Date.now() / 30_000)}`), 'wx'),
    )
  } catch {
    // Already reserved.
  }
  await user.auth.signOut()

  return { userId, email, password, secret: enrol.totp.secret }
}
