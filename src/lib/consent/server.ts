import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'

import type { ConsentKind } from './texts'

export type ConsentRow = {
  subjectType: 'profile' | 'guarantee' | 'waitlist_lead' | 'installer_lead'
  subjectId: string
  profileId?: string | null
  ip?: string | null
  consent: { kind: ConsentKind; text_version: string; text_sha256: string }
}

/** Store consents with the time and the exact text version (never blocks the user's step). */
export async function recordConsents(rows: ConsentRow[]): Promise<void> {
  if (!rows.length) return
  const { error } = await createAdminClient()
    .from('consents')
    .insert(
      rows.map((r) => ({
        subject_type: r.subjectType,
        subject_id: r.subjectId,
        profile_id: r.profileId ?? null,
        ip: r.ip ?? null,
        ...r.consent,
      })),
    )
  if (error) console.error('[consents] could not record:', error.code)
}
