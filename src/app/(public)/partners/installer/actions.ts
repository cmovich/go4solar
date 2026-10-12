'use server'

import { headers } from 'next/headers'

import { recordConsents } from '@/lib/consent/server'
import { consentRecord } from '@/lib/consent/texts'
import { clientIp } from '@/lib/ratelimit/clientIp'
import { hitRateLimit } from '@/lib/ratelimit/hitRateLimit'
import { createAdminClient } from '@/lib/supabase/admin'
import { installerSchema } from '@/lib/waitlist/schema'

export type InstallerResult =
  { ok: true; name: string } | { ok: false; error: string; field?: string }

/** Prelaunch installer sign-up (PRD "Installer waiting-list flow"). */
export async function submitInstaller(input: unknown): Promise<InstallerResult> {
  const parsed = installerSchema.safeParse(input)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return {
      ok: false,
      error: issue?.message ?? 'Please check the form',
      field: issue?.path[0]?.toString(),
    }
  }
  const d = parsed.data

  const ip = clientIp(await headers())
  if (!(await hitRateLimit(`waitlist:${ip}`, 20, '1 hour'))) {
    return {
      ok: false,
      error: 'Too many sign-ups from your connection. Please try again in an hour.',
    }
  }

  const { data: created, error } = await createAdminClient()
    .from('waitlist_installers')
    .insert({
      name: d.name,
      business_name: d.businessName || null,
      phone_e164: d.phone,
      whatsapp_e164: d.whatsapp ?? d.phone,
      email: d.email || null,
      states: d.states,
      lgas: d.lgas || null,
      years_in_business: d.yearsInBusiness,
      installations_completed: d.installationsCompleted,
      cac_registered: d.cacRegistered,
      consent: true,
      consent_at: new Date().toISOString(),
    })
    .select('id')
    .single()
  if (error) {
    console.error('[waitlist] installer insert failed:', error.message)
    return { ok: false, error: 'Something went wrong. Please try again.' }
  }
  await recordConsents([
    { subjectType: 'installer_lead', subjectId: created.id, ip, consent: consentRecord('contact') },
  ])
  return { ok: true, name: d.name }
}
