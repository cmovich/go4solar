'use server'

import { revalidatePath } from 'next/cache'

import { getSessionInfo } from '@/lib/auth/session'
import { companyFormSchema } from '@/lib/company/schema'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Json } from '@/lib/supabase/database.types'
import { createClient } from '@/lib/supabase/server'

type Result = { ok: true } | { ok: false; error: string }

/**
 * Company details and quote validity (super admin, two-factor). Written under RLS as the staff
 * member; one audit row with before and after (the database trigger also logs each row).
 */
export async function saveCompany(input: unknown): Promise<Result> {
  const session = await getSessionInfo()
  if (!session.user || session.role !== 'super_admin' || session.aal !== 'aal2') {
    return { ok: false, error: 'Only a super admin can change the company details.' }
  }
  const p = companyFormSchema.safeParse(input)
  if (!p.success) {
    const issue = p.error.issues[0]
    return { ok: false, error: `Check ${issue?.path.join('.') || 'the form'}: ${issue?.message}` }
  }
  const { quoteValidityDays, ...company } = p.data
  const supabase = await createClient()
  const { data: before } = await supabase
    .from('settings')
    .select('key, value')
    .in('key', ['company', 'quote_validity_days'])
  const now = new Date().toISOString()
  const { error } = await supabase.from('settings').upsert([
    {
      key: 'company',
      value: company as unknown as Json,
      updated_by: session.user.id,
      updated_at: now,
    },
    {
      key: 'quote_validity_days',
      value: quoteValidityDays,
      updated_by: session.user.id,
      updated_at: now,
    },
  ])
  if (error) return { ok: false, error: 'Could not save. Please try again.' }
  const { error: auditError } = await createAdminClient()
    .from('audit_log')
    .insert({
      actor_id: session.user.id,
      action: 'company.update',
      entity: 'settings.company',
      entity_id: null,
      before: Object.fromEntries((before ?? []).map((r) => [r.key, r.value])) as Json,
      after: { company, quote_validity_days: quoteValidityDays } as unknown as Json,
    })
  if (auditError) console.error('[audit] insert failed:', auditError.message)
  revalidatePath('/admin/company')
  // The footer and legal pages show these details too.
  revalidatePath('/')
  revalidatePath('/privacy')
  revalidatePath('/terms')
  return { ok: true }
}
