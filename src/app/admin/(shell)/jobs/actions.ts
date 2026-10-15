'use server'

import { revalidatePath } from 'next/cache'

import { staffActor } from '@/lib/auth/staffActor'
import {
  addJobPhoto,
  assignJob,
  confirmPayout,
  confirmPickup,
  markInstalled,
  recordSerials,
  setScheduledDate,
  type Serials,
} from '@/lib/jobs/server'

type Result = { ok: true } | { ok: false; error: string }
const SIGN_IN = { ok: false, error: 'Please sign in with two-factor first.' } as const

const refresh = (jobId?: string) => {
  revalidatePath('/admin/jobs')
  if (jobId) revalidatePath(`/admin/jobs/${jobId}`)
}

export async function assign(input: {
  loanId: string
  installerName: string
  installerPhone: string
  equipmentSource: 'go4solar_store' | 'vendor'
  vendorName: string | null
  scheduledDate: string | null
}): Promise<Result> {
  const actor = await staffActor()
  if (!actor) return SIGN_IN
  const r = await assignJob({ ...input, actor })
  refresh()
  return r
}

export async function schedule(jobId: string, date: string): Promise<Result> {
  const actor = await staffActor()
  if (!actor) return SIGN_IN
  const r = await setScheduledDate({ jobId, date, actor })
  refresh(jobId)
  return r
}

export async function pickup(jobId: string, code: string): Promise<Result> {
  const actor = await staffActor()
  if (!actor) return SIGN_IN
  const r = await confirmPickup({ jobId, code, actor })
  refresh(jobId)
  return r
}

export async function saveSerials(jobId: string, serials: Serials): Promise<Result> {
  const actor = await staffActor()
  if (!actor) return SIGN_IN
  const r = await recordSerials({ jobId, serials, actor })
  refresh(jobId)
  return r
}

export async function uploadPhoto(form: FormData): Promise<Result> {
  const actor = await staffActor()
  if (!actor) return SIGN_IN
  const jobId = String(form.get('jobId') ?? '')
  const file = form.get('photo')
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: 'Choose a photo.' }
  const r = await addJobPhoto({
    jobId,
    bytes: Buffer.from(await file.arrayBuffer()),
    contentType: file.type,
    actor,
  })
  refresh(jobId)
  return r
}

export async function installed(jobId: string): Promise<Result> {
  const actor = await staffActor()
  if (!actor) return SIGN_IN
  const r = await markInstalled({ jobId, actor })
  refresh(jobId)
  return r
}

export async function payout(jobId: string): Promise<Result> {
  const actor = await staffActor()
  if (!actor) return SIGN_IN
  const r = await confirmPayout({ jobId, actor })
  refresh(jobId)
  return r
}
