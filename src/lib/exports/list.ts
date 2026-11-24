import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'

export type ExportRow = {
  id: string
  number: string
  version: number
  funderName: string
  createdAt: string
  createdBy: string
  people: number
  basic: number
  full: number
  replaced: boolean
  isTest: boolean
  /** The export queue it came from (EXP-…), when made from the waiting list. */
  queue: string | null
  decisions: { pending: number; approved: number; declined: number; needs_info: number }
}

/** Admin → Exports: every batch sent to any funder, newest first. */
export async function exportsList(includeTest: boolean): Promise<ExportRow[]> {
  const admin = createAdminClient()
  let q = admin
    .from('funder_batches')
    .select(
      'id, number, version, created_at, created_by, replaced_by, is_test, export_queue_id, funder_id, funders(name)',
    )
    .order('created_at', { ascending: false })
    .limit(500)
  if (!includeTest) q = q.eq('is_test', false)
  const { data: batches } = await q
  const ids = (batches ?? []).map((b) => b.id)
  const [{ data: items }, { data: people }, { data: queues }] = await Promise.all([
    ids.length
      ? admin.from('funder_batch_items').select('batch_id, level, decision').in('batch_id', ids)
      : Promise.resolve({ data: [] as { batch_id: string; level: string; decision: string }[] }),
    admin
      .from('profiles')
      .select('id, full_name, email')
      .in('id', [...new Set((batches ?? []).map((b) => b.created_by))]),
    admin
      .from('export_queues')
      .select('id, number')
      .in(
        'id',
        (batches ?? []).map((b) => b.export_queue_id).filter((v): v is string => Boolean(v)),
      ),
  ])
  const who = new Map((people ?? []).map((p) => [p.id, p.full_name ?? p.email ?? 'Staff']))
  const queueNo = new Map((queues ?? []).map((x) => [x.id, x.number]))
  return (batches ?? []).map((b) => {
    const mine = (items ?? []).filter((i) => i.batch_id === b.id)
    const count = (d: string) => mine.filter((i) => i.decision === d).length
    return {
      id: b.id,
      number: b.number,
      version: b.version,
      funderName: (b.funders as { name: string } | null)?.name ?? 'Funder',
      createdAt: b.created_at,
      createdBy: who.get(b.created_by) ?? 'Staff',
      people: mine.length,
      basic: mine.filter((i) => i.level === 'basic').length,
      full: mine.filter((i) => i.level !== 'basic').length,
      replaced: Boolean(b.replaced_by),
      isTest: b.is_test,
      queue: b.export_queue_id ? (queueNo.get(b.export_queue_id) ?? null) : null,
      decisions: {
        pending: count('pending'),
        approved: count('approved'),
        declined: count('declined'),
        needs_info: count('needs_info'),
      },
    }
  })
}

export type ExportedMark = {
  funderName: string
  batch: string
  at: string
  level: 'basic' | 'full'
  by: string
}

/** For the waiting list's "Exported" badge: every export of each person (all funders). */
export async function exportsByLead(ids: string[]): Promise<Record<string, ExportedMark[]>> {
  if (ids.length === 0) return {}
  const admin = createAdminClient()
  const out: Record<string, ExportedMark[]> = {}
  for (let i = 0; i < ids.length; i += 200) {
    const { data: items } = await admin
      .from('funder_batch_items')
      .select(
        'waitlist_id, level, created_at, funder_batches(number, version, created_by, funders(name))',
      )
      .in('waitlist_id', ids.slice(i, i + 200))
    const creators = [
      ...new Set(
        (items ?? [])
          .map((x) => (x.funder_batches as { created_by: string } | null)?.created_by)
          .filter(Boolean),
      ),
    ] as string[]
    const { data: people } = creators.length
      ? await admin.from('profiles').select('id, full_name, email').in('id', creators)
      : { data: [] }
    const who = new Map((people ?? []).map((p) => [p.id, p.full_name ?? p.email ?? 'Staff']))
    for (const x of items ?? []) {
      const b = x.funder_batches as {
        number: string
        version: number
        created_by: string
        funders: { name: string } | null
      } | null
      if (!b) continue
      ;(out[x.waitlist_id] ??= []).push({
        funderName: b.funders?.name ?? 'Funder',
        batch: `${b.number}${b.version > 1 ? ` v${b.version}` : ''}`,
        at: x.created_at,
        level: x.level === 'basic' ? 'basic' : 'full',
        by: who.get(b.created_by) ?? 'Staff',
      })
    }
  }
  return out
}
