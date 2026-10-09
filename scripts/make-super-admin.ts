/**
 * Make an existing user a super admin.
 *   npm run make-admin -- you@email.com
 * The person must have signed up at /login first (that creates their profile row).
 * Uses the service role key from .env.local, so run it only on your own machine.
 */
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

import type { Database } from '../src/lib/supabase/database.types'

config({ path: '.env.local' })

async function main(): Promise<void> {
  const email = process.argv[2]?.trim().toLowerCase()
  if (!email || !email.includes('@')) {
    console.error('Usage: npm run make-admin -- you@email.com')
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

  const { data: profile, error: findError } = await admin
    .from('profiles')
    .select('id, role')
    .ilike('email', email)
    .maybeSingle()
  if (findError) throw findError
  if (!profile) {
    console.error(`No profile for ${email}. Sign up at /login first, then run this again.`)
    process.exit(1)
  }
  if (profile.role === 'super_admin') {
    console.log(`${email} is already a super admin.`)
    return
  }

  const { error: updateError } = await admin
    .from('profiles')
    .update({ role: 'super_admin' })
    .eq('id', profile.id)
  if (updateError) throw updateError

  const { error: auditError } = await admin.from('audit_log').insert({
    actor_id: null,
    action: 'profile.role.set',
    entity: 'profiles',
    entity_id: profile.id,
    before: { role: profile.role },
    after: { role: 'super_admin', via: 'scripts/make-super-admin.ts' },
  })
  if (auditError) throw auditError

  console.log(`${email} is now a super admin. Sign out and in again, then open /admin.`)
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
