import 'server-only'

import { randomInt, randomUUID } from 'node:crypto'

import { z } from 'zod'

import { canConfirmPayout, rebaseDueDates } from '@/lib/approvals/rules'
import { normalisePhoneNG } from '@/lib/money'
import { contactFromPersonal, notifyCustomer } from '@/lib/notify/customer'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Database, Json } from '@/lib/supabase/database.types'

type Role = Database['public']['Enums']['app_role']
export type Actor = { id: string; role: Role | null }
type Result = { ok: true } | { ok: false; error: string }
type Job = Database['public']['Tables']['jobs']['Row']

const OPERATORS: Role[] = ['operations', 'super_admin']
const PAYERS: Role[] = ['finance', 'super_admin']
const NO = (who: string) => ({ ok: false as const, error: `Only ${who} can do this.` })

export const lagosDate = (d: Date) =>
  new Date(d.getTime() + 60 * 60 * 1000).toISOString().slice(0, 10)
export const longDate = (iso: string) =>
  new Date(`${iso}T12:00:00+01:00`).toLocaleDateString('en-GB', {
    timeZone: 'Africa/Lagos',
    dateStyle: 'long',
  })

async function audit(actor: Actor, action: string, id: string, before: unknown, after: unknown) {
  await createAdminClient()
    .from('audit_log')
    .insert({
      actor_id: actor.id,
      action,
      entity: 'jobs',
      entity_id: id,
      before: before as Json,
      after: after as Json,
    })
}

/** The customer behind a loan (for messages). */
async function customerOf(loanId: string) {
  const admin = createAdminClient()
  const { data: loan } = await admin
    .from('loans')
    .select('application_id')
    .eq('id', loanId)
    .maybeSingle()
  if (!loan) return null
  const { data: app } = await admin
    .from('applications')
    .select('personal')
    .eq('id', loan.application_id)
    .maybeSingle()
  return app ? contactFromPersonal(app.personal) : null
}

async function job(jobId: string): Promise<Job | null> {
  const { data } = await createAdminClient().from('jobs').select('*').eq('id', jobId).maybeSingle()
  return data
}

// ------------------------------------------------------------ assignment
const assignSchema = z
  .object({
    loanId: z.string().min(1),
    installerName: z.string().trim().min(2, 'Enter the installer').max(120),
    installerPhone: z.string().trim(),
    equipmentSource: z.enum(['go4solar_store', 'vendor']),
    vendorName: z.string().trim().max(120).nullable(),
    scheduledDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable(),
  })
  .refine(
    (v) => v.equipmentSource === 'go4solar_store' || (v.vendorName && v.vendorName.length >= 2),
    {
      message: 'Name the vendor supplying the equipment.',
    },
  )

/** Phase 1: staff assign an installer by hand and get a one-time pickup code for the equipment. */
export async function assignJob(
  input: z.input<typeof assignSchema> & { actor: Actor },
): Promise<Result> {
  if (!input.actor.role || !OPERATORS.includes(input.actor.role)) return NO('operations')
  const p = assignSchema.safeParse(input)
  if (!p.success)
    return { ok: false, error: p.error.issues[0]?.message ?? 'Check the job details.' }
  let phone: string
  try {
    phone = normalisePhoneNG(p.data.installerPhone)
  } catch {
    return { ok: false, error: "Enter the installer's Nigerian mobile number." }
  }
  const admin = createAdminClient()
  const { data: loan } = await admin
    .from('loans')
    .select('id, status')
    .eq('id', p.data.loanId)
    .maybeSingle()
  if (loan?.status !== 'approved')
    return { ok: false, error: 'Only approved loans can get an installation job.' }
  const row = {
    loan_id: loan.id,
    installer_name: p.data.installerName,
    installer_phone: phone,
    equipment_source: p.data.equipmentSource,
    vendor_name: p.data.equipmentSource === 'vendor' ? p.data.vendorName : null,
    pickup_code: String(randomInt(0, 1_000_000)).padStart(6, '0'),
    scheduled_date: p.data.scheduledDate,
    status: 'assigned' as const,
    serials: {},
    photos: [],
    assigned_by: input.actor.id,
  }
  const { data: created, error } = await admin.from('jobs').insert(row).select('id').single()
  if (error || !created) return { ok: false, error: 'This loan already has a job.' }
  await audit(input.actor, 'job.assign', String(created.id), null, {
    ...row,
    pickup_code: '••••••',
  })
  const c = await customerOf(loan.id)
  if (c) {
    const when = p.data.scheduledDate
      ? ` on ${longDate(p.data.scheduledDate)}`
      : '. We will confirm the date with you'
    await notifyCustomer(c, 'installer_assigned', {
      subject: 'Your installer is booked',
      text: `Hi ${c.firstName}, ${p.data.installerName} (${phone}) will install your Go4Solar system${when}.`,
    })
  }
  return { ok: true }
}

