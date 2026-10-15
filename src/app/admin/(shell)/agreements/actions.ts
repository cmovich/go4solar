'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { getSessionInfo } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Json } from '@/lib/supabase/database.types'

type Result = { ok: true; id: string } | { ok: false; error: string }

async function superAdmin() {
  const s = await getSessionInfo()
  return s.user && s.role === 'super_admin' && s.aal === 'aal2' ? s.user.id : null
}

async function audit(actorId: string, action: string, id: string, before: unknown, after: unknown) {
  await createAdminClient()
    .from('audit_log')
    .insert({
      actor_id: actorId,
      action,
      entity: 'agreement_templates',
      entity_id: id,
      before: before as Json,
      after: after as Json,
    })
}

const versionSchema = z.object({
  type: z.enum(['consumer', 'guarantor', 'installer', 'vendor']),
  body: z.string().trim().min(50, 'The agreement text is too short').max(100_000),
})

/** Save a new draft version (versions are never edited after approval). */
export async function createTemplateVersion(input: unknown): Promise<Result> {
  const actor = await superAdmin()
  if (!actor) return { ok: false, error: 'Only a super admin can change agreements.' }
  const p = versionSchema.safeParse(input)
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? 'Check the text.' }
  const admin = createAdminClient()
  const { data: latest } = await admin
    .from('agreement_templates')
    .select('version')
    .eq('type', p.data.type)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()
  const body = p.data.body.includes('DRAFT — lawyer review required')
    ? p.data.body
    : p.data.body.replace(/^(# .*\n)/, '$1\n**DRAFT — lawyer review required**\n')
  const row = {
    type: p.data.type,
    version: (latest?.version ?? 0) + 1,
    body_md: body,
    status: 'draft' as const,
  }
  const { data, error } = await admin.from('agreement_templates').insert(row).select('id').single()
  if (error) return { ok: false, error: error.message }
  await audit(actor, 'agreement_templates.create', data.id, null, {
    type: row.type,
    version: row.version,
  })
  revalidatePath('/admin/agreements')
  return { ok: true, id: data.id }
}

/** Mark a draft version approved: from now on new signers get it (without the DRAFT notice). */
export async function approveTemplate(id: unknown): Promise<Result> {
  const actor = await superAdmin()
  if (!actor) return { ok: false, error: 'Only a super admin can approve agreements.' }
  const p = z.uuid().safeParse(id)
  if (!p.success) return { ok: false, error: 'Unknown template.' }
  const admin = createAdminClient()
  const { data: before } = await admin
    .from('agreement_templates')
    .select('id, type, version, status')
    .eq('id', p.data)
    .maybeSingle()
  if (!before) return { ok: false, error: 'Unknown template.' }
  if (before.status === 'approved') return { ok: true, id: before.id }
  const after = {
    status: 'approved' as const,
    approved_by: actor,
    approved_at: new Date().toISOString(),
    effective_from: new Date().toISOString(),
  }
  const { error } = await admin.from('agreement_templates').update(after).eq('id', p.data)
  if (error) return { ok: false, error: error.message }
  await audit(actor, 'agreement_templates.approve', before.id, before, { ...before, ...after })
  revalidatePath('/admin/agreements')
  return { ok: true, id: before.id }
}
