import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import type { Database } from '@/lib/supabase/database.types'

type Job = Database['public']['Tables']['jobs']['Row']

const nameOf = (personal: unknown) => {
  const p = (personal ?? {}) as {
    firstName?: string
    surname?: string
    state?: string
    phone?: string
  }
  return {
    name: [p.firstName, p.surname].filter(Boolean).join(' ') || 'Customer',
    state: p.state ?? null,
    phone: p.phone ?? null,
  }
}

/** Approved loans still without a job, and all jobs with their customer. */
export async function jobsOverview() {
  const admin = createAdminClient()
  const [{ data: loans }, { data: jobs }] = await Promise.all([
    admin
      .from('loans')
      .select('id, application_id, status, approved_at')
      .in('status', ['approved', 'active']),
    admin.from('jobs').select('*').order('created_at', { ascending: false }),
  ])
  const appIds = (loans ?? []).map((l) => l.application_id)
  const { data: apps } = appIds.length
    ? await admin.from('applications').select('id, personal').in('id', appIds)
    : { data: [] }
  const who = new Map((apps ?? []).map((a) => [a.id, nameOf(a.personal)]))
  const loanApp = new Map((loans ?? []).map((l) => [l.id, l.application_id]))
  const withJob = new Set((jobs ?? []).map((j) => j.loan_id))
  return {
    waiting: (loans ?? [])
      .filter((l) => l.status === 'approved' && !withJob.has(l.id))
      .map((l) => ({ loanId: l.id, approvedAt: l.approved_at, ...who.get(l.application_id)! })),
    jobs: (jobs ?? []).map((j) => ({
      ...j,
      customer: who.get(loanApp.get(j.loan_id) ?? '') ?? null,
    })),
  }
}

export async function jobDetail(id: string): Promise<
  | (Job & {
      customer: { name: string; state: string | null; phone: string | null }
      applicationId: string
      approvedBy: string | null
      photoUrls: { path: string; url: string | null }[]
    })
  | null
> {
  const admin = createAdminClient()
  const { data: job } = await admin.from('jobs').select('*').eq('id', id).maybeSingle()
  if (!job) return null
  const { data: loan } = await admin
    .from('loans')
    .select('application_id, approved_by')
    .eq('id', job.loan_id)
    .single()
  const { data: app } = await admin
    .from('applications')
    .select('personal')
    .eq('id', loan!.application_id)
    .single()
  const photoUrls = await Promise.all(
    (job.photos ?? []).map(async (path) => ({
      path,
      url: (await admin.storage.from('jobs').createSignedUrl(path, 600)).data?.signedUrl ?? null,
    })),
  )
  return {
    ...job,
    customer: nameOf(app?.personal),
    applicationId: loan!.application_id,
    approvedBy: loan!.approved_by,
    photoUrls,
  }
}
