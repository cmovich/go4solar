'use server'

import { revalidatePath } from 'next/cache'

import { getSessionInfo } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Json } from '@/lib/supabase/database.types'
import { createClient } from '@/lib/supabase/server'
import { visionSettingsSchema } from '@/lib/vision/spend'

type Result = { ok: true } | { ok: false; error: string }

/** Photo lookup settings (super admin, two-factor); one audit row with before and after. */
export async function saveVisionSettings(input: unknown): Promise<Result> {
  const session = await getSessionInfo()
  if (!session.user || session.role !== 'super_admin' || session.aal !== 'aal2') {
    return { ok: false, error: 'Only a super admin can change the photo lookup.' }
  }
  const p = visionSettingsSchema.safeParse(input)
  if (!p.success) {
    const issue = p.error.issues[0]
    return { ok: false, error: `Check ${issue?.path.join('.') || 'the form'}: ${issue?.message}` }
  }
  const value = { ...p.data, sample: false }
  const supabase = await createClient()
  const { data: before } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'vision')
    .maybeSingle()
  const { error } = await supabase.from('settings').upsert({
    key: 'vision',
    value: value as unknown as Json,
    updated_by: session.user.id,
    updated_at: new Date().toISOString(),
  })
  if (error) return { ok: false, error: 'Could not save. Please try again.' }
  const { error: auditError } = await createAdminClient()
    .from('audit_log')
    .insert({
      actor_id: session.user.id,
      action: 'vision.settings.update',
      entity: 'settings.vision',
      entity_id: null,
      before: (before?.value ?? null) as Json,
      after: value as unknown as Json,
    })
  if (auditError) console.error('[audit] insert failed:', auditError.message)
  revalidatePath('/admin/photo-lookup')
  return { ok: true }
}
