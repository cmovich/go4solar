import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

import { totp } from './helpers/totp'

/**
 * Prepares a staff test account for the admin e2e tests:
 *  1. creates (or reuses) a confirmed user with a known password,
 *  2. makes it a super_admin,
 *  3. removes old authenticator factors and enrols + verifies a fresh TOTP factor,
 *  4. exposes the credentials to the tests through process.env (same process as the runner).
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

  const email = 'e2e-staff@go4solar.test'
  const password = `E2e-${service.slice(-12)}!`
  const admin = createClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // Local runs all share one IP: reset the per-IP quotas so repeated runs are not rate-limited.
  await admin
    .from('rate_limits')
    .delete()
    .or('key.like.waitlist:%,key.like.vision:%,key.like.otp-send:%,key.like.otp-verify:%')

  // 1. user
  let userId: string | undefined
  const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 })
  const existing = list?.users.find((u) => u.email === email)
  if (existing) {
    userId = existing.id
    await admin.auth.admin.updateUserById(userId, { password, email_confirm: true })
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: 'E2E Staff' },
    })
    if (error) throw error
    userId = data.user.id
  }

  // 2. role
  await admin.from('profiles').update({ role: 'super_admin' }).eq('id', userId)

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
  await user.auth.signOut()

  // 4. hand over to the tests
  process.env.E2E_STAFF_EMAIL = email
  process.env.E2E_STAFF_PASSWORD = password
  process.env.E2E_STAFF_TOTP_SECRET = enrol.totp.secret
}
