/**
 * Make a super admin (run on your own machine only: it uses the service role key in .env.local).
 *   npm run make-admin -- you@email.com
 * If there is no account for that email yet, it asks for a password (typed twice, hidden) and
 * creates the account with the email already confirmed. Then it sets the role to super_admin,
 * checks the account is NOT marked as test data, and writes an audit_log row.
 * After that: sign in at /login and set up the authenticator app at /admin/mfa.
 */
import { createInterface } from 'node:readline'
import { Writable } from 'node:stream'

import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

import type { Database } from '../src/lib/supabase/database.types'

config({ path: '.env.local' })

/** Ask for a password without showing what is typed. */
function askHidden(question: string): Promise<string> {
  let muted = false
  const output = new Writable({
    write(chunk, _encoding, done) {
      if (!muted) process.stdout.write(chunk)
      done()
    },
  })
  const rl = createInterface({ input: process.stdin, output, terminal: true })
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close()
      process.stdout.write('\n')
      resolve(answer)
    })
    muted = true
  })
}

async function main(): Promise<void> {
  const email = process.argv[2]?.trim().toLowerCase()
  if (!email || !email.includes('@')) {
    console.error('Usage: npm run make-admin -- you@email.com')
    process.exit(1)
  }
  if (email.endsWith('@go4solar.test') || email.split('@')[0]!.includes('+g4stest')) {
    console.error('That is a test address. Use your real email for your own admin account.')
    process.exit(1)
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceRoleKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
    process.exit(1)
  }
  const admin = createClient<Database>(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  let { data: profile } = await admin
    .from('profiles')
    .select('id, role')
    .ilike('email', email)
    .maybeSingle()

  if (!profile) {
    console.log(`No account for ${email} yet. Choose a password for it (at least 12 characters).`)
    const password = await askHidden('Password: ')
    const again = await askHidden('Type it again: ')
    if (password !== again) throw new Error('The two passwords are different. Nothing was created.')
    if (password.length < 12) throw new Error('Use at least 12 characters. Nothing was created.')
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })
    if (error) throw new Error(`Could not create the account: ${error.message}`)
    // The sign-up trigger creates the profile row.
    for (let i = 0; i < 10 && !profile; i++) {
      profile = (
        await admin.from('profiles').select('id, role').eq('id', data.user.id).maybeSingle()
      ).data
      if (!profile) await new Promise((r) => setTimeout(r, 500))
    }
    if (!profile)
      throw new Error('Account created, but its profile did not appear. Run this again.')
    console.log(`Account created for ${email}.`)
  }

  if (profile.role !== 'super_admin') {
    const { error } = await admin
      .from('profiles')
      .update({ role: 'super_admin' })
      .eq('id', profile.id)
    if (error) throw error
    const { error: auditError } = await admin.from('audit_log').insert({
      actor_id: null,
      action: 'profile.role.set',
      entity: 'profiles',
      entity_id: profile.id,
      before: { role: profile.role },
      after: { role: 'super_admin', via: 'scripts/make-super-admin.ts' },
    })
    if (auditError) throw auditError
  }

  const { data: check } = await admin
    .from('profiles')
    .select('role, is_test')
    .eq('id', profile.id)
    .single()
  if (!check || check.role !== 'super_admin' || check.is_test) {
    throw new Error(
      `Unexpected result: ${JSON.stringify(check)}. Ask Claude to look before going on.`,
    )
  }
  console.log(`${email} is a super admin (real account, not test data).`)
  console.log('Next: open /login on the preview, sign in, then scan the QR code at /admin/mfa.')
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
