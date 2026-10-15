import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import type { Json } from '@/lib/supabase/database.types'

import { CLEARED_GRACE_DAYS, FAILED_KYC_DAYS, selectForPurge } from './rules'

export type RetentionCounts = {
  kycImages: number
  waitlistConsumers: number
  waitlistInstallers: number
}

/**
 * Data retention (PRD "deletion schedule"; privacy policy "How long we keep it"). Deletes only what
 * selectForPurge picks. dryRun counts and deletes nothing. Every run writes one audit_log row.
 */
export async function runRetention(opts: {
  dryRun: boolean
  now?: Date
}): Promise<RetentionCounts & { dryRun: boolean }> {
  const now = opts.now ?? new Date()
  const admin = createAdminClient()
  const [apps, checks, docs, consumers, installers] = await Promise.all([
    admin.from('applications').select('id, status').in('status', ['draft', 'declined']),
    admin
      .from('kyc_checks')
      .select('subject_id, kind, status, created_at')
      .in('kind', ['nin', 'cac']),
    admin
      .from('documents')
      .select('id, application_id, kind, storage_path')
      .in('kind', ['nin_front', 'nin_back', 'cac_certificate']),
    admin.from('waitlist_consumers').select('id, cleared_at').not('cleared_at', 'is', null),
    admin.from('waitlist_installers').select('id, cleared_at').not('cleared_at', 'is', null),
  ])
  const picked = selectForPurge(
    {
      applications: apps.data ?? [],
      checks: (checks.data ?? []).map((c) => ({
        subjectId: c.subject_id,
        kind: c.kind,
        status: c.status,
        createdAt: c.created_at,
      })),
      documents: (docs.data ?? []).map((d) => ({
        id: d.id,
        applicationId: d.application_id,
        kind: d.kind,
        storagePath: d.storage_path,
      })),
      waitlist: [
        ...(consumers.data ?? []).map((w) => ({
          id: w.id,
          table: 'waitlist_consumers' as const,
          clearedAt: w.cleared_at,
        })),
        ...(installers.data ?? []).map((w) => ({
          id: w.id,
          table: 'waitlist_installers' as const,
          clearedAt: w.cleared_at,
        })),
      ],
    },
    now,
  )
  const counts: RetentionCounts = {
    kycImages: picked.kycDocuments.length,
    waitlistConsumers: picked.waitlist.filter((w) => w.table === 'waitlist_consumers').length,
    waitlistInstallers: picked.waitlist.filter((w) => w.table === 'waitlist_installers').length,
  }

  let errors = 0
  if (!opts.dryRun) {
    if (picked.kycDocuments.length) {
      const removed = await admin.storage
        .from('kyc')
        .remove(picked.kycDocuments.map((d) => d.storagePath))
      if (removed.error) errors++
      const del = await admin
        .from('documents')
        .delete()
        .in(
          'id',
          picked.kycDocuments.map((d) => d.id),
        )
      if (del.error) errors++
    }
    for (const table of ['waitlist_consumers', 'waitlist_installers'] as const) {
      const ids = picked.waitlist.filter((w) => w.table === table).map((w) => w.id)
      if (ids.length) {
        const del = await admin.from(table).delete().in('id', ids).not('cleared_at', 'is', null)
        if (del.error) errors++
      }
    }
  }
  await admin.from('audit_log').insert({
    actor_id: null,
    action: opts.dryRun ? 'retention.dry_run' : 'retention.run',
    entity: 'retention',
    entity_id: null,
    before: null,
    after: {
      ...counts,
      errors,
      rules: { failedKycDays: FAILED_KYC_DAYS, clearedGraceDays: CLEARED_GRACE_DAYS },
    } as unknown as Json,
  })
  return { ...counts, dryRun: opts.dryRun }
}
