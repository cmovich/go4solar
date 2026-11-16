'use server'

import { revalidatePath } from 'next/cache'

import { getSessionInfo } from '@/lib/auth/session'
import { decideFunderQueue, recordCheques, type DecisionResult } from '@/lib/funderQueue/server'

type Fail = { ok: false; error: string }

async function actor() {
  const s = await getSessionInfo()
  return s.user && s.aal === 'aal2' ? { id: s.user.id, role: s.role } : null
}

/** Approve or decline one or more files in the SPEWA queue (each audited on its own). */
export async function decideSpewaFiles(input: {
  ids: string[]
  decision: 'approve' | 'decline'
  reason?: string
}): Promise<Fail | { ok: true; results: DecisionResult[] }> {
  const a = await actor()
  if (!a) return { ok: false, error: 'Sign in with two-factor first.' }
  const res = await decideFunderQueue(input, a)
  revalidatePath('/admin/spewa')
  for (const id of input.ids) revalidatePath(`/admin/spewa/${id}`)
  return res
}

/** Post-dated cheques note (our staff). */
export async function saveCheques(
  applicationId: string,
  input: { received: string; count?: string; receivedOn?: string },
): Promise<Fail | { ok: true }> {
  const a = await actor()
  if (!a) return { ok: false, error: 'Sign in with two-factor first.' }
  const res = await recordCheques(applicationId, input, a)
  revalidatePath(`/admin/spewa/${applicationId}`)
  revalidatePath('/admin/spewa')
  return res
}