export async function setScheduledDate(input: {
  jobId: string
  date: string
  actor: Actor
}): Promise<Result> {
  if (!input.actor.role || !OPERATORS.includes(input.actor.role)) return NO('operations')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return { ok: false, error: 'Pick a date.' }
  const j = await job(input.jobId)
  if (!j || j.status === 'commissioned')
    return { ok: false, error: 'Job not found or already finished.' }
  await createAdminClient().from('jobs').update({ scheduled_date: input.date }).eq('id', j.id)
  await audit(
    input.actor,
    'job.schedule',
    j.id,
    { scheduled_date: j.scheduled_date },
    { scheduled_date: input.date },
  )
  const c = await customerOf(j.loan_id)
  if (c) {
    await notifyCustomer(c, 'installation_scheduled', {
      subject: 'Your installation date',
      text: `Hi ${c.firstName}, your Go4Solar system will be installed on ${longDate(input.date)} by ${j.installer_name}.`,
    })
  }
  return { ok: true }
}

/** Store staff / vendor enter the installer's pickup code before releasing the equipment. */
export async function confirmPickup(input: {
  jobId: string
  code: string
  actor: Actor
}): Promise<Result> {
  if (!input.actor.role || !OPERATORS.includes(input.actor.role)) return NO('operations')
  const j = await job(input.jobId)
  if (!j || j.status !== 'assigned')
    return { ok: false, error: 'This job is not waiting for pickup.' }
  if (input.code.trim() !== j.pickup_code)
    return { ok: false, error: 'That pickup code is not right.' }
  await createAdminClient()
    .from('jobs')
    .update({ status: 'picked_up', picked_up_at: new Date().toISOString() })
    .eq('id', j.id)
  await audit(input.actor, 'job.picked_up', j.id, { status: j.status }, { status: 'picked_up' })
  return { ok: true }
}

// ------------------------------------------------------------ installation record
const serialList = z.array(z.string().trim().min(3).max(64)).max(60)
const serialsSchema = z.object({ panels: serialList, batteries: serialList, inverters: serialList })
export type Serials = z.infer<typeof serialsSchema>

export async function recordSerials(input: {
  jobId: string
  serials: Serials
  actor: Actor
}): Promise<Result> {
  if (!input.actor.role || !OPERATORS.includes(input.actor.role)) return NO('operations')
  const p = serialsSchema.safeParse(input.serials)
  if (!p.success) return { ok: false, error: 'Serial numbers are 3 to 64 characters.' }
  const j = await job(input.jobId)
  if (!j || j.status === 'commissioned')
    return { ok: false, error: 'Job not found or already commissioned.' }
  await createAdminClient()
    .from('jobs')
    .update({ serials: p.data as Json })
    .eq('id', j.id)
  await audit(input.actor, 'job.serials', j.id, j.serials, p.data)
  return { ok: true }
}

const PHOTO_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

export async function addJobPhoto(input: {
  jobId: string
  bytes: Buffer
  contentType: string
  actor: Actor
}): Promise<Result> {
  if (!input.actor.role || !OPERATORS.includes(input.actor.role)) return NO('operations')
  const ext = PHOTO_TYPES[input.contentType]
  if (!ext || input.bytes.length > 10 * 1024 * 1024)
    return { ok: false, error: 'Photos must be JPG, PNG or WebP, up to 10 MB.' }
  const j = await job(input.jobId)
  if (!j || j.status === 'commissioned')
    return { ok: false, error: 'Job not found or already commissioned.' }
  const path = `${j.id}/${randomUUID()}.${ext}`
  const admin = createAdminClient()
  const up = await admin.storage
    .from('jobs')
    .upload(path, input.bytes, { contentType: input.contentType })
  if (up.error) return { ok: false, error: 'Could not store the photo.' }
  await admin
    .from('jobs')
    .update({ photos: [...(j.photos ?? []), path] })
    .eq('id', j.id)
  await audit(input.actor, 'job.photo', j.id, null, { path })
  return { ok: true }
}

