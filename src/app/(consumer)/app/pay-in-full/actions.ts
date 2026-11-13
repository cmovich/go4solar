'use server'

import { headers } from 'next/headers'

import { installAddressSchema } from '@/lib/applications/address'
import { ensureApplication, paysInFull } from '@/lib/applications/server'
import { siteOrigin } from '@/lib/auth/emailVerification'
import { getSessionInfo } from '@/lib/auth/session'
import { startFullPayment } from '@/lib/payments/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Json } from '@/lib/supabase/database.types'

type Result = { ok: true; url: string } | { ok: false; error: string; field?: string }

/**
 * Pay in full: save the installation address, then open the checkout for one payment of the
 * pay-in-full price. Only the signed-in customer, for their own pay-in-full order.
 */
export async function payInFull(input: unknown): Promise<Result> {
  const session = await getSessionInfo()
  if (!session.user) return { ok: false, error: 'Please sign in.' }
  const p = installAddressSchema.safeParse(input)
  if (!p.success) {
    const issue = p.error.issues[0]
    return { ok: false, error: issue?.message ?? 'Check the address', field: issue?.path.join('.') }
  }
  const app = await ensureApplication(session.user.id)
  if (!app || app.status !== 'draft' || !(await paysInFull(app))) {
    return { ok: false, error: 'This order cannot be paid here.' }
  }
  const { error } = await createAdminClient()
    .from('applications')
    .update({ install_address: p.data as unknown as Json })
    .eq('id', app.id)
    .eq('consumer_id', session.user.id)
  if (error) return { ok: false, error: 'Could not save the address. Please try again.' }
  const r = await startFullPayment(session.user.id, siteOrigin(await headers()))
  return r.ok ? r : { ok: false, error: r.error }
}