export async function markInstalled(input: { jobId: string; actor: Actor }): Promise<Result> {
  if (!input.actor.role || !OPERATORS.includes(input.actor.role)) return NO('operations')
  const j = await job(input.jobId)
  if (!j || (j.status !== 'assigned' && j.status !== 'picked_up'))
    return { ok: false, error: 'This job cannot be marked installed.' }
  const s = serialsSchema.safeParse(j.serials)
  if (!s.success || !s.data.panels.length || !s.data.batteries.length || !s.data.inverters.length) {
    return {
      ok: false,
      error: 'Record the serial numbers of the panels, battery and inverter first.',
    }
  }
  if (!(j.photos ?? []).length)
    return { ok: false, error: 'Add at least one commissioning photo first.' }
  await createAdminClient()
    .from('jobs')
    .update({ status: 'installed', installed_at: new Date().toISOString() })
    .eq('id', j.id)
  await audit(input.actor, 'job.installed', j.id, { status: j.status }, { status: 'installed' })
  const c = await customerOf(j.loan_id)
  if (c) {
    await notifyCustomer(c, 'installation_done', {
      subject: 'Your system is installed: please confirm',
      text: `Hi ${c.firstName}, your Go4Solar system is installed. Please open your dashboard and confirm it is working.`,
    })
  }
  return { ok: true }
}

// ------------------------------------------------------------ customer sign-off
/**
 * "My system is installed and working": the job is commissioned, the plan starts (loan active)
 * and the schedule moves to one month after today (same day of the month, month-end safe).
 */
export async function customerSignOff(userId: string): Promise<Result> {
  const admin = createAdminClient()
  const { data: loan } = await admin
    .from('loans')
    .select('id, application_id, status')
    .eq('consumer_id', userId)
    .eq('status', 'approved')
    .limit(1)
    .maybeSingle()
  if (!loan) return { ok: false, error: 'There is no installation to confirm.' }
  const { data: j } = await admin.from('jobs').select('*').eq('loan_id', loan.id).maybeSingle()
  if (!j || j.status !== 'installed')
    return { ok: false, error: 'Your system has not been marked installed yet.' }

  const now = new Date()
  const nowIso = now.toISOString()
  const { data: won } = await admin
    .from('jobs')
    .update({ status: 'commissioned', customer_signoff_at: nowIso, commissioned_at: nowIso })
    .eq('id', j.id)
    .eq('status', 'installed')
    .select('id')
  if (!won?.length) return { ok: false, error: 'Already confirmed.' }

  const { data: rows } = await admin
    .from('repayment_schedule')
    .select('id, n')
    .eq('loan_id', loan.id)
    .order('n')
  const dates = rebaseDueDates((rows ?? []).length, now)
  for (const r of rows ?? []) {
    await admin
      .from('repayment_schedule')
      .update({ due_date: dates[r.n - 1]! })
      .eq('id', r.id)
  }
  await admin
    .from('loans')
    .update({ status: 'active', start_date: lagosDate(now) })
    .eq('id', loan.id)
  await audit(
    { id: userId, role: 'consumer' },
    'job.customer_signoff',
    j.id,
    { status: 'installed' },
    { status: 'commissioned' },
  )

  const c = await customerOf(loan.id)
  if (c && dates[0]) {
    await notifyCustomer(c, 'plan_started', {
      subject: 'Thank you: your payment plan has started',
      text: `Thank you, ${c.firstName}. Your solar system is confirmed. Your first monthly payment is due on ${longDate(dates[0])}.`,
    })
  }
  return { ok: true }
}

// ------------------------------------------------------------ payout (separation of duties)
export async function confirmPayout(input: { jobId: string; actor: Actor }): Promise<Result> {
  if (!input.actor.role || !PAYERS.includes(input.actor.role)) return NO('finance')
  const admin = createAdminClient()
  const j = await job(input.jobId)
  if (!j) return { ok: false, error: 'Job not found.' }
  const { data: loan } = await admin
    .from('loans')
    .select('approved_by')
    .eq('id', j.loan_id)
    .maybeSingle()
  const rule = canConfirmPayout({
    actorId: input.actor.id,
    approvedBy: loan?.approved_by ?? null,
    jobStatus: j.status,
  })
  if (!rule.allowed) return { ok: false, error: rule.reason! }
  const { data: won } = await admin
    .from('jobs')
    .update({ payout_confirmed_by: input.actor.id, payout_confirmed_at: new Date().toISOString() })
    .eq('id', j.id)
    .is('payout_confirmed_by', null)
    .select('id')
  if (!won?.length) return { ok: false, error: 'The payout is already confirmed.' }
  await audit(input.actor, 'job.payout_confirmed', j.id, null, { by: input.actor.id })
  return { ok: true }
}
